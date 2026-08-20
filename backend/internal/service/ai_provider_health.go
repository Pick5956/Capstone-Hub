package service

// Provider health: two failures that used to look identical in the logs and cost
// a full round of pointless retries.
//
//  1. A model that the provider has withdrawn answers 404 for EVERY key, so
//     rotating keys just burns latency. This happened in production with
//     llama-3.3-70b-versatile: 4 keys x 404 on every single question before the
//     fallback provider was reached. Model-unavailable now aborts rotation on the
//     first key and is reported as an operator-actionable error.
//
//  2. A key that is rate limited stays limited until its window resets. Groq
//     always returns the remaining budget in headers and adds `retry-after` on a
//     429, so a key that answers 429 is parked until that moment and skipped by
//     later calls. Only when every key is parked does the caller see a quota
//     error. Nothing is pre-flighted: a probe request would itself consume one of
//     the requests-per-day it is trying to protect. The headers ride along with
//     the calls that were happening anyway.

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// errModelUnavailable means the configured model name no longer exists at the
// provider. Rotating keys cannot fix it — the configuration has to change.
var errModelUnavailable = errors.New("model unavailable at provider")

// modelUnavailableError carries what the operator needs in order to fix it.
type modelUnavailableError struct {
	Provider string
	Model    string
}

func (e *modelUnavailableError) Error() string {
	return fmt.Sprintf("%s model %q no longer exists (HTTP 404) — update the model in configuration", e.Provider, e.Model)
}

func (e *modelUnavailableError) Is(target error) bool { return target == errModelUnavailable }

func newModelUnavailableError(provider, model string) error {
	return &modelUnavailableError{Provider: provider, Model: model}
}

// rateLimitedError carries how long the provider asked us to wait, so the
// rotation loop can park the key for exactly that long.
type rateLimitedError struct {
	Provider   string
	RetryAfter time.Duration
}

func (e *rateLimitedError) Error() string {
	return fmt.Sprintf("%s rate limited (retry after %s)", e.Provider, e.RetryAfter.Round(time.Second))
}

func (e *rateLimitedError) Is(target error) bool { return target == errRateLimit }

// retryAfterOf reports the wait a rate-limit error asked for.
func retryAfterOf(err error) time.Duration {
	var limited *rateLimitedError
	if errors.As(err, &limited) && limited.RetryAfter > 0 {
		return limited.RetryAfter
	}
	return defaultKeyCooldown
}

// defaultKeyCooldown is used when a 429 arrives without a usable `retry-after`.
const defaultKeyCooldown = time.Minute

// providerKeyHealth parks rate-limited keys until their window resets.
type providerKeyHealth struct {
	mu       sync.Mutex
	parked   map[string]time.Time
	nowFunc  func() time.Time // swapped in tests
	initOnce sync.Once
}

func (h *providerKeyHealth) init() {
	h.initOnce.Do(func() {
		if h.parked == nil {
			h.parked = make(map[string]time.Time)
		}
		if h.nowFunc == nil {
			h.nowFunc = time.Now
		}
	})
}

func (h *providerKeyHealth) now() time.Time {
	h.init()
	return h.nowFunc()
}

func keyHealthID(provider string, keyIndex int) string {
	return provider + "#" + strconv.Itoa(keyIndex)
}

// park marks a key unusable until `until`. A later reset never shortens an
// existing park, so the most pessimistic known reset wins.
func (h *providerKeyHealth) park(provider string, keyIndex int, until time.Time) {
	h.init()
	h.mu.Lock()
	defer h.mu.Unlock()
	id := keyHealthID(provider, keyIndex)
	if existing, ok := h.parked[id]; ok && existing.After(until) {
		return
	}
	h.parked[id] = until
}

// available reports whether the key can be tried now, and when it frees up if not.
func (h *providerKeyHealth) available(provider string, keyIndex int) (bool, time.Time) {
	h.init()
	h.mu.Lock()
	defer h.mu.Unlock()
	id := keyHealthID(provider, keyIndex)
	until, ok := h.parked[id]
	if !ok {
		return true, time.Time{}
	}
	if !until.After(h.nowFunc()) {
		delete(h.parked, id) // window has reset
		return true, time.Time{}
	}
	return false, until
}

// clear releases a key after a successful call.
func (h *providerKeyHealth) clear(provider string, keyIndex int) {
	h.init()
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.parked, keyHealthID(provider, keyIndex))
}

// earliestRelease reports when the first of the given keys frees up, so the
// caller can tell the owner how long to wait instead of a bare "quota exceeded".
func (h *providerKeyHealth) earliestRelease(provider string, keyCount int) time.Time {
	h.init()
	h.mu.Lock()
	defer h.mu.Unlock()
	var earliest time.Time
	for i := 0; i < keyCount; i++ {
		until, ok := h.parked[keyHealthID(provider, i)]
		if !ok {
			return time.Time{} // a key is already free
		}
		if earliest.IsZero() || until.Before(earliest) {
			earliest = until
		}
	}
	return earliest
}

// retryAfterFromHeaders reads how long to park a key. `retry-after` is only sent
// on a 429; x-ratelimit-reset-tokens ("7.66s") covers the per-minute window and
// is present on every response.
func retryAfterFromHeaders(header http.Header) time.Duration {
	if raw := strings.TrimSpace(header.Get("retry-after")); raw != "" {
		if seconds, err := strconv.ParseFloat(raw, 64); err == nil && seconds > 0 {
			return time.Duration(seconds * float64(time.Second))
		}
	}
	for _, name := range []string{"x-ratelimit-reset-tokens", "x-ratelimit-reset-requests"} {
		if d, ok := parseGoDurationHeader(header.Get(name)); ok {
			return d
		}
	}
	return defaultKeyCooldown
}

// parseGoDurationHeader reads Groq's "2m59.56s" / "7.66s" reset values.
func parseGoDurationHeader(raw string) (time.Duration, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, false
	}
	if d, err := time.ParseDuration(value); err == nil && d > 0 {
		return d, true
	}
	// Some responses report a bare number of seconds.
	if seconds, err := strconv.ParseFloat(value, 64); err == nil && seconds > 0 {
		return time.Duration(seconds * float64(time.Second)), true
	}
	return 0, false
}

// classifyProviderResponse turns a provider HTTP status into the error the
// rotation loops branch on. A nil result means the response is usable.
func classifyProviderResponse(provider, operation, model string, resp *http.Response) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	switch resp.StatusCode {
	case http.StatusTooManyRequests:
		return &rateLimitedError{Provider: provider, RetryAfter: retryAfterFromHeaders(resp.Header)}
	case http.StatusNotFound:
		// The endpoint is fixed and correct, so a 404 here means the model name
		// was not recognised — every key will answer the same way.
		return newModelUnavailableError(provider, model)
	}
	return newAIProviderHTTPError(provider, operation, resp.StatusCode)
}

// providerAttempt is one usable key handed to a rotation loop.
type providerAttempt struct {
	Key      string
	Index    int // 0-based position in the configured key list
	Position int // 1-based, for log lines
	Total    int
}

// nextProviderAttempts returns the keys worth trying right now, in rotation
// order, skipping any that are parked. An empty result means every key is rate
// limited; `releaseAt` then says when the first one frees up.
func nextProviderAttempts(
	health *providerKeyHealth,
	provider string,
	keys []string,
	cursor *uint32,
) (attempts []providerAttempt, releaseAt time.Time) {
	total := len(keys)
	if total == 0 {
		return nil, time.Time{}
	}
	start := atomic.AddUint32(cursor, 1) - 1
	for offset := 0; offset < total; offset++ {
		index := int((start + uint32(offset)) % uint32(total))
		if ok, _ := health.available(provider, index); !ok {
			continue
		}
		attempts = append(attempts, providerAttempt{
			Key:      keys[index],
			Index:    index,
			Position: index + 1,
			Total:    total,
		})
	}
	if len(attempts) == 0 {
		return nil, health.earliestRelease(provider, total)
	}
	return attempts, time.Time{}
}

// allKeysRateLimitedError explains the wait instead of a bare quota error. It
// wraps BOTH sentinels on purpose: the provider layer contract is errRateLimit
// (callers rotate or fall back on it), while the API layer answers 429 on
// ErrAIQuotaExceeded. Matching both keeps either check working.
func allKeysRateLimitedError(provider string, keyCount int, releaseAt time.Time) error {
	if releaseAt.IsZero() {
		aiStage("warn", "%s: all %d keys are rate limited", provider, keyCount)
		return fmt.Errorf("%w: all %d %s keys are rate limited (%w)", errRateLimit, keyCount, provider, ErrAIQuotaExceeded)
	}
	wait := time.Until(releaseAt).Round(time.Second)
	if wait < 0 {
		wait = 0
	}
	aiStage("warn", "%s: all %d keys are rate limited — first one frees up in %s", provider, keyCount, wait)
	return fmt.Errorf("%w: all %d %s keys are rate limited, retry in %s (%w)", errRateLimit, keyCount, provider, wait, ErrAIQuotaExceeded)
}
