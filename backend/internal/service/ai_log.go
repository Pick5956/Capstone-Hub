package service

import (
	"fmt"
	"log"
)

// aiStage emits content-free lifecycle metadata for AI requests. Callers must
// never pass provider credentials, user prompts, conversation content, or model
// output here; those values belong only in request processing and provider I/O.
func aiStage(stage, format string, args ...interface{}) {
	log.Printf("[AI] %-5s | %s", stage, fmt.Sprintf(format, args...))
}

// aiProviderHTTPError deliberately retains only non-sensitive request metadata.
// Provider response bodies are untrusted and may echo prompts, restaurant data,
// or credential material, so they must never be attached to returned errors.
type aiProviderHTTPError struct {
	Provider   string
	Operation  string
	StatusCode int
}

func (e *aiProviderHTTPError) Error() string {
	return fmt.Sprintf("%s %s returned HTTP status %d", e.Provider, e.Operation, e.StatusCode)
}

func newAIProviderHTTPError(provider, operation string, statusCode int) error {
	return &aiProviderHTTPError{Provider: provider, Operation: operation, StatusCode: statusCode}
}

// aiToolOrDash renders an empty tool name as "-" for readable log lines.
func aiToolOrDash(t AIToolName) string {
	if t == "" {
		return "-"
	}
	return string(t)
}
