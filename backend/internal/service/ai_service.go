package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"Project-M/internal/repository"
)

var errRateLimit = errors.New("rate limit exceeded")

type AIService struct {
	repo                       *repository.AIRepository
	httpClient                 *http.Client
	groqKeyIndex               uint32
	geminiKeyIndex             uint32
	conversationStore          AIConversationStore
	conversationCleanupCounter uint64
	// providerAdapters is nil in production and resolves lazily to Groq then
	// Gemini. Tests may inject provider-neutral fakes without making live calls.
	providerAdapters []aiProviderAdapter
}

func ProvideAIService(repo *repository.AIRepository) *AIService {
	return &AIService{
		repo: repo,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// getAIProvider returns the configured AI provider mode.
// Valid values: "auto" | "groq" | "gemini" (default: "auto")
func (s *AIService) getAIProvider() string {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))
	switch v {
	case "groq", "gemini":
		return v
	}
	return "auto"
}

func ProvideAIServiceWithConversationStore(repo *repository.AIRepository, store AIConversationStore) *AIService {
	service := ProvideAIService(repo)
	service.conversationStore = store
	return service
}

func (s *AIService) classifyIntent(question string) (AIRouterResult, error) {
	provider := s.getAIProvider()
	for _, adapter := range s.orderedProviderAdapters() {
		if !adapter.Configured() {
			if provider != "auto" {
				return AIRouterResult{}, missingProviderConfigurationError(adapter.ID())
			}
			continue
		}
		result, err := adapter.Classify(question)
		if err == nil {
			return result, nil
		}
		aiStage("warn", "%s classifier failed: %v", adapter.DisplayName(), err)
	}

	// Preserve analytical usefulness if provider classification is unavailable.
	return AIRouterResult{
		Task:                AITaskAnalyzeData,
		Confidence:          0.5,
		NeedsRestaurantData: true,
		Risk:                "low",
	}, errors.New("failed to classify via any model, falling back to default analysis")
}

func parseRouterJSON(raw string) (AIRouterResult, error) {
	cleaned := strings.TrimSpace(raw)
	if strings.HasPrefix(cleaned, "```json") {
		cleaned = strings.TrimPrefix(cleaned, "```json")
		cleaned = strings.TrimSuffix(cleaned, "```")
	} else if strings.HasPrefix(cleaned, "```") {
		cleaned = strings.TrimPrefix(cleaned, "```")
		cleaned = strings.TrimSuffix(cleaned, "```")
	}
	cleaned = strings.TrimSpace(cleaned)
	var res AIRouterResult
	err := json.Unmarshal([]byte(cleaned), &res)
	if err != nil {
		return AIRouterResult{}, err
	}
	return enforceRouterPolicy(res)
}

func mapTaskToIntent(task AITask) AIIntent {
	switch task {
	case AITaskGeneralChat:
		return AIIntentChat
	case AITaskExplainConcept, AITaskScopeQuestion, AITaskProductHelp:
		return AIIntentCapability
	case AITaskRestaurantAdvice, AITaskRestaurantContent:
		return AIIntentChat
	case AITaskAnalyzeData, AITaskRetrieveFact, AITaskRecommendAction, "restaurant_data":
		return AIIntentAnalysis
	case AITaskRiskyAction:
		return AIIntentAnalysis
	case AITaskUnclear:
		return AIIntentUnclear
	case AITaskOutOfScope:
		return AIIntentOutOfScope
	default:
		return AIIntentUnclear
	}
}

func (s *AIService) AskOperations(restaurantID uint, req *AIAskRequest) (*AIAskResponse, error) {
	return s.askOperationsCore(restaurantID, req)
}

func (s *AIService) AskOperationsForOwner(actor AIActorContext, req *AIAskRequest) (*AIAskResponse, error) {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return nil, errors.New("authenticated restaurant owner context is required")
	}
	if req == nil {
		return nil, errors.New("AI request is required")
	}

	request := *req
	session, history, err := s.prepareConversationSession(actor, &request)
	if err != nil {
		return nil, err
	}
	request.History = history
	response, err := s.askOperationsCore(actor.RestaurantID, &request)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return response, nil
	}
	response.ConversationID = session.conversation.ID
	if err := s.persistConversationTurn(actor, session, request.Question, response); err != nil {
		aiStage("warn", "conversation turn was not persisted: %v", err)
	}
	return response, nil
}

func (s *AIService) askOperationsCore(restaurantID uint, req *AIAskRequest) (resp *AIAskResponse, err error) {
	question := strings.TrimSpace(req.Question)
	if question == "" {
		return nil, errors.New("question is required")
	}
	if len([]rune(question)) > 800 {
		return nil, errors.New("question is too long")
	}
	history := sanitizeConversationHistory(req.History)

	aiStage("input", "user asked: %q (history %d turns)", aiSnippet(question, 160), len(history))
	// Log how the request was ultimately answered, whichever branch returns.
	defer func() {
		switch {
		case err != nil:
			aiStage("done", "error: %v", err)
		case resp != nil:
			aiStage("done", "model=%s task=%s tool=%s intent=%s", resp.Model, resp.Task, aiToolOrDash(resp.Tool), resp.Intent)
		}
	}()

	// Local intent guards remain disabled: the AI Router handles classification,
	// while backend policy validates its proposed task and tool.
	var intent AIIntent

	// Step 1.5: Context resolution. A follow-up fragment ("แล้วอันที่สองล่ะ",
	// "ทำไม") is rewritten into a self-contained question using history, so the
	// assistant continues the conversation. Only references are resolved — every
	// figure is still looked up fresh downstream, never taken from history.
	// askedQuestion keeps the user's own wording; a rewrite can drop details the
	// structured path still needs (an ordinal such as "รองลงมา").
	askedQuestion := question
	if resolved, rewritten := s.resolveContextualQuestion(question, history); rewritten {
		aiStage("route", "context rewrite → %q", aiSnippet(resolved, 120))
		question = resolved
	}

	// Step 2: Structured JSON AI Router followed by backend policy enforcement.
	routerResult, routerErr := s.classifyIntent(question)
	if routerErr != nil {
		aiStage("route", "classifier unavailable (%v) → default to analysis", routerErr)
	} else {
		aiStage("route", "task=%s tool=%s conf=%.2f risk=%s needs_data=%v",
			routerResult.Task, aiToolOrDash(routerResult.SuggestedTool), routerResult.Confidence, routerResult.Risk, routerResult.NeedsRestaurantData)
	}

	// A rank follow-up ("อันดับรองลงมา") reads as vague to the router, but the
	// previous turn pins down exactly what is being ranked, so it is answerable.
	structuredFollowUp := hasStructuredRankFollowUp(question, askedQuestion, history)
	if structuredFollowUp {
		aiStage("route", "structured rank follow-up detected → skipping clarify/scope gates")
	}
	// "ข้อมูลมีถึงวันไหน" is answerable straight from the database, so it must not be
	// turned away by the clarify gate.
	if looksLikeDataCoverageQuestion(question) {
		aiStage("route", "data-coverage question detected → skipping clarify/scope gates")
		structuredFollowUp = true
	}

	// Step 3: Check Confidence Level and Unclear Input
	if (routerResult.Confidence < 0.65 || routerResult.Task == AITaskUnclear) && !structuredFollowUp {
		aiStage("flow", "clarify — unclear/low confidence (conf=%.2f) → ask user to specify", routerResult.Confidence)
		return &AIAskResponse{
			Answer:   "ผมอยากช่วยให้ตรงที่สุดครับ รบกวนระบุให้ชัดขึ้นอีกนิดได้ไหมครับ เช่น หมายถึงเมนูขายดี เมนูกำไรดี ยอดขายรวม หรือเช็กสต๊อกวัตถุดิบครับ",
			Intent:   AIIntentUnclear,
			Task:     AITaskUnclear,
			Model:    "local-router-fallback",
			Snapshot: AISnapshot{},
		}, nil
	}

	// Step 4: Block Risky Operations (Readiness & Safety Policy Guard)
	if routerResult.Task == AITaskRiskyAction || routerResult.Risk == "high" || routerResult.Risk == "medium" {
		aiStage("flow", "blocked — safety guard (task=%s risk=%s)", routerResult.Task, routerResult.Risk)
		return &AIAskResponse{
			Answer:   "ระบบความปลอดภัยไม่อนุญาตให้แก้ไขข้อมูลร้าน ลบข้อมูล หรือสั่งซื้อสินค้าโดยตรงผ่านแชทเพื่อป้องกันความผิดพลาดครับ รบกวนดำเนินการด้วยตนเองในหน้าเมนูจัดการที่เกี่ยวข้องนะครับ",
			Intent:   AIIntentAnalysis,
			Task:     AITaskRiskyAction,
			Model:    "local-safety-guard",
			Snapshot: AISnapshot{},
		}, nil
	}

	// The Router selects this known concept flow; backend supplies an exact,
	// stable definition instead of allowing a provider to redefine Margin.
	if routerResult.Task == AITaskExplainConcept && requestsMarginConceptExplanation(question) {
		aiStage("flow", "concept — margin definition (local policy)")
		answer, _ := localConceptAnswer(AITaskRoute{Task: AITaskExplainConcept})
		return &AIAskResponse{
			Answer:   answer,
			Intent:   AIIntentCapability,
			Task:     AITaskExplainConcept,
			Model:    "local-concept-policy",
			Snapshot: AISnapshot{},
		}, nil
	}

	// Block Out-of-Scope Requests (Focus Guard Policy - Dynamic AI Refusal)
	if routerResult.Task == AITaskOutOfScope && !structuredFollowUp {
		aiStage("flow", "out-of-scope — dynamic refusal")
		answer, model, err := s.askOutOfScopeWithRotation(question, history)
		if err == nil {
			return &AIAskResponse{
				Answer:   answer,
				Intent:   AIIntentOutOfScope,
				Task:     AITaskOutOfScope,
				Model:    model,
				Snapshot: AISnapshot{},
			}, nil
		}
		aiStage("warn", "out-of-scope dynamic refusal failed (%v) → static message", err)
		return &AIAskResponse{
			Answer:   "เรื่องนี้อยู่นอกขอบเขตที่ผมดูแลในฐานะผู้ช่วยร้านอาหาร แต่ช่วยได้เรื่องยอดขาย คลังวัตถุดิบ กำไรเมนู หรือแคปชั่นโปรโมทร้านครับ",
			Intent:   AIIntentOutOfScope,
			Task:     AITaskOutOfScope,
			Model:    "local-focus-guard-fallback",
			Snapshot: AISnapshot{},
		}, nil
	}

	intent = mapTaskToIntent(routerResult.Task)
	needsData := routerResult.NeedsRestaurantData || intent == AIIntentAnalysis
	if structuredFollowUp {
		// It is a read-only ranking question regardless of how the router labelled it.
		intent = AIIntentAnalysis
		needsData = true
	}

	// Step 5: Conversational Flow (Needs Data = False, 0 DB load)
	if !needsData {
		aiStage("flow", "conversational — no snapshot (task=%s)", routerResult.Task)
		request := aiProviderAnswerRequest{
			Question: question,
			History:  history,
			Mode:     aiProviderAnswerConversation,
		}
		for _, adapter := range s.orderedProviderAdapters() {
			if !adapter.Configured() {
				continue
			}
			answer, adapterErr := adapter.Answer(request)
			if adapterErr == nil {
				return &AIAskResponse{
					Answer:   answer.Text,
					Intent:   intent,
					Task:     routerResult.Task,
					Model:    answer.Model,
					Snapshot: AISnapshot{},
				}, nil
			}
			aiStage("warn", "conversational %s failed: %v", adapter.DisplayName(), adapterErr)
		}

		return nil, errors.New("AI ทุก provider ไม่สามารถตอบได้ขณะนี้ครับ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง")
	}

	// Step 6: Analytical Flow (Needs Data = True, DB snapshot load)
	//
	// These deterministic intercepts run from the most specific scope to the least,
	// because a broader one would otherwise swallow a narrower question: asking for
	// lunch on one day must not be answered with the whole month's total.

	// Sales for a service period ("ช่วงเที่ยงวันที่ 2 กรกฎาคม") — an hour window
	// within a day, finer than anything the day-level snapshot holds.
	if partResp, handled, pErr := s.answerDayPartSalesQuery(restaurantID, question); handled {
		aiStage("flow", "day-part sales query — hour-scoped range query")
		return partResp, nil
	} else if pErr != nil {
		aiStage("warn", "day-part sales query failed (%v) → snapshot flow", pErr)
	}

	// Tier 1-1: a dated total-sales question (a specific day, a named month, or a
	// month-to-month comparison) is answered directly from range queries, so it is
	// not limited to the rolling snapshot window.
	if datedResp, handled, derr := s.answerDatedSalesQuery(restaurantID, question); handled {
		aiStage("flow", "dated-sales — range query (bypassing rolling window)")
		return datedResp, nil
	} else if derr != nil {
		aiStage("warn", "dated-sales failed (%v) → snapshot flow", derr)
	}

	// "How far does the data reach?" — answered from the full history, not the
	// rolling window, so it works even when today has no sales.
	if covResp, handled, cErr := s.answerDataCoverage(restaurantID, question); handled {
		aiStage("flow", "data-coverage query")
		return covResp, nil
	} else if cErr != nil {
		aiStage("warn", "data-coverage query failed (%v) → snapshot flow", cErr)
	}

	// A menu question that names a calendar period is answered from that period's
	// own numbers, instead of the rolling analysis window.
	if menuResp, handled, mErr := s.answerPeriodMenuQuery(restaurantID, question, askedQuestion); handled {
		aiStage("flow", "menu-period query — range query (bypassing rolling window)")
		return menuResp, nil
	} else if mErr != nil {
		aiStage("warn", "menu-period query failed (%v) → snapshot flow", mErr)
	}

	aiStage("flow", "analytical — building %s snapshot", analysisWindowLabel())
	snapshot, err := s.buildSnapshot(restaurantID)
	if err != nil {
		return nil, err
	}
	if answer, guarded := localAnalyticalGuardrailAnswer(question, snapshot); guarded {
		aiStage("flow", "readiness guardrail (local) — data not ready for a business decision")
		return &AIAskResponse{
			Answer:   answer,
			Intent:   intent,
			Task:     routerResult.Task,
			Model:    "local-readiness-guardrail",
			Snapshot: snapshot,
		}, nil
	}

	toolToRun := routerResult.SuggestedTool

	// Structured query (intent-schema): handles ranks the one-tool-per-question
	// flow cannot express — "แพงรองลงมา", "กำไรดีอันดับสอง". Those used to fall back
	// to the #1 item, which reads as a wrong answer. It deliberately claims only
	// rank >= 2, so every existing rank-1 answer below is untouched.
	if answer, structuredTool, handled := structuredQueryAnswer(question, askedQuestion, history, snapshot); handled {
		aiStage("flow", "structured-query (rank>1) → %s", aiToolOrDash(structuredTool))
		return &AIAskResponse{
			Answer: answer,
			Intent: intent,
			// A ranking lookup is a fact retrieval, whatever the router called it.
			Task:     AITaskRetrieveFact,
			Tool:     structuredTool,
			Model:    "local-structured-query",
			Snapshot: snapshot,
		}, nil
	}

	// Deterministic-first: a fact lookup that maps to a supported tool is answered
	// straight from the snapshot data, skipping the free-form LLM. The LLM already
	// did its real job (understanding the question) in the router; letting it also
	// re-read the numbers only risks hallucinated figures, an irrelevant caveat, or
	// a different phrasing each time. Answering from the tool keeps fact replies
	// exact, identical on every ask, and free of prior-turn contamination.
	if routerResult.Task == AITaskRetrieveFact && isSupportedReadOnlyTool(toolToRun) {
		result, toolErr := executeReadOnlyTool(toolToRun, snapshot, question)
		if toolErr != nil {
			aiStage("warn", "deterministic-first tool %s failed (%v) → LLM flow", toolToRun, toolErr)
		} else if answer, ok := localToolAnswer(result); ok {
			aiStage("flow", "deterministic-first: %s (skipping free-form LLM)", toolToRun)
			return &AIAskResponse{
				Answer:   answer,
				Intent:   intent,
				Task:     routerResult.Task,
				Tool:     toolToRun,
				Model:    "local-tool-first",
				Snapshot: snapshot,
			}, nil
		}
	}

	// executeAnalytical runs one provider adapter and handles CALL_TOOL responses.
	executeAnalytical := func(adapter aiProviderAdapter) (*AIAskResponse, error) {
		providerName := adapter.DisplayName()
		providerAnswer, err := adapter.Answer(aiProviderAnswerRequest{
			Question: question,
			History:  history,
			Snapshot: &snapshot,
			Mode:     aiProviderAnswerAnalytical,
		})
		if err != nil {
			aiStage("warn", "analytical %s failed: %v", providerName, err)
			return nil, err
		}
		answer := providerAnswer.Text
		if strings.HasPrefix(answer, "CALL_TOOL:") {
			toolName := AIToolName(strings.TrimPrefix(answer, "CALL_TOOL:"))
			aiStage("flow", "%s requested tool %s → local deterministic answer", providerName, toolName)
			result, err := executeReadOnlyTool(toolName, snapshot, question)
			if err != nil {
				return nil, err
			}
			if toolAnswer, ok := localToolAnswer(result); ok {
				return &AIAskResponse{
					Answer:   toolAnswer,
					Intent:   intent,
					Task:     routerResult.Task,
					Tool:     toolName,
					Model:    "local-tool-confirmed",
					Snapshot: snapshot,
				}, nil
			}
			return nil, errors.New("read-only AI tool returned no presentable result")
		}
		aiStage("flow", "%s answered free-form (no tool — non-deterministic path)", providerName)
		return &AIAskResponse{
			Answer:   answer,
			Intent:   intent,
			Task:     routerResult.Task,
			Model:    providerAnswer.Model,
			Snapshot: snapshot,
		}, nil
	}

	for _, adapter := range s.orderedProviderAdapters() {
		if !adapter.Configured() {
			continue
		}
		if resp, err := executeAnalytical(adapter); err == nil {
			return resp, nil
		}
	}

	// Fallback to local hardcoded tool template only if the LLM analytical loop fails
	if toolToRun != "" {
		aiStage("flow", "all providers failed → local tool fallback %s", toolToRun)
		result, err := executeReadOnlyTool(toolToRun, snapshot, question)
		if err == nil {
			if answer, answered := localToolAnswer(result); answered {
				return &AIAskResponse{
					Answer:   answer,
					Intent:   intent,
					Task:     routerResult.Task,
					Tool:     toolToRun,
					Model:    "local-tool-fallback",
					Snapshot: snapshot,
				}, nil
			}
		}
	}

	return nil, errors.New("AI ทุก provider ไม่สามารถตอบได้ขณะนี้ครับ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง")
}

func (s *AIService) OperationsSnapshot(restaurantID uint) (*AISnapshot, error) {
	snapshot, err := s.buildSnapshot(restaurantID)
	if err != nil {
		return nil, err
	}
	return &snapshot, nil
}

// answerDatedSalesQuery handles Tier 1-1 dated total-sales questions with
// range-scoped repository queries that reach beyond the 14-day snapshot. It
// returns handled=false when the question is not a dated total-sales request, so
// the caller continues with the normal analytical flow.
func (s *AIService) answerDatedSalesQuery(restaurantID uint, question string) (*AIAskResponse, bool, error) {
	if s.repo == nil {
		return nil, false, nil
	}
	req, ok := resolveDatedSalesRequest(question, repository.BangkokNow())
	if !ok {
		return nil, false, nil
	}

	if req.comparison && len(req.periods) >= 2 {
		a, b := req.periods[0], req.periods[1]
		da, err := s.repo.SalesForRange(restaurantID, a.Start, a.End)
		if err != nil {
			return nil, false, err
		}
		db, err := s.repo.SalesForRange(restaurantID, b.Start, b.End)
		if err != nil {
			return nil, false, err
		}
		return &AIAskResponse{
			Answer:   formatDatedSalesComparison(a, da, b, db),
			Intent:   AIIntentAnalysis,
			Task:     AITaskRetrieveFact,
			Tool:     AIToolGetSalesForPeriod,
			Model:    "local-period-range",
			Snapshot: AISnapshot{},
		}, true, nil
	}

	p := req.periods[0]
	d, err := s.repo.SalesForRange(restaurantID, p.Start, p.End)
	if err != nil {
		return nil, false, err
	}
	return &AIAskResponse{
		Answer:   formatDatedSalesAnswer(p, d),
		Intent:   AIIntentAnalysis,
		Task:     AITaskRetrieveFact,
		Tool:     AIToolGetSalesForPeriod,
		Model:    "local-period-range",
		Snapshot: AISnapshot{},
	}, true, nil
}

func (s *AIService) validateAndIntercept(res AIFinalJSONResponse, result AIToolResult, snapshot AISnapshot) string {
	if toolAnswer, ok := localToolAnswer(result); ok {
		return toolAnswer
	}
	answer := res.Answer
	verify := res.Verify
	var corrections []string

	switch result.Tool {
	case AIToolGetLowestMarginMenu:
		if len(snapshot.LowMarginMenus) > 0 {
			actual := snapshot.LowMarginMenus[0]
			mismatch := false
			if verify.LowestMarginMenuName != "" && verify.LowestMarginMenuName != actual.MenuName {
				mismatch = true
			}
			if verify.Quantity != 0 && verify.Quantity != int(actual.Quantity) {
				mismatch = true
			}
			if verify.Revenue != 0 && !almostEqual(verify.Revenue, actual.Revenue) {
				mismatch = true
			}
			if verify.Cost != 0 && !almostEqual(verify.Cost, actual.Cost) {
				mismatch = true
			}
			if verify.Profit != 0 && !almostEqual(verify.Profit, actual.Profit) {
				mismatch = true
			}
			if verify.Margin != 0 && !almostEqual(verify.Margin, actual.Margin) {
				mismatch = true
			}
			if mismatch {
				quantity := float64(actual.Quantity)
				corrections = append(corrections, fmt.Sprintf(
					"เมนู %s, ขายได้ %d จาน, รายได้ %.2f บาท, ต้นทุน %.2f บาท, กำไร %.2f บาท, Margin %.2f%%, ต้นทุนเฉลี่ยต่อจาน %.2f บาท, กำไรเฉลี่ยต่อจาน %.2f บาท",
					actual.MenuName,
					actual.Quantity,
					actual.Revenue,
					actual.Cost,
					actual.Profit,
					actual.Margin,
					actual.Cost/quantity,
					actual.Profit/quantity,
				))
			}
		}
	case AIToolGetLowStockIngredients:
		actualOut := snapshot.InventorySummary.OutItems
		actualLow := snapshot.InventorySummary.LowItems
		mismatch := false
		if verify.LowStockCount != 0 && verify.LowStockCount != actualLow {
			mismatch = true
		}
		if verify.OutOfStockCount != 0 && verify.OutOfStockCount != actualOut {
			mismatch = true
		}
		if mismatch {
			corrections = append(corrections, fmt.Sprintf(
				"วัตถุดิบใกล้หมด %d รายการ, หมดสต็อก %d รายการ",
				actualLow,
				actualOut,
			))
		}
	case AIToolGetTopSellingMenus:
		if len(snapshot.TopMenuItems) > 0 {
			actual := snapshot.TopMenuItems[0]
			mismatch := false
			if verify.TopMenuName != "" && verify.TopMenuName != actual.MenuName {
				mismatch = true
			}
			if verify.TopMenuQuantity != 0 && verify.TopMenuQuantity != int(actual.Quantity) {
				mismatch = true
			}
			if mismatch {
				corrections = append(corrections, fmt.Sprintf(
					"%s ขายได้ %d จาน",
					actual.MenuName,
					actual.Quantity,
				))
			}
		}
	case AIToolGetInventoryValuation:
		actualTotal := snapshot.InventorySummary.TotalItems
		actualVal := snapshot.InventorySummary.Value
		mismatch := false
		if verify.TotalItems != 0 && verify.TotalItems != actualTotal {
			mismatch = true
		}
		if verify.TotalValue != 0 && !almostEqual(verify.TotalValue, actualVal) {
			mismatch = true
		}
		if mismatch {
			corrections = append(corrections, fmt.Sprintf(
				"ทั้งหมด %d รายการ, มูลค่ารวม %.2f บาท",
				actualTotal,
				actualVal,
			))
		}
	}

	if len(corrections) > 0 {
		return fmt.Sprintf("%s\n\n*(หมายเหตุความถูกต้อง: ค่าที่แสดงในบทวิเคราะห์คลาดเคลื่อนจากฐานข้อมูล จริงคือ: %s)*", answer, strings.Join(corrections, "\n"))
	}
	return answer
}

// parseIntent is kept for backward compatibility and testing purposes.
func parseIntent(answer string) AIIntent {
	normalized := strings.ToUpper(strings.TrimSpace(answer))
	labels := []struct {
		label  string
		intent AIIntent
	}{
		{label: "GREETING", intent: AIIntentGreeting},
		{label: "CAPABILITIES", intent: AIIntentCapability},
		{label: "UNCLEAR", intent: AIIntentUnclear},
		{label: "CONVERSATION", intent: AIIntentChat},
		{label: "OUT_OF_SCOPE", intent: AIIntentOutOfScope},
		{label: "ANALYSIS", intent: AIIntentAnalysis},
	}
	for _, candidate := range labels {
		if strings.HasPrefix(normalized, candidate.label) {
			return candidate.intent
		}
	}
	return AIIntentAnalysis
}
