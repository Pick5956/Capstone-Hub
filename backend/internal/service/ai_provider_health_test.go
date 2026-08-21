package service

import (
	"errors"
	"net/http"
	"testing"
	"time"
)

func responseWith(status int, header http.Header) *http.Response {
	if header == nil {
		header = http.Header{}
	}
	return &http.Response{StatusCode: status, Header: header}
}

// A 404 must be told apart from other failures: every key answers the same way,
// so the caller has to stop rotating and report a configuration problem.
func TestClassifyProviderResponseDetectsWithdrawnModel(t *testing.T) {
	err := classifyProviderResponse("Groq", "classifier", "llama-3.3-70b-versatile", responseWith(http.StatusNotFound, nil))
	if !errors.Is(err, errModelUnavailable) {
		t.Fatalf("expected errModelUnavailable, got %v", err)
	}
	if !contains(err.Error(), "llama-3.3-70b-versatile") {
		t.Fatalf("expected the model name in the message, got %q", err.Error())
	}
}

func TestClassifyProviderResponseReadsRetryAfter(t *testing.T) {
	header := http.Header{}
	header.Set("retry-after", "7")
	err := classifyProviderResponse("Groq", "classifier", "m", responseWith(http.StatusTooManyRequests, header))
	if !errors.Is(err, errRateLimit) {
		t.Fatalf("expected errRateLimit, got %v", err)
	}
	if got := retryAfterOf(err); got != 7*time.Second {
		t.Fatalf("expected a 7s wait, got %s", got)
	}
}

// Groq reports the per-minute reset as a Go duration string, and it is present
// even when retry-after is not.
func TestRetryAfterFromHeadersFallsBackToResetHeaders(t *testing.T) {
	header := http.Header{}
	header.Set("x-ratelimit-reset-tokens", "7.66s")
	if got := retryAfterFromHeaders(header); got < 7*time.Second || got > 8*time.Second {
		t.Fatalf("expected roughly 7.66s, got %s", got)
	}

	empty := retryAfterFromHeaders(http.Header{})
	if empty != defaultKeyCooldown {
		t.Fatalf("expected the default cooldown, got %s", empty)
	}
}

func TestClassifyProviderResponsePassesSuccessAndOtherErrors(t *testing.T) {
	if err := classifyProviderResponse("Groq", "classifier", "m", responseWith(http.StatusOK, nil)); err != nil {
		t.Fatalf("expected 200 to be usable, got %v", err)
	}
	err := classifyProviderResponse("Groq", "classifier", "m", responseWith(http.StatusInternalServerError, nil))
	if err == nil || errors.Is(err, errRateLimit) || errors.Is(err, errModelUnavailable) {
		t.Fatalf("expected a plain provider error for 500, got %v", err)
	}
}

// A parked key is skipped until its window resets, then becomes usable again.
func TestKeyHealthParksAndReleases(t *testing.T) {
	now := time.Now()
	health := &providerKeyHealth{nowFunc: func() time.Time { return now }}

	health.park("groq", 1, now.Add(30*time.Second))
	if ok, _ := health.available("groq", 1); ok {
		t.Fatal("expected the parked key to be unavailable")
	}
	if ok, _ := health.available("groq", 0); !ok {
		t.Fatal("expected an untouched key to stay available")
	}

	now = now.Add(31 * time.Second)
	if ok, _ := health.available("groq", 1); !ok {
		t.Fatal("expected the key to be released once its window reset")
	}
}

func TestKeyHealthKeepsTheLongestPark(t *testing.T) {
	now := time.Now()
	health := &providerKeyHealth{nowFunc: func() time.Time { return now }}
	health.park("groq", 0, now.Add(time.Minute))
	health.park("groq", 0, now.Add(10*time.Second)) // must not shorten the wait

	now = now.Add(20 * time.Second)
	if ok, _ := health.available("groq", 0); ok {
		t.Fatal("expected the longer park to win")
	}
}

func TestNextProviderAttemptsSkipsParkedKeys(t *testing.T) {
	now := time.Now()
	health := &providerKeyHealth{nowFunc: func() time.Time { return now }}
	keys := []string{"k0", "k1", "k2", "k3"}
	var cursor uint32

	health.park("groq", 1, now.Add(time.Minute))
	health.park("groq", 2, now.Add(time.Minute))

	attempts, releaseAt := nextProviderAttempts(health, "groq", keys, &cursor)
	if !releaseAt.IsZero() {
		t.Fatalf("expected no release time while keys remain, got %s", releaseAt)
	}
	if len(attempts) != 2 {
		t.Fatalf("expected the 2 free keys, got %d", len(attempts))
	}
	for _, attempt := range attempts {
		if attempt.Index == 1 || attempt.Index == 2 {
			t.Fatalf("parked key %d should not be attempted", attempt.Index)
		}
		if attempt.Total != len(keys) {
			t.Fatalf("expected Total to stay %d, got %d", len(keys), attempt.Total)
		}
	}
}

// Only when every key is parked does the caller get a quota error — and it says
// how long the wait is.
func TestNextProviderAttemptsReportsWhenEveryKeyIsParked(t *testing.T) {
	now := time.Now()
	health := &providerKeyHealth{nowFunc: func() time.Time { return now }}
	keys := []string{"k0", "k1"}
	var cursor uint32

	health.park("groq", 0, now.Add(2*time.Minute))
	health.park("groq", 1, now.Add(45*time.Second))

	attempts, releaseAt := nextProviderAttempts(health, "groq", keys, &cursor)
	if len(attempts) != 0 {
		t.Fatalf("expected no attempts, got %d", len(attempts))
	}
	if releaseAt.IsZero() {
		t.Fatal("expected a release time for the soonest key")
	}

	err := allKeysRateLimitedError("Groq", len(keys), releaseAt)
	if !errors.Is(err, ErrAIQuotaExceeded) {
		t.Fatalf("expected ErrAIQuotaExceeded, got %v", err)
	}
	if !contains(err.Error(), "retry in") {
		t.Fatalf("expected the wait in the message, got %q", err.Error())
	}
}

func TestKeyHealthClearReleasesAfterSuccess(t *testing.T) {
	now := time.Now()
	health := &providerKeyHealth{nowFunc: func() time.Time { return now }}
	health.park("gemini", 0, now.Add(time.Minute))
	health.clear("gemini", 0)
	if ok, _ := health.available("gemini", 0); !ok {
		t.Fatal("expected a cleared key to be usable again")
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (haystack == needle || indexOf(haystack, needle) >= 0)
}

func indexOf(haystack, needle string) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return i
		}
	}
	return -1
}

// One 429 must never retire a key for longer than the window it is waiting on.
// The daily reset header reads 24-46 minutes on these keys, and using it as the
// cooldown starved the rotation for the rest of an evaluation run.
func TestKeyCooldownIsBounded(t *testing.T) {
	explicit := http.Header{}
	explicit.Set("retry-after", "397") // 6m37s, as a provider actually returned
	if got := retryAfterFromHeaders(explicit); got != maxKeyCooldown {
		t.Fatalf("a long retry-after must be capped at %s, got %s", maxKeyCooldown, got)
	}

	// A short, honest wait is used as given.
	short := http.Header{}
	short.Set("retry-after", "7")
	if got := retryAfterFromHeaders(short); got != 7*time.Second {
		t.Fatalf("a short retry-after must be honoured, got %s", got)
	}

	// The daily reset window must not be mistaken for the per-minute one.
	daily := http.Header{}
	daily.Set("x-ratelimit-reset-requests", "24m28.8s")
	if got := retryAfterFromHeaders(daily); got != defaultKeyCooldown {
		t.Fatalf("the daily reset must not become the cooldown, got %s", got)
	}

	// The per-minute reset still drives the wait.
	perMinute := http.Header{}
	perMinute.Set("x-ratelimit-reset-tokens", "7.66s")
	if got := retryAfterFromHeaders(perMinute); got < 7*time.Second || got > 8*time.Second {
		t.Fatalf("expected roughly 7.66s from the per-minute reset, got %s", got)
	}
}
