//go:build ai_eval

package service

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/joho/godotenv"
)

const (
	structuredPlannerMultiProviderMaxCalls = 32
	structuredPlannerEvalCallTimeout       = 20 * time.Second
	structuredPlannerEvalMinimumAccuracy   = 80.0
)

type structuredPlannerEvalProvider struct {
	name     StructuredPlannerProviderName
	provider StructuredPlannerProvider
}

type structuredPlannerEvalCallCounter struct {
	provider StructuredPlannerProvider
	calls    *int
	maxCalls int
}

func (p *structuredPlannerEvalCallCounter) Name() StructuredPlannerProviderName {
	return p.provider.Name()
}

func (p *structuredPlannerEvalCallCounter) GenerateResolvedPlan(ctx context.Context, request StructuredPlannerProviderRequest) (StructuredPlannerProviderResponse, error) {
	if *p.calls >= p.maxCalls {
		return StructuredPlannerProviderResponse{}, errors.New("structured planner evaluation call cap reached")
	}
	(*p.calls)++
	return p.provider.GenerateResolvedPlan(ctx, request)
}

type structuredPlannerEvalScore struct {
	Hits   int
	Total  int
	Misses []string
}

func (s *structuredPlannerEvalScore) check(label string, matched bool) {
	s.Total++
	if matched {
		s.Hits++
		return
	}
	s.Misses = append(s.Misses, label)
}

// TestLiveMultiProviderStructuredPlanner evaluates Groq and Gemini in separate
// subtests. It cannot run accidentally: both opt-in flags must be exactly 1.
// Each adapter receives only its first configured key, which bounds actual HTTP
// requests to one per case and 32 for the complete two-provider run.
func TestLiveMultiProviderStructuredPlanner(t *testing.T) {
	if strings.TrimSpace(os.Getenv("AI_EVAL_ENABLED")) != "1" ||
		strings.TrimSpace(os.Getenv("AI_MULTI_PROVIDER_EVAL_ENABLED")) != "1" {
		t.Skip("set both AI_EVAL_ENABLED=1 and AI_MULTI_PROVIDER_EVAL_ENABLED=1 to consume live provider quota")
	}

	// The opt-in check deliberately happens before loading developer credentials.
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	fixture := loadStructuredPlannerEvalFixture(t)
	if len(fixture.Cases)*2 > structuredPlannerMultiProviderMaxCalls {
		t.Fatalf("fixture requires %d calls, exceeding fixed cap %d", len(fixture.Cases)*2, structuredPlannerMultiProviderMaxCalls)
	}
	referenceTime, err := time.Parse(time.RFC3339, fixture.ReferenceTime)
	if err != nil {
		t.Fatalf("parse fixed Bangkok reference time: %v", err)
	}

	httpClient := &http.Client{Timeout: structuredPlannerEvalCallTimeout}
	groqKey := firstStructuredPlannerEvalKey(os.Getenv("GROQ_API_KEYS"))
	geminiKey := firstStructuredPlannerEvalKey(os.Getenv("GEMINI_API_KEYS"))
	if groqKey == "" || geminiKey == "" {
		t.Fatal("multi-provider evaluation requires both GROQ_API_KEYS and GEMINI_API_KEYS")
	}
	providers := []structuredPlannerEvalProvider{
		{name: StructuredPlannerProviderGroq, provider: NewGroqStructuredPlannerProvider(httpClient, []string{groqKey})},
		{name: StructuredPlannerProviderGemini, provider: NewGeminiStructuredPlannerProvider(httpClient, []string{geminiKey})},
	}

	totalCalls := 0
	for _, configured := range providers {
		configured := configured
		t.Run(string(configured.name), func(t *testing.T) {
			capped := &structuredPlannerEvalCallCounter{
				provider: configured.provider,
				calls:    &totalCalls,
				maxCalls: structuredPlannerMultiProviderMaxCalls,
			}
			planner, plannerErr := NewStructuredPlanner(capped)
			if plannerErr != nil {
				t.Fatalf("construct %s planner: %v", configured.name, plannerErr)
			}

			providerScore := structuredPlannerEvalScore{}
			validPlans := 0
			for _, testCase := range fixture.Cases {
				callContext, cancel := context.WithTimeout(context.Background(), structuredPlannerEvalCallTimeout)
				result, planErr := planner.Plan(callContext, StructuredPlannerRequest{
					Question:      testCase.Question,
					Context:       testCase.Context,
					ReferenceTime: referenceTime,
				})
				cancel()

				caseScore := scoreStructuredPlannerEvalPlan(result.Plan, testCase.Expected)
				if planErr != nil || result.UsedLocalFallback || result.Provider != configured.name {
					providerScore.Total += caseScore.Total
					stageSummary := structuredPlannerEvalFailureStages(result.Attempts)
					if planErr != nil {
						stageSummary = "planner_error"
					}
					t.Logf("case %q: provider result rejected (%s)", testCase.Name, stageSummary)
					continue
				}

				validPlans++
				providerScore.Hits += caseScore.Hits
				providerScore.Total += caseScore.Total
				if len(caseScore.Misses) > 0 {
					t.Logf("case %q: %d/%d checks; missed %s", testCase.Name, caseScore.Hits, caseScore.Total, strings.Join(caseScore.Misses, ", "))
				}
			}

			accuracy := structuredPlannerEvalAccuracy(providerScore.Hits, providerScore.Total)
			t.Logf("%s structured planner: %.1f%% (%d/%d), valid plans %d/%d", configured.name, accuracy, providerScore.Hits, providerScore.Total, validPlans, len(fixture.Cases))
			if validPlans == 0 {
				t.Fatalf("%s produced no valid ResolvedPlan", configured.name)
			}
			if accuracy < structuredPlannerEvalMinimumAccuracy {
				t.Errorf("%s accuracy %.1f%% is below %.1f%%", configured.name, accuracy, structuredPlannerEvalMinimumAccuracy)
			}
		})
	}
	if totalCalls > structuredPlannerMultiProviderMaxCalls {
		t.Fatalf("multi-provider evaluation made %d calls, cap is %d", totalCalls, structuredPlannerMultiProviderMaxCalls)
	}
}

func firstStructuredPlannerEvalKey(raw string) string {
	for _, candidate := range strings.Split(raw, ",") {
		if key := strings.TrimSpace(candidate); key != "" {
			return key
		}
	}
	return ""
}

func scoreStructuredPlannerEvalPlan(plan ResolvedPlan, expected structuredPlannerEvalExpectation) structuredPlannerEvalScore {
	score := structuredPlannerEvalScore{}
	score.check("task", containsValue(expected.Tasks, plan.Task))
	score.check("domain", containsValue(expected.Domains, plan.Domain))
	score.check("operation", containsValue(expected.Operations, plan.Operation))
	for _, metric := range expected.RequiredMetrics {
		score.check("metric:"+string(metric), containsValue(plan.Parameters.Metrics, metric))
	}
	for _, group := range expected.RequiredGroupBy {
		score.check("group_by:"+string(group), containsValue(plan.Parameters.GroupBy, group))
	}
	score.check("tool_hint", containsValue(expected.ToolHints, plan.ToolHint))
	score.check("needs_clarification", expected.NeedsClarification != nil && plan.Resolution.NeedsClarification == *expected.NeedsClarification)
	score.check("risk", plan.Policy.Risk == expected.Risk)
	score.check("read_only", expected.ReadOnly != nil && plan.Policy.ReadOnly == *expected.ReadOnly)
	score.check("requires_confirmation", expected.RequiresConfirmation != nil && plan.Policy.RequiresConfirmation == *expected.RequiresConfirmation)
	if expected.Action != nil {
		score.check("action.type", plan.Action != nil && plan.Action.Type == expected.Action.Type)
		score.check("action.is_available", plan.Action != nil && expected.Action.IsAvailable != nil && plan.Action.Arguments.IsAvailable == *expected.Action.IsAvailable)
	}

	if expected.TimeRange != nil {
		matched := plan.Parameters.TimeRange != nil &&
			plan.Parameters.TimeRange.Kind == expected.TimeRange.Kind &&
			plan.Parameters.TimeRange.StartDate == expected.TimeRange.StartDate &&
			plan.Parameters.TimeRange.EndDate == expected.TimeRange.EndDate &&
			plan.Parameters.TimeRange.Timezone == ResolvedPlanTimezone
		score.check("time_range", matched)
	}
	if expected.DayPart != nil {
		matched := plan.Parameters.DayPart != nil &&
			plan.Parameters.DayPart.StartHour == expected.DayPart.StartHour &&
			plan.Parameters.DayPart.EndHour == expected.DayPart.EndHour
		score.check("day_part", matched)
	}
	if expected.Ranking != nil {
		matched := plan.Parameters.Ranking != nil &&
			plan.Parameters.Ranking.Metric == expected.Ranking.Metric &&
			plan.Parameters.Ranking.Direction == expected.Ranking.Direction &&
			plan.Parameters.Ranking.Rank == expected.Ranking.Rank
		score.check("ranking", matched)
	}
	for _, inherited := range expected.RequiredInheritedFields {
		matched := false
		for _, actual := range plan.Resolution.InheritedFields {
			if actual.Field == inherited.Field && actual.SourceTurnID == inherited.SourceTurnID {
				matched = true
				break
			}
		}
		score.check("inheritance:"+string(inherited.Field), matched)
	}
	if expected.Entity != nil {
		matched := false
		for _, entity := range plan.Parameters.Entities {
			if entity.Type != expected.Entity.Type {
				continue
			}
			if expected.Entity.NameContains != "" && !strings.Contains(entity.Name, expected.Entity.NameContains) {
				continue
			}
			if expected.Entity.ResultIndex > 0 && entity.ResultIndex != expected.Entity.ResultIndex {
				continue
			}
			if expected.Entity.SourceTurnID != "" && entity.SourceTurnID != expected.Entity.SourceTurnID {
				continue
			}
			matched = true
			break
		}
		score.check("entity", matched)
	}
	return score
}

func structuredPlannerEvalFailureStages(attempts []StructuredPlannerAttempt) string {
	if len(attempts) == 0 {
		return "no_attempt"
	}
	stages := make([]string, 0, len(attempts))
	for _, attempt := range attempts {
		stage := string(attempt.FailureStage)
		if stage == "" {
			stage = "unknown"
		}
		stages = append(stages, stage)
	}
	return strings.Join(stages, "+")
}

func structuredPlannerEvalAccuracy(hits, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(hits) / float64(total) * 100
}
