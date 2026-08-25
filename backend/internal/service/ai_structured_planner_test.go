package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

type structuredPlannerMockProvider struct {
	name     StructuredPlannerProviderName
	response StructuredPlannerProviderResponse
	err      error
	calls    int
	inspect  func(StructuredPlannerProviderRequest)
}

func (m *structuredPlannerMockProvider) Name() StructuredPlannerProviderName {
	return m.name
}

func (m *structuredPlannerMockProvider) GenerateResolvedPlan(_ context.Context, request StructuredPlannerProviderRequest) (StructuredPlannerProviderResponse, error) {
	m.calls++
	if m.inspect != nil {
		m.inspect(request)
	}
	return m.response, m.err
}

func structuredPlannerTestPlan(question string) ResolvedPlan {
	return ResolvedPlan{
		SchemaVersion:    ResolvedPlanSchemaVersion,
		OriginalQuestion: question,
		ResolvedQuestion: question,
		Task:             AITaskGeneralChat,
		Domain:           ResolvedPlanDomainGeneral,
		Operation:        ResolvedPlanOperationChat,
		Action:           nil,
		Parameters: ResolvedPlanParameters{
			Metrics:  []ResolvedPlanMetric{},
			GroupBy:  []ResolvedPlanGroupDimension{},
			Entities: []ResolvedPlanEntityRef{},
			Filters:  []ResolvedPlanFilter{},
		},
		Resolution: ResolvedPlanResolution{
			InheritedFields: []ResolvedPlanInheritedField{},
			MissingFields:   []ResolvedPlanField{},
			Confidence:      0.95,
		},
		Policy: ResolvedPlanPolicy{
			Risk:     ResolvedPlanRiskLow,
			ReadOnly: true,
		},
		ResponseStyle: ResolvedPlanResponseNormal,
	}
}

func structuredPlannerTestJSON(t *testing.T, plan ResolvedPlan) string {
	t.Helper()
	encoded, err := json.Marshal(plan)
	if err != nil {
		t.Fatalf("marshal test plan: %v", err)
	}
	return string(encoded)
}

func TestParseStructuredPlannerResolvedPlanUsesTrustedQuestion(t *testing.T) {
	plan := structuredPlannerTestPlan("model-controlled question")
	parsed, err := ParseStructuredPlannerResolvedPlan(structuredPlannerTestJSON(t, plan), "  ขอบคุณครับ  ")
	if err != nil {
		t.Fatalf("ParseStructuredPlannerResolvedPlan: %v", err)
	}
	if parsed.OriginalQuestion != "ขอบคุณครับ" {
		t.Fatalf("original question = %q, want trusted request value", parsed.OriginalQuestion)
	}
	if parsed.ResolvedQuestion != plan.ResolvedQuestion {
		t.Fatalf("resolved question = %q, want provider value %q", parsed.ResolvedQuestion, plan.ResolvedQuestion)
	}
}

func TestParseStructuredPlannerResolvedPlanAcceptsTypedMenuAction(t *testing.T) {
	plan := structuredPlannerTestPlan("make menu 42 unavailable")
	plan.Task = AITaskRiskyAction
	plan.Domain = ResolvedPlanDomainMenu
	plan.Operation = ResolvedPlanOperationExecuteAction
	plan.Action = &ResolvedPlanAction{
		Type:      ResolvedPlanActionSetMenuAvailability,
		Arguments: ResolvedPlanActionArguments{IsAvailable: false},
	}
	plan.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityMenu, ID: "42"}}
	plan.Policy = ResolvedPlanPolicy{Risk: ResolvedPlanRiskHigh, RequiresConfirmation: true}

	parsed, err := ParseStructuredPlannerResolvedPlan(structuredPlannerTestJSON(t, plan), plan.OriginalQuestion)
	if err != nil {
		t.Fatalf("ParseStructuredPlannerResolvedPlan: %v", err)
	}
	if parsed.Action == nil || parsed.Action.Type != ResolvedPlanActionSetMenuAvailability || parsed.Action.Arguments.IsAvailable {
		t.Fatalf("parsed action = %#v, want unavailable menu action", parsed.Action)
	}
}

func TestParseStructuredPlannerResolvedPlanRejectsInvalidWireShape(t *testing.T) {
	validJSON := structuredPlannerTestJSON(t, structuredPlannerTestPlan("hello"))

	var missingNested map[string]any
	if err := json.Unmarshal([]byte(validJSON), &missingNested); err != nil {
		t.Fatal(err)
	}
	// A required scalar, not a list: absent lists and absent optional objects are
	// now read as "nothing specified", which is what the models mean by them.
	delete(missingNested["policy"].(map[string]any), "risk")
	missingNestedJSON, err := json.Marshal(missingNested)
	if err != nil {
		t.Fatal(err)
	}

	var missingAction map[string]any
	if err := json.Unmarshal([]byte(validJSON), &missingAction); err != nil {
		t.Fatal(err)
	}
	delete(missingAction, "action")
	missingActionJSON, err := json.Marshal(missingAction)
	if err != nil {
		t.Fatal(err)
	}

	actionPlan := structuredPlannerTestPlan("make menu available")
	actionPlan.Task = AITaskRiskyAction
	actionPlan.Domain = ResolvedPlanDomainMenu
	actionPlan.Operation = ResolvedPlanOperationExecuteAction
	actionPlan.Action = &ResolvedPlanAction{
		Type:      ResolvedPlanActionSetMenuAvailability,
		Arguments: ResolvedPlanActionArguments{IsAvailable: true},
	}
	actionPlan.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityMenu, ID: "42"}}
	actionPlan.Policy = ResolvedPlanPolicy{Risk: ResolvedPlanRiskHigh, RequiresConfirmation: true}
	actionJSON := structuredPlannerTestJSON(t, actionPlan)
	var missingActionArgument map[string]any
	if err := json.Unmarshal([]byte(actionJSON), &missingActionArgument); err != nil {
		t.Fatal(err)
	}
	action := missingActionArgument["action"].(map[string]any)
	delete(action["arguments"].(map[string]any), "is_available")
	missingActionArgumentJSON, err := json.Marshal(missingActionArgument)
	if err != nil {
		t.Fatal(err)
	}

	tests := map[string]string{
		"markdown fence":       "```json\n" + validJSON + "\n```",
		"trailing JSON":        validJSON + `{}`,
		"missing root action":  string(missingActionJSON),
		"missing action arg":   string(missingActionArgumentJSON),
		"missing nested field": string(missingNestedJSON),
	}
	for name, raw := range tests {
		t.Run(name, func(t *testing.T) {
			_, parseErr := ParseStructuredPlannerResolvedPlan(raw, "hello")
			if !errors.Is(parseErr, ErrStructuredPlannerJSON) {
				t.Fatalf("error = %v, want ErrStructuredPlannerJSON", parseErr)
			}
		})
	}
}

func TestParseStructuredPlannerResolvedPlanSeparatesSemanticValidation(t *testing.T) {
	plan := structuredPlannerTestPlan("hello")
	plan.Task = AITaskRetrieveFact
	_, err := ParseStructuredPlannerResolvedPlan(structuredPlannerTestJSON(t, plan), "hello")
	if !errors.Is(err, ErrStructuredPlannerPlanValidation) {
		t.Fatalf("error = %v, want ErrStructuredPlannerPlanValidation", err)
	}
}

func TestStructuredPlannerFallsBackFromGroqToGemini(t *testing.T) {
	groq := &structuredPlannerMockProvider{
		name:     StructuredPlannerProviderGroq,
		response: StructuredPlannerProviderResponse{RawJSON: `not-json`, Model: "groq-model", InputTokens: -10},
		inspect: func(request StructuredPlannerProviderRequest) {
			request.JSONSchema["title"] = "mutated by first adapter"
		},
	}
	gemini := &structuredPlannerMockProvider{
		name: StructuredPlannerProviderGemini,
		response: StructuredPlannerProviderResponse{
			RawJSON:      structuredPlannerTestJSON(t, structuredPlannerTestPlan("สวัสดี")),
			Model:        "gemini-model",
			InputTokens:  120,
			OutputTokens: 80,
		},
		inspect: func(request StructuredPlannerProviderRequest) {
			if request.JSONSchema["title"] != "ResolvedPlan" {
				t.Fatalf("fallback provider received a mutated schema: %#v", request.JSONSchema["title"])
			}
			if request.SchemaName != "resolved_plan_v1" || !strings.Contains(request.SystemPrompt, "single planning pass") {
				t.Fatalf("provider request is missing planner contract: %+v", request)
			}
			if !strings.Contains(request.UserPrompt, `"id":"turn-1"`) || !strings.Contains(request.UserPrompt, `"reference_date":"2026-08-02"`) {
				t.Fatalf("provider prompt is missing dated context: %s", request.UserPrompt)
			}
		},
	}
	planner, err := NewStructuredPlanner(groq, gemini)
	if err != nil {
		t.Fatal(err)
	}

	result, err := planner.Plan(context.Background(), StructuredPlannerRequest{
		Question: "สวัสดี",
		Context: []StructuredPlannerContextItem{{
			ID:      "turn-1",
			Source:  ResolvedPlanSourceConversation,
			Role:    "user",
			Content: "ข้อความก่อนหน้า",
		}},
		ReferenceTime: time.Date(2026, 8, 2, 1, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if result.Provider != StructuredPlannerProviderGemini || !result.UsedProviderFallback || result.UsedLocalFallback {
		t.Fatalf("unexpected fallback result: %+v", result)
	}
	if len(result.Attempts) != 2 || result.Attempts[0].FailureStage != StructuredPlannerFailureParse || !result.Attempts[1].Succeeded {
		t.Fatalf("unexpected attempts: %+v", result.Attempts)
	}
	if result.Attempts[0].InputTokens != 0 || result.Attempts[1].InputTokens != 120 {
		t.Fatalf("usage metadata was not normalized: %+v", result.Attempts)
	}
	if groq.calls != 1 || gemini.calls != 1 {
		t.Fatalf("provider calls = groq:%d gemini:%d, want 1 each", groq.calls, gemini.calls)
	}
}

func TestStructuredPlannerRejectsForgedContextProvenance(t *testing.T) {
	forged := structuredPlannerTestPlan("แล้วอันนั้นล่ะ")
	forged.Resolution.InheritedFields = []ResolvedPlanInheritedField{{
		Field:        ResolvedPlanFieldTask,
		Source:       ResolvedPlanSourceConversation,
		SourceTurnID: "unknown-turn",
	}}
	groq := &structuredPlannerMockProvider{
		name:     StructuredPlannerProviderGroq,
		response: StructuredPlannerProviderResponse{RawJSON: structuredPlannerTestJSON(t, forged)},
	}
	gemini := &structuredPlannerMockProvider{
		name: StructuredPlannerProviderGemini,
		response: StructuredPlannerProviderResponse{
			RawJSON: structuredPlannerTestJSON(t, structuredPlannerTestPlan("แล้วอันนั้นล่ะ")),
		},
	}
	planner, err := NewStructuredPlanner(groq, gemini)
	if err != nil {
		t.Fatal(err)
	}

	result, err := planner.Plan(context.Background(), StructuredPlannerRequest{
		Question: "แล้วอันนั้นล่ะ",
		Context: []StructuredPlannerContextItem{{
			ID: "turn-1", Source: ResolvedPlanSourceConversation, Role: "assistant", Content: "ผลลัพธ์ก่อนหน้า",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Provider != StructuredPlannerProviderGemini || result.Attempts[0].FailureStage != StructuredPlannerFailureProvenance {
		t.Fatalf("forged provenance did not trigger Gemini fallback: %+v", result)
	}
}

func TestStructuredPlannerReturnsSafeLocalFallback(t *testing.T) {
	groq := &structuredPlannerMockProvider{name: StructuredPlannerProviderGroq, err: errors.New("quota exceeded")}
	invalid := structuredPlannerTestPlan("ยอดขายเป็นอย่างไร")
	invalid.Policy.ReadOnly = false
	gemini := &structuredPlannerMockProvider{
		name:     StructuredPlannerProviderGemini,
		response: StructuredPlannerProviderResponse{RawJSON: structuredPlannerTestJSON(t, invalid)},
	}
	planner, err := NewStructuredPlanner(groq, gemini)
	if err != nil {
		t.Fatal(err)
	}

	result, err := planner.Plan(context.Background(), StructuredPlannerRequest{Question: "ยอดขายเป็นอย่างไร"})
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if !result.UsedLocalFallback || result.Provider != StructuredPlannerProviderLocalFallback {
		t.Fatalf("expected local fallback, got %+v", result)
	}
	if result.Plan.Task != AITaskUnclear || result.Plan.Operation != ResolvedPlanOperationClarify || !result.Plan.Resolution.NeedsClarification {
		t.Fatalf("fallback is not a clarification plan: %+v", result.Plan)
	}
	if err := result.Plan.Validate(); err != nil {
		t.Fatalf("local fallback is invalid: %v", err)
	}
	if len(result.Attempts) != 2 || result.Attempts[0].FailureStage != StructuredPlannerFailureCall || result.Attempts[1].FailureStage != StructuredPlannerFailureValidation {
		t.Fatalf("unexpected attempts: %+v", result.Attempts)
	}
}

func TestStructuredPlannerRejectsInvalidRequestBeforeCallingProvider(t *testing.T) {
	groq := &structuredPlannerMockProvider{name: StructuredPlannerProviderGroq}
	planner, err := NewStructuredPlanner(groq)
	if err != nil {
		t.Fatal(err)
	}

	_, err = planner.Plan(context.Background(), StructuredPlannerRequest{
		Question: "hello",
		Context: []StructuredPlannerContextItem{
			{ID: "same", Source: ResolvedPlanSourceConversation, Role: "user", Content: "one"},
			{ID: "same", Source: ResolvedPlanSourceConversation, Role: "assistant", Content: "two"},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "duplicate id") {
		t.Fatalf("error = %v, want duplicate context id", err)
	}
	if groq.calls != 0 {
		t.Fatalf("provider was called %d times for invalid input", groq.calls)
	}
}

func TestStructuredPlannerHonorsCancellationWithoutLocalFallback(t *testing.T) {
	groq := &structuredPlannerMockProvider{name: StructuredPlannerProviderGroq}
	planner, err := NewStructuredPlanner(groq)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	result, err := planner.Plan(ctx, StructuredPlannerRequest{Question: "hello"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if result.UsedLocalFallback {
		t.Fatalf("cancellation must not become a local fallback: %+v", result)
	}
	if groq.calls != 0 {
		t.Fatalf("provider was called %d times after cancellation", groq.calls)
	}
}

func TestNewStructuredPlannerValidatesProviderSet(t *testing.T) {
	groq := &structuredPlannerMockProvider{name: StructuredPlannerProviderGroq}
	if _, err := NewStructuredPlanner(); err == nil {
		t.Fatal("constructor accepted an empty provider set")
	}
	if _, err := NewStructuredPlanner(groq, groq); err == nil {
		t.Fatal("constructor accepted duplicate providers")
	}
	unsupported := &structuredPlannerMockProvider{name: "unsupported_local_provider"}
	if _, err := NewStructuredPlanner(unsupported); err == nil {
		t.Fatal("constructor accepted an unsupported provider")
	}
}

// Providers write null where the contract asks for an empty list often enough
// that rejecting it cost correct routing in live measurement: a plan that was
// right in every other respect was thrown away over the spelling of "nothing".
// Null and [] are folded together at the wire boundary; every other malformed
// shape is still rejected.
func TestParseStructuredPlannerResolvedPlanAcceptsNullForEmptyLists(t *testing.T) {
	validJSON := structuredPlannerTestJSON(t, structuredPlannerTestPlan("hello"))
	for _, field := range []string{"metrics", "group_by", "entities", "filters"} {
		raw := strings.Replace(string(validJSON), `"`+field+`":[]`, `"`+field+`":null`, 1)
		if raw == string(validJSON) {
			t.Fatalf("fixture does not contain an empty %q list to replace", field)
		}
		plan, err := ParseStructuredPlannerResolvedPlan(raw, "hello")
		if err != nil {
			t.Fatalf("null %s should be read as an empty list, got: %v", field, err)
		}
		switch field {
		case "metrics":
			if plan.Parameters.Metrics == nil {
				continue // nil and empty both mean "none specified"
			}
		case "group_by":
			if len(plan.Parameters.GroupBy) > 1 {
				t.Fatalf("null group_by produced %v", plan.Parameters.GroupBy)
			}
		}
	}

	// A null where a value is genuinely required must still fail.
	broken := strings.Replace(string(validJSON), `"task":`, `"task":null,"ignored":`, 1)
	if _, err := ParseStructuredPlannerResolvedPlan(broken, "hello"); err == nil {
		t.Fatal("a null on a required scalar field must still be rejected")
	}
}

// An unknown field is ignored, not fatal. Groq's gpt-oss-20b wrote a whole
// correct plan and then appended one stray "resolved_plan" key; rejecting the
// answer over it lost the plan and the user got an apology. Nothing unknown
// reaches any code, and a renamed field is still caught, because the name the
// contract requires would then be missing.
func TestParseStructuredPlannerIgnoresUnknownFields(t *testing.T) {
	validJSON := structuredPlannerTestJSON(t, structuredPlannerTestPlan("hello"))
	var withExtra map[string]any
	if err := json.Unmarshal([]byte(validJSON), &withExtra); err != nil {
		t.Fatal(err)
	}
	withExtra["unexpected"] = true
	withExtra["resolved_plan"] = "{\"metrics\":[]}"
	encoded, err := json.Marshal(withExtra)
	if err != nil {
		t.Fatal(err)
	}

	plan, err := ParseStructuredPlannerResolvedPlan(string(encoded), "hello")
	if err != nil {
		t.Fatalf("คีย์นอกสัญญาไม่ควรทำให้แผนที่ถูกต้องถูกทิ้ง: %v", err)
	}
	if plan.Task != AITaskGeneralChat {
		t.Fatalf("task = %q, want %q", plan.Task, AITaskGeneralChat)
	}

	// A missing required field must still fail: that is what strictness was for.
	delete(withExtra, "tool_hint")
	encoded, err = json.Marshal(withExtra)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseStructuredPlannerResolvedPlan(string(encoded), "hello"); err == nil {
		t.Fatal("ฟิลด์ที่สัญญาบังคับหายไป ต้องยังถูกปฏิเสธ")
	}
}
