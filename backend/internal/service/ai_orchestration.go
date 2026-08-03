package service

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"Project-M/internal/repository"
)

const structuredPlannerTotalTimeout = 35 * time.Second

type aiOrchestratorMode string

const (
	aiOrchestratorLegacy  aiOrchestratorMode = "legacy"
	aiOrchestratorShadow  aiOrchestratorMode = "shadow"
	aiOrchestratorPlanner aiOrchestratorMode = "planner"
)

type aiPreparedOrchestration struct {
	plan             ResolvedPlan
	router           AIRouterResult
	candidateTools   []AIToolName
	plannerProvider  StructuredPlannerProviderName
	plannerModel     string
	providerFallback bool
	localFallback    bool
	attemptCount     int
	clarification    string
}

func aiOrchestrationMode() aiOrchestratorMode {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AI_ORCHESTRATOR_MODE"))) {
	case string(aiOrchestratorShadow):
		return aiOrchestratorShadow
	case string(aiOrchestratorPlanner):
		return aiOrchestratorPlanner
	default:
		return aiOrchestratorLegacy
	}
}

func (s *AIService) prepareOwnerOrchestration(ctx context.Context, actor AIActorContext, req *AIAskRequest) (*aiPreparedOrchestration, error) {
	mode := aiOrchestrationMode()
	if mode == aiOrchestratorLegacy {
		return nil, nil
	}
	if ctx == nil {
		return nil, errors.New("AI orchestration context is required")
	}

	planner, err := s.runtimeStructuredPlanner()
	if err != nil {
		if mode == aiOrchestratorShadow {
			aiStage("warn", "structured planner shadow is unavailable: %v", err)
			return nil, nil
		}
		return nil, err
	}

	plannerContext, cancel := context.WithTimeout(ctx, structuredPlannerTotalTimeout)
	defer cancel()
	result, err := planner.Plan(plannerContext, StructuredPlannerRequest{
		Question:      req.Question,
		Context:       plannerContextFromHistory(req.History),
		ReferenceTime: repository.BangkokNow(),
	})
	if err != nil {
		if mode == aiOrchestratorShadow && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			aiStage("warn", "structured planner shadow failed: %v", err)
			return nil, nil
		}
		return nil, err
	}

	prepared, err := prepareAuthorizedPlannerResult(result, actor)
	if mode == aiOrchestratorShadow {
		if err != nil {
			aiStage("warn", "structured planner shadow policy rejected task=%s: %v", result.Plan.Task, err)
		} else {
			aiStage("route", "structured planner shadow task=%s tool=%s provider=%s fallback=%v",
				prepared.router.Task, aiToolOrDash(prepared.router.SuggestedTool), prepared.plannerProvider,
				prepared.providerFallback || prepared.localFallback)
		}
		return nil, nil
	}
	return prepared, err
}

func (s *AIService) runtimeStructuredPlanner() (*StructuredPlanner, error) {
	providers := s.structuredPlannerProviders
	if provider := s.getAIProvider(); provider != "auto" {
		selected := make([]StructuredPlannerProvider, 0, 1)
		for _, candidate := range providers {
			if string(candidate.Name()) == provider {
				selected = append(selected, candidate)
				break
			}
		}
		providers = selected
	}
	return NewStructuredPlanner(providers...)
}

func plannerContextFromHistory(history []AIConversationMessage) []StructuredPlannerContextItem {
	history = sanitizeConversationHistory(history)
	items := make([]StructuredPlannerContextItem, 0, len(history))
	for index, message := range history {
		items = append(items, StructuredPlannerContextItem{
			ID:      plannerContextID(index),
			Source:  ResolvedPlanSourceConversation,
			Role:    message.Role,
			Content: message.Content,
		})
	}
	return items
}

func plannerContextID(index int) string {
	const digits = "0123456789abcdefghijklmnopqrstuvwxyz"
	value := index + 1
	if value < len(digits) {
		return "context-" + string(digits[value])
	}
	return "context-overflow"
}

func prepareAuthorizedPlannerResult(result StructuredPlannerResult, actor AIActorContext) (*aiPreparedOrchestration, error) {
	plan := result.Plan
	prepared := &aiPreparedOrchestration{
		plan:             plan,
		plannerProvider:  result.Provider,
		plannerModel:     result.Model,
		providerFallback: result.UsedProviderFallback,
		localFallback:    result.UsedLocalFallback,
		attemptCount:     len(result.Attempts),
	}

	if plan.Resolution.NeedsClarification || plan.Task == AITaskUnclear || plan.Operation == ResolvedPlanOperationClarify {
		prepared.router = plannerRouterResult(plan, AICapabilityDecision{})
		return prepared, nil
	}
	if !plan.Policy.ReadOnly || plan.Policy.Risk != ResolvedPlanRiskLow ||
		plan.Task == AITaskRiskyAction || plan.Operation == ResolvedPlanOperationDraftAction ||
		plan.Operation == ResolvedPlanOperationExecuteAction {
		prepared.router = plannerRouterResult(plan, AICapabilityDecision{})
		prepared.router.Task = AITaskRiskyAction
		prepared.router.Risk = string(plan.Policy.Risk)
		if prepared.router.Risk == string(ResolvedPlanRiskLow) {
			prepared.router.Risk = string(ResolvedPlanRiskHigh)
		}
		return prepared, nil
	}

	decision, err := AuthorizeResolvedPlan(plan, actor)
	if err != nil {
		return nil, err
	}
	prepared.candidateTools = append([]AIToolName(nil), decision.CandidateTools...)
	prepared.router = plannerRouterResult(plan, decision)
	if prepared.router.NeedsRestaurantData && len(prepared.candidateTools) == 0 {
		prepared.router = AIRouterResult{
			Task:       AITaskUnclear,
			Confidence: 0,
			Risk:       string(ResolvedPlanRiskLow),
		}
		prepared.clarification = "ตอนนี้ผมยังไม่มีเครื่องมืออ่านข้อมูลส่วนนี้ของร้านอย่างปลอดภัยครับ ลองถามเรื่องยอดขาย เมนู ต้นทุน หรือสต๊อกวัตถุดิบก่อนได้ครับ"
	}
	return prepared, nil
}

func plannerRouterResult(plan ResolvedPlan, decision AICapabilityDecision) AIRouterResult {
	intent := mapTaskToIntent(plan.Task)
	needsData := intent == AIIntentAnalysis && plan.Task != AITaskRiskyAction
	return AIRouterResult{
		Task:                plan.Task,
		Confidence:          plan.Resolution.Confidence,
		NeedsRestaurantData: needsData,
		NeedsTool:           decision.SelectedTool != "",
		Risk:                string(plan.Policy.Risk),
		SuggestedTool:       decision.SelectedTool,
	}
}

func attachPreparedOrchestration(response *AIAskResponse, prepared *aiPreparedOrchestration) {
	if response == nil || prepared == nil {
		return
	}
	plan := prepared.plan
	response.ResolvedPlan = &plan
	response.CandidateTools = append([]AIToolName(nil), prepared.candidateTools...)
	response.Planner = &AIPlannerMetadata{
		Provider:         prepared.plannerProvider,
		Model:            prepared.plannerModel,
		ProviderFallback: prepared.providerFallback,
		LocalFallback:    prepared.localFallback,
		AttemptCount:     prepared.attemptCount,
	}
}

func candidateToolsForProvider(prepared *aiPreparedOrchestration) []AIToolName {
	if prepared == nil {
		return nil
	}
	return append([]AIToolName(nil), prepared.candidateTools...)
}

func validatePreparedResponseTool(response *AIAskResponse, prepared *aiPreparedOrchestration) error {
	if response == nil || prepared == nil || response.Tool == "" {
		return nil
	}
	if !containsAITool(prepared.candidateTools, response.Tool) {
		return errors.New("AI response used a tool outside the authorized candidate set")
	}
	return nil
}
