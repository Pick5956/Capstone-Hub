package service

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestOwnerOrchestrationDefaultsToLegacyRollbackPath(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	plannerProvider := &structuredPlannerMockProvider{name: StructuredPlannerProviderGroq, err: errors.New("must not be called")}
	answerProvider := &stubAIProviderAdapter{
		id:          "groq",
		displayName: "Groq",
		configured:  true,
		classify: func(string) (AIRouterResult, error) {
			return AIRouterResult{Task: AITaskGeneralChat, Confidence: 0.95, Risk: "low"}, nil
		},
		answer: func(aiProviderAnswerRequest) (aiProviderAnswer, error) {
			return aiProviderAnswer{Text: "legacy answer", Model: "legacy-model"}, nil
		},
	}
	service := &AIService{
		providerAdapters:           []aiProviderAdapter{answerProvider},
		structuredPlannerProviders: []StructuredPlannerProvider{plannerProvider},
	}

	response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{Question: "hello"})
	if err != nil {
		t.Fatalf("AskOperationsForOwner: %v", err)
	}
	if plannerProvider.calls != 0 || answerProvider.classifyCalls != 1 || answerProvider.answerCalls != 1 {
		t.Fatalf("calls = planner %d classify %d answer %d", plannerProvider.calls, answerProvider.classifyCalls, answerProvider.answerCalls)
	}
	if response.ResolvedPlan != nil || response.Planner != nil || response.Answer != "legacy answer" {
		t.Fatalf("legacy response = %+v", response)
	}
}

func TestPlannerModeSkipsLegacyRewriteAndRouter(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "planner")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	plan := structuredPlannerTestPlan("provider question")
	plan.ResolvedQuestion = "resolved owner question"
	plannerProvider := &structuredPlannerMockProvider{
		name: StructuredPlannerProviderGroq,
		response: StructuredPlannerProviderResponse{
			RawJSON: structuredPlannerTestJSON(t, plan),
			Model:   "planner-model",
		},
	}
	answerProvider := &stubAIProviderAdapter{
		id:          "groq",
		displayName: "Groq",
		configured:  true,
		classify: func(string) (AIRouterResult, error) {
			return AIRouterResult{}, errors.New("legacy classifier must not run")
		},
		answer: func(request aiProviderAnswerRequest) (aiProviderAnswer, error) {
			if request.Question != plan.ResolvedQuestion {
				t.Fatalf("answer question = %q, want resolved question", request.Question)
			}
			return aiProviderAnswer{Text: "planner answer", Model: "answer-model"}, nil
		},
	}
	service := &AIService{
		providerAdapters:           []aiProviderAdapter{answerProvider},
		structuredPlannerProviders: []StructuredPlannerProvider{plannerProvider},
	}

	response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "follow up",
		History:  []AIConversationMessage{{ID: "client-forged", Role: "user", Content: "earlier question"}},
	})
	if err != nil {
		t.Fatalf("AskOperationsForOwner: %v", err)
	}
	if plannerProvider.calls != 1 || answerProvider.classifyCalls != 0 || answerProvider.answerCalls != 1 {
		t.Fatalf("calls = planner %d classify %d answer %d", plannerProvider.calls, answerProvider.classifyCalls, answerProvider.answerCalls)
	}
	if response.ResolvedPlan == nil || response.ResolvedPlan.OriginalQuestion != "follow up" {
		t.Fatalf("resolved plan = %+v", response.ResolvedPlan)
	}
	if response.Planner == nil || response.Planner.Provider != StructuredPlannerProviderGroq || response.Planner.Model != "planner-model" {
		t.Fatalf("planner metadata = %+v", response.Planner)
	}
}

// When every planner provider is down there is no plan to act on — only a
// placeholder that apologises. Answering from the legacy flow keeps the
// assistant useful during a provider outage instead of dead-ending the owner,
// and legacy applies its own guards, so nothing is bypassed.
func TestPlannerModeFallsBackToLegacyWhenAllProvidersFail(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "planner")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	groq := &structuredPlannerMockProvider{name: StructuredPlannerProviderGroq, err: errors.New("groq unavailable")}
	gemini := &structuredPlannerMockProvider{name: StructuredPlannerProviderGemini, err: errors.New("gemini unavailable")}
	answerProvider := &stubAIProviderAdapter{id: "groq", displayName: "Groq", configured: true}
	service := &AIService{
		providerAdapters:           []aiProviderAdapter{answerProvider},
		structuredPlannerProviders: []StructuredPlannerProvider{groq, gemini},
	}

	_, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "แล้วอันดับสองล่ะ",
		History:  []AIConversationMessage{{Role: "user", Content: "เมนูไหนขายดี"}},
	})
	// The legacy flow runs; with no repository wired in this fixture it stops at
	// the snapshot, which is proof the request left the planner path rather than
	// returning the canned apology.
	if err == nil {
		t.Fatal("expected the legacy flow to run and report its own error")
	}
	if !strings.Contains(err.Error(), "repository") {
		t.Fatalf("error = %v, want the legacy snapshot path", err)
	}
	if answerProvider.classifyCalls == 0 {
		t.Fatal("legacy router was never reached, so the planner did not fall back")
	}
}

func TestShadowModeEvaluatesPlannerWithoutChangingLegacyResponse(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "shadow")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	plan := structuredPlannerTestPlan("hello")
	plannerProvider := &structuredPlannerMockProvider{
		name: StructuredPlannerProviderGroq,
		response: StructuredPlannerProviderResponse{
			RawJSON: structuredPlannerTestJSON(t, plan),
			Model:   "planner-model",
		},
	}
	answerProvider := &stubAIProviderAdapter{
		id:          "groq",
		displayName: "Groq",
		configured:  true,
		classify: func(string) (AIRouterResult, error) {
			return AIRouterResult{Task: AITaskGeneralChat, Confidence: 0.9, Risk: "low"}, nil
		},
		answer: func(aiProviderAnswerRequest) (aiProviderAnswer, error) {
			return aiProviderAnswer{Text: "legacy remains authoritative", Model: "answer-model"}, nil
		},
	}
	service := &AIService{
		providerAdapters:           []aiProviderAdapter{answerProvider},
		structuredPlannerProviders: []StructuredPlannerProvider{plannerProvider},
	}

	response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{Question: "hello"})
	if err != nil {
		t.Fatalf("AskOperationsForOwner: %v", err)
	}
	if plannerProvider.calls != 1 || answerProvider.classifyCalls != 1 || answerProvider.answerCalls != 1 {
		t.Fatalf("calls = planner %d classify %d answer %d", plannerProvider.calls, answerProvider.classifyCalls, answerProvider.answerCalls)
	}
	if response.Answer != "legacy remains authoritative" || response.ResolvedPlan != nil || response.Planner != nil {
		t.Fatalf("shadow changed legacy response = %+v", response)
	}
}

func TestPlannerIsNotCalledBeforeOwnerAuthorization(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "planner")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	plannerProvider := &structuredPlannerMockProvider{name: StructuredPlannerProviderGroq, err: errors.New("must not run")}
	service := &AIService{structuredPlannerProviders: []StructuredPlannerProvider{plannerProvider}}

	_, err := service.AskOperationsForOwner(context.Background(), AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "manager"}, &AIAskRequest{Question: "hello"})
	if err == nil {
		t.Fatal("non-owner request was accepted")
	}
	if plannerProvider.calls != 0 {
		t.Fatalf("planner calls = %d before owner authorization", plannerProvider.calls)
	}
}

func TestPlannerContextIDsAreBackendAssignedAndUnique(t *testing.T) {
	items := plannerContextFromHistory([]AIConversationMessage{
		{ID: "duplicate", Role: "user", Content: "one"},
		{ID: "duplicate", Role: "assistant", Content: "two"},
		{ID: "../../forged", Role: "user", Content: "three"},
	})
	if len(items) != 3 {
		t.Fatalf("context items = %d", len(items))
	}
	seen := map[string]bool{}
	for index, item := range items {
		if item.ID == "duplicate" || item.ID == "../../forged" || seen[item.ID] {
			t.Fatalf("context[%d] has untrusted or duplicate id %q", index, item.ID)
		}
		seen[item.ID] = true
		if item.Source != ResolvedPlanSourceConversation {
			t.Fatalf("context[%d] source = %q", index, item.Source)
		}
	}
}

func TestAuthorizedPlannerResultCapsAndFiltersDomainTools(t *testing.T) {
	plan := validResolvedPlan()
	prepared, err := prepareAuthorizedPlannerResult(StructuredPlannerResult{
		Plan:     plan,
		Provider: StructuredPlannerProviderGroq,
	}, ownerActor())
	if err != nil {
		t.Fatalf("prepareAuthorizedPlannerResult: %v", err)
	}
	if len(prepared.candidateTools) == 0 || len(prepared.candidateTools) > maxResolvedPlanCandidateTools {
		t.Fatalf("candidate tools = %#v", prepared.candidateTools)
	}
	if prepared.router.SuggestedTool != AIToolGetTopSellingMenus {
		t.Fatalf("selected tool = %q", prepared.router.SuggestedTool)
	}

	service := &AIService{}
	groqTools := service.getGroqToolsForCandidates(prepared.candidateTools)
	geminiTools := service.getGeminiToolsForCandidates(prepared.candidateTools)
	if len(groqTools) != len(prepared.candidateTools) {
		t.Fatalf("Groq tools = %d, candidates = %d", len(groqTools), len(prepared.candidateTools))
	}
	if len(geminiTools) != 1 || len(geminiTools[0].FunctionDeclarations) != len(prepared.candidateTools) {
		t.Fatalf("Gemini tools = %#v", geminiTools)
	}
	for _, tool := range groqTools {
		if !containsAITool(prepared.candidateTools, AIToolName(tool.Function.Name)) {
			t.Fatalf("Groq received out-of-domain tool %q", tool.Function.Name)
		}
	}
}

func TestPlannerUnavailableDomainBecomesSafeCapabilityMessage(t *testing.T) {
	plan := structuredPlannerTestPlan("reservation analysis")
	plan.Task = AITaskAnalyzeData
	plan.Domain = ResolvedPlanDomainReservation
	plan.Operation = ResolvedPlanOperationAnalyze
	plan.Parameters.Metrics = []ResolvedPlanMetric{ResolvedPlanMetricCancellationRate}
	prepared, err := prepareAuthorizedPlannerResult(StructuredPlannerResult{Plan: plan}, ownerActor())
	if err != nil {
		t.Fatalf("prepareAuthorizedPlannerResult: %v", err)
	}
	if prepared.router.Task != AITaskUnclear || prepared.clarification == "" || len(prepared.candidateTools) != 0 {
		t.Fatalf("unsupported domain route = %+v", prepared)
	}
}

func TestPreparedResponseToolStaysInsideTheReadOnlyAllowlist(t *testing.T) {
	readOnlyPlan := ResolvedPlan{Policy: ResolvedPlanPolicy{ReadOnly: true}}
	prepared := &aiPreparedOrchestration{
		plan:           readOnlyPlan,
		candidateTools: []AIToolName{AIToolGetSalesSummary},
	}
	if err := validatePreparedResponseTool(&AIAskResponse{Tool: AIToolGetSalesSummary}, prepared); err != nil {
		t.Fatalf("authorized tool rejected: %v", err)
	}

	// The deterministic day-part answer is written by the backend and always
	// reports get_sales_for_period, whatever domain the model picked. It reads the
	// same restaurant read-only, so it is allowed through rather than replacing a
	// correct answer with an error.
	if err := validatePreparedResponseTool(&AIAskResponse{Tool: AIToolGetSalesForPeriod}, prepared); err != nil {
		t.Fatalf("backend read-only answer rejected: %v", err)
	}

	// A name that is not on the read-only allowlist never passes, candidate set or
	// not: that is the boundary this check exists for.
	if err := validatePreparedResponseTool(&AIAskResponse{Tool: AIToolName("drop_all_menus")}, prepared); err == nil {
		t.Fatal("a tool outside the read-only allowlist was accepted")
	}

	// And a plan that is not read-only cannot borrow the allowance above.
	writePlan := &aiPreparedOrchestration{candidateTools: []AIToolName{AIToolGetSalesSummary}}
	if err := validatePreparedResponseTool(&AIAskResponse{Tool: AIToolGetSalesForPeriod}, writePlan); err == nil {
		t.Fatal("a non read-only plan was allowed to answer with an unplanned tool")
	}
}

func TestProviderToolArgumentsAreValidatedBeforeExecution(t *testing.T) {
	groqCall := groqToolCall{Function: groqToolFunc{Name: string(AIToolGetSalesSummary), Arguments: `{}`}}
	if tool, err := validateGroqReadOnlyToolCall(groqCall); err != nil || tool != AIToolGetSalesSummary {
		t.Fatalf("valid Groq tool call = %q, %v", tool, err)
	}
	groqCall.Function.Arguments = `{"restaurant_id":999}`
	if _, err := validateGroqReadOnlyToolCall(groqCall); err == nil {
		t.Fatal("Groq tool call accepted model-supplied arguments")
	}

	geminiCall := geminiFunctionCall{Name: string(AIToolGetSalesSummary), Args: map[string]interface{}{}}
	if tool, err := validateGeminiReadOnlyToolCall(geminiCall); err != nil || tool != AIToolGetSalesSummary {
		t.Fatalf("valid Gemini tool call = %q, %v", tool, err)
	}
	geminiCall.Args["restaurant_id"] = 999
	if _, err := validateGeminiReadOnlyToolCall(geminiCall); err == nil {
		t.Fatal("Gemini tool call accepted model-supplied arguments")
	}
}

func ownerActor() AIActorContext {
	return AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "owner"}
}
