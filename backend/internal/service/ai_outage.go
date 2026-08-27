package service

// Telling the owner the truth when the assistant cannot run.
//
// The deterministic layer can read the database without any provider, which for
// a long time made it tempting to answer anyway whenever a provider failed. The
// answer was correct, so nothing looked broken - and that was the problem. A
// shop owner could not tell a full answer from a fallback one, and never learned
// that the day's token budget was gone until they noticed the language had gone
// flat. Silence about an outage is not resilience; it is a missing status light.
//
// Every provider failure now leaves through here carrying three things the API
// layer needs and the owner should see: which of the two failures it was, how
// long to wait if the provider said, and a sentence written for a person.

import (
	"errors"
	"fmt"
	"math"
)

// ErrAIProviderUnavailable means the provider could not be reached or refused
// the request for a reason waiting will not fix on its own - a transport
// failure, a withdrawn model, a missing key. Distinct from ErrAIQuotaExceeded,
// which does clear on its own and can usually say when.
var ErrAIProviderUnavailable = errors.New("AI provider is unavailable")

// aiOutageError keeps the owner's sentence and the engineer's cause apart. The
// API layer sends Error() straight to the screen, so it must stay free of
// provider internals; the cause is still reachable through Unwrap for logs and
// for errors.Is on the underlying sentinels.
type aiOutageError struct {
	message           string
	kind              error
	retryAfterSeconds int
	cause             error
}

func (e *aiOutageError) Error() string { return e.message }

func (e *aiOutageError) Unwrap() error { return e.cause }

func (e *aiOutageError) Is(target error) bool { return target == e.kind }

// aiProviderOutageError classifies a provider failure for the API layer.
func aiProviderOutageError(cause error) error {
	if isAIQuotaFailure(cause) {
		wait := providerStatedRetrySeconds(cause)
		message := "โควตา AI ถูกใช้จนหมดแล้วครับ ลองใหม่อีกครั้งในภายหลัง"
		if wait > 0 {
			message = fmt.Sprintf("โควตา AI ถูกใช้จนหมดแล้วครับ ลองใหม่อีกครั้งใน %s", describeRetryWait(wait))
		}
		return &aiOutageError{
			message:           message,
			kind:              ErrAIQuotaExceeded,
			retryAfterSeconds: wait,
			cause:             cause,
		}
	}
	return &aiOutageError{
		message: "ตอนนี้เชื่อมต่อผู้ช่วย AI ไม่ได้ครับ กรุณาลองใหม่อีกครั้งในสักครู่",
		kind:    ErrAIProviderUnavailable,
		cause:   cause,
	}
}

func isAIQuotaFailure(cause error) bool {
	return cause != nil && (errors.Is(cause, ErrAIQuotaExceeded) || errors.Is(cause, errRateLimit))
}

// AIRetryAfterSeconds reports how long the provider asked us to wait, so the API
// layer can put a real number on the screen instead of "try again later". Zero
// means the failure named no wait worth repeating - and no wait is invented.
func AIRetryAfterSeconds(err error) int {
	var outage *aiOutageError
	if errors.As(err, &outage) {
		return outage.retryAfterSeconds
	}
	return providerStatedRetrySeconds(err)
}

func providerStatedRetrySeconds(err error) int {
	var limited *rateLimitedError
	if !errors.As(err, &limited) || limited.RetryAfter <= 0 {
		return 0
	}
	return int(math.Ceil(limited.RetryAfter.Seconds()))
}

// describeRetryWait renders the wait the way a shop owner would say it.
func describeRetryWait(seconds int) string {
	switch {
	case seconds < 60:
		return fmt.Sprintf("%d วินาที", seconds)
	case seconds < 3600:
		return fmt.Sprintf("%d นาที", int(math.Ceil(float64(seconds)/60)))
	default:
		return fmt.Sprintf("%.1f ชั่วโมง", float64(seconds)/3600)
	}
}
