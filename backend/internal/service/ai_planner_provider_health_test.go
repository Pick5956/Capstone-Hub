package service

// The structured planner used to carry its own key rotation, so the protections
// added to the chat flows did not apply to it: a key parked after a 429 was
// retried on the next question, and a withdrawn model was not recognised at all
// (its rotation only advanced on 401/403/429, so a 404 stopped everything).
// These tests pin the shared behaviour now that both paths use one rotation.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func plannerTestRequest() StructuredPlannerProviderRequest {
	return StructuredPlannerProviderRequest{
		SchemaName:   "resolved_plan_v1",
		SystemPrompt: "system instructions",
		UserPrompt:   `{"current_question":"hello"}`,
		JSONSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties":           map[string]any{"answer": map[string]any{"type": "string"}},
			"required":             []any{"answer"},
		},
	}
}

// A 429 must park that key so the next request skips it instead of spending a
// round trip to rediscover the same limit.
func TestPlannerRotationParksRateLimitedKey(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "")
	t.Setenv("GROQ_MODEL", "")

	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			w.Header().Set("retry-after", "45")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(groqStructuredPlannerSuccessBody()))
	}))
	defer server.Close()

	health := &providerKeyHealth{}
	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key-one", "key-two"}, server.URL)
	provider.health = health

	if _, err := provider.GenerateResolvedPlan(context.Background(), plannerTestRequest()); err != nil {
		t.Fatalf("the second key should have answered: %v", err)
	}

	parked := 0
	for index := range []int{0, 1} {
		if available, until := health.available("groq", index); !available {
			parked++
			if wait := time.Until(until); wait < 30*time.Second {
				t.Fatalf("expected the provider's 45s retry-after to be honoured, got %s", wait)
			}
		}
	}
	if parked != 1 {
		t.Fatalf("expected exactly one parked key, got %d", parked)
	}
}

// Every key parked means the caller is told to wait rather than being sent
// through a round of certain failures.
func TestPlannerRotationReportsWhenEveryKeyIsParked(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "")
	t.Setenv("GROQ_MODEL", "")

	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		atomic.AddInt32(&calls, 1)
	}))
	defer server.Close()

	health := &providerKeyHealth{}
	now := time.Now()
	health.park("groq", 0, now.Add(time.Minute))
	health.park("groq", 1, now.Add(2*time.Minute))

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key-one", "key-two"}, server.URL)
	provider.health = health

	_, err := provider.GenerateResolvedPlan(context.Background(), plannerTestRequest())
	if !errors.Is(err, errRateLimit) || !errors.Is(err, ErrAIQuotaExceeded) {
		t.Fatalf("expected a rate-limit/quota error, got %v", err)
	}
	if atomic.LoadInt32(&calls) != 0 {
		t.Fatalf("parked keys must not be called, got %d requests", calls)
	}
}

// A withdrawn model answers 404 for every key, so the rotation must stop at the
// first one and say what has to be reconfigured.
func TestPlannerRotationStopsOnWithdrawnModel(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "")
	t.Setenv("GROQ_MODEL", "")

	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key-one", "key-two", "key-three"}, server.URL)
	provider.health = &providerKeyHealth{}

	_, err := provider.GenerateResolvedPlan(context.Background(), plannerTestRequest())
	if !errors.Is(err, errModelUnavailable) {
		t.Fatalf("expected errModelUnavailable, got %v", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("a withdrawn model must not be retried per key, got %d requests", got)
	}
}

// The planner shares the tracker with the chat flows, so a key parked by one is
// skipped by the other.
func TestPlannerAndChatFlowsShareKeyHealth(t *testing.T) {
	service := &AIService{}
	service.keyHealth.park("groq", 0, time.Now().Add(time.Minute))

	keys := []string{"key-one", "key-two"}
	var cursor uint32
	attempts, _ := nextProviderAttempts(&service.keyHealth, "groq", keys, &cursor)
	for _, attempt := range attempts {
		if attempt.Index == 0 {
			t.Fatal("a key parked by the chat flow must also be skipped by the planner")
		}
	}
	if len(attempts) != 1 {
		t.Fatalf("expected the one free key, got %d", len(attempts))
	}
}
