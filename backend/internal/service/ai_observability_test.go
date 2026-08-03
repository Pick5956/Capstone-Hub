package service

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestAIObservabilityIsDisabledByDefault(t *testing.T) {
	t.Setenv("AI_OBSERVABILITY_ENABLED", "")
	t.Setenv("AI_DAILY_REQUEST_BUDGET", "")
	t.Setenv("AI_DAILY_TOKEN_BUDGET", "")
	service := &AIService{observability: newAIObservability()}

	if err := service.beginAIPlannerObservation(7); err != nil {
		t.Fatalf("disabled observation: %v", err)
	}
	service.recordAIPlannerResult(7, StructuredPlannerResult{Provider: StructuredPlannerProviderGroq})
	snapshot, err := service.AIUsageForOwner(ownerActor())
	if err != nil {
		t.Fatalf("AIUsageForOwner: %v", err)
	}
	if snapshot.Enabled || snapshot.PlannerRequests != 0 || len(snapshot.ByProvider) != 0 {
		t.Fatalf("disabled snapshot = %+v", snapshot)
	}
}

func TestAIObservabilityAggregatesFallbackLatencyTokensAndKeyRotation(t *testing.T) {
	t.Setenv("AI_OBSERVABILITY_ENABLED", "true")
	t.Setenv("AI_DAILY_REQUEST_BUDGET", "10")
	t.Setenv("AI_DAILY_TOKEN_BUDGET", "10000")
	t.Setenv("AI_LATENCY_WARN_MS", "100")
	observation := newAIObservability()
	observation.now = func() time.Time { return time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC) }
	service := &AIService{observability: observation}

	if err := service.beginAIPlannerObservation(7); err != nil {
		t.Fatalf("begin observation: %v", err)
	}
	service.recordAIPlannerResult(7, StructuredPlannerResult{
		Provider:             StructuredPlannerProviderGemini,
		UsedProviderFallback: true,
		Attempts: []StructuredPlannerAttempt{
			{Provider: StructuredPlannerProviderGroq, Duration: 250 * time.Millisecond, InputTokens: 40, OutputTokens: 5, HTTPAttempts: 2, KeyFallbacks: 1, RateLimits: 1},
			{Provider: StructuredPlannerProviderGemini, Duration: 50 * time.Millisecond, InputTokens: 45, OutputTokens: 10, HTTPAttempts: 1, Succeeded: true},
		},
	})

	snapshot, err := service.AIUsageForOwner(ownerActor())
	if err != nil {
		t.Fatalf("AIUsageForOwner: %v", err)
	}
	if snapshot.Date != "2026-08-03" || snapshot.PlannerRequests != 1 || snapshot.ProviderFallbacks != 1 {
		t.Fatalf("usage snapshot = %+v", snapshot)
	}
	if snapshot.InputTokens != 85 || snapshot.OutputTokens != 15 {
		t.Fatalf("token totals = input %d output %d", snapshot.InputTokens, snapshot.OutputTokens)
	}
	groq := snapshot.ByProvider["groq"]
	if groq.Attempts != 1 || groq.Failed != 1 || groq.HTTPAttempts != 2 || groq.KeyFallbacks != 1 || groq.RateLimits != 1 || groq.SlowAttempts != 1 {
		t.Fatalf("Groq metrics = %+v", groq)
	}
	gemini := snapshot.ByProvider["gemini"]
	if gemini.Succeeded != 1 || gemini.MaxLatencyMS != 50 {
		t.Fatalf("Gemini metrics = %+v", gemini)
	}
}

func TestAIPlannerRequestAndTokenBudgetsFailClosed(t *testing.T) {
	t.Run("request budget", func(t *testing.T) {
		t.Setenv("AI_OBSERVABILITY_ENABLED", "false")
		t.Setenv("AI_DAILY_REQUEST_BUDGET", "1")
		t.Setenv("AI_DAILY_TOKEN_BUDGET", "0")
		service := &AIService{observability: newAIObservability()}
		if err := service.beginAIPlannerObservation(7); err != nil {
			t.Fatalf("first request: %v", err)
		}
		if err := service.beginAIPlannerObservation(7); !errors.Is(err, ErrAIQuotaExceeded) {
			t.Fatalf("second request error = %v", err)
		}
	})

	t.Run("token budget", func(t *testing.T) {
		t.Setenv("AI_OBSERVABILITY_ENABLED", "false")
		t.Setenv("AI_DAILY_REQUEST_BUDGET", "0")
		t.Setenv("AI_DAILY_TOKEN_BUDGET", "100")
		service := &AIService{observability: newAIObservability()}
		if err := service.beginAIPlannerObservation(7); err != nil {
			t.Fatalf("first request: %v", err)
		}
		service.recordAIPlannerResult(7, StructuredPlannerResult{Attempts: []StructuredPlannerAttempt{{
			Provider: StructuredPlannerProviderGroq, InputTokens: 80, OutputTokens: 20, Succeeded: true,
		}}})
		if err := service.beginAIPlannerObservation(7); !errors.Is(err, ErrAIQuotaExceeded) {
			t.Fatalf("request after token budget error = %v", err)
		}
	})
}

func TestAIObservabilityIsTenantScopedAndResetsEachBangkokDay(t *testing.T) {
	t.Setenv("AI_OBSERVABILITY_ENABLED", "true")
	t.Setenv("AI_DAILY_REQUEST_BUDGET", "0")
	t.Setenv("AI_DAILY_TOKEN_BUDGET", "0")
	now := time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC)
	observation := newAIObservability()
	observation.now = func() time.Time { return now }
	service := &AIService{observability: observation}
	if err := service.beginAIPlannerObservation(7); err != nil {
		t.Fatal(err)
	}

	other, err := service.AIUsageForOwner(AIActorContext{RestaurantID: 8, OwnerUserID: 11, Role: "owner"})
	if err != nil || other.PlannerRequests != 0 {
		t.Fatalf("other tenant snapshot = %+v, %v", other, err)
	}
	now = now.Add(24 * time.Hour)
	reset, err := service.AIUsageForOwner(ownerActor())
	if err != nil || reset.PlannerRequests != 0 || reset.Date != "2026-08-04" {
		t.Fatalf("next-day snapshot = %+v, %v", reset, err)
	}
}

func TestAIObservabilityIsConcurrencySafeAndContainsNoPromptData(t *testing.T) {
	t.Setenv("AI_OBSERVABILITY_ENABLED", "true")
	t.Setenv("AI_DAILY_REQUEST_BUDGET", "0")
	t.Setenv("AI_DAILY_TOKEN_BUDGET", "0")
	service := &AIService{observability: newAIObservability()}
	var wait sync.WaitGroup
	for index := 0; index < 50; index++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if err := service.beginAIPlannerObservation(7); err != nil {
				t.Errorf("begin observation: %v", err)
				return
			}
			service.recordAIPlannerResult(7, StructuredPlannerResult{
				Provider: StructuredPlannerProviderGroq,
				Attempts: []StructuredPlannerAttempt{{Provider: StructuredPlannerProviderGroq, InputTokens: 1, OutputTokens: 1, Succeeded: true}},
			})
		}()
	}
	wait.Wait()
	snapshot, err := service.AIUsageForOwner(ownerActor())
	if err != nil || snapshot.PlannerRequests != 50 || snapshot.InputTokens != 50 || snapshot.OutputTokens != 50 {
		t.Fatalf("concurrent snapshot = %+v, %v", snapshot, err)
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	lower := strings.ToLower(string(encoded))
	for _, forbidden := range []string{"question", "prompt", "raw_json", "api_key", "error_message", "failure_reason"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("metrics exposed forbidden field %q: %s", forbidden, encoded)
		}
	}
}
