package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"Project-M/internal/repository"
)

var errRateLimit = errors.New("rate limit exceeded")

type AIService struct {
	repo           *repository.AIRepository
	httpClient     *http.Client
	groqKeyIndex   uint32
	geminiKeyIndex uint32
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
// Valid values: "auto" | "groq" | "gemini" | "ollama" (default: "auto")
func (s *AIService) getAIProvider() string {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))
	switch v {
	case "groq", "gemini", "ollama":
		return v
	}
	return "auto"
}

func (s *AIService) classifyIntent(question string) (AIRouterResult, error) {
	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()
	provider := s.getAIProvider()

	if provider == "groq" || provider == "auto" {
		if len(groqKeys) == 0 && provider == "groq" {
			return AIRouterResult{}, errors.New("GROQ_API_KEYS is not configured")
		}
		numKeys := len(groqKeys)
		for i := 0; i < numKeys; i++ {
			idx := atomic.AddUint32(&s.groqKeyIndex, 1) - 1
			currentKey := groqKeys[idx%uint32(numKeys)]

			answer, err := s.executeClassifierGroq(question, currentKey)
			if err == nil {
				res, parseErr := parseRouterJSON(answer)
				if parseErr == nil {
					return res, nil
				}
				fmt.Printf("[AI Classifier] Groq Key succeeded but JSON parse failed: %v, body: %s\n", parseErr, answer)
			} else {
				fmt.Printf("[AI Classifier] Groq Key %d/%d failed: %v, rotating...\n", (idx%uint32(numKeys))+1, numKeys, err)
			}
		}
	}

	if provider == "gemini" || provider == "auto" {
		if len(geminiKeys) == 0 && provider == "gemini" {
			return AIRouterResult{}, errors.New("GEMINI_API_KEYS is not configured")
		}
		numKeys := len(geminiKeys)
		for i := 0; i < numKeys; i++ {
			idx := atomic.AddUint32(&s.geminiKeyIndex, 1) - 1
			currentKey := geminiKeys[idx%uint32(numKeys)]

			answer, err := s.executeClassifierGemini(question, currentKey)
			if err == nil {
				res, parseErr := parseRouterJSON(answer)
				if parseErr == nil {
					return res, nil
				}
				fmt.Printf("[AI Classifier] Gemini Key succeeded but JSON parse failed: %v, body: %s\n", parseErr, answer)
			} else {
				fmt.Printf("[AI Classifier] Gemini Key %d/%d failed: %v, rotating...\n", (idx%uint32(numKeys))+1, numKeys, err)
			}
		}
	}

	if provider == "ollama" || provider == "auto" {
		answer, err := s.executeClassifierOllama(question)
		if err == nil {
			res, parseErr := parseRouterJSON(answer)
			if parseErr == nil {
				return res, nil
			}
			fmt.Printf("[AI Classifier] Ollama succeeded but JSON parse failed: %v, body: %s\n", parseErr, answer)
		} else {
			fmt.Printf("[AI Classifier] Ollama failed: %v\n", err)
		}
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
	question := strings.TrimSpace(req.Question)
	if question == "" {
		return nil, errors.New("question is required")
	}
	if len([]rune(question)) > 800 {
		return nil, errors.New("question is too long")
	}
	history := sanitizeConversationHistory(req.History)

	// Local intent guards remain disabled: the AI Router handles classification,
	// while backend policy validates its proposed task and tool.
	var intent AIIntent

	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()

	// Step 2: Structured JSON AI Router followed by backend policy enforcement.
	routerResult, routerErr := s.classifyIntent(question)
	if routerErr != nil {
		fmt.Printf("[AI Router] Warning: Classifier failed: %v. Defaulting to analysis.\n", routerErr)
	}

	// Step 3: Check Confidence Level and Unclear Input
	if routerResult.Confidence < 0.65 || routerResult.Task == AITaskUnclear {
		return &AIAskResponse{
			Answer:   "ผมยังไม่ค่อยมั่นใจในคำถามครับ รบกวนช่วยพิมพ์ระบุความต้องการให้ชัดเจนขึ้นอีกนิดได้ไหมครับ เช่น ถามเรื่องยอดขาย หรือให้ช่วยคิดแคปชั่นโปรโมทร้านครับ",
			Intent:   AIIntentUnclear,
			Task:     AITaskUnclear,
			Model:    "local-router-fallback",
			Snapshot: AISnapshot{},
		}, nil
	}

	// Step 4: Block Risky Operations (Readiness & Safety Policy Guard)
	if routerResult.Task == AITaskRiskyAction || routerResult.Risk == "high" || routerResult.Risk == "medium" {
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
	if routerResult.Task == AITaskOutOfScope {
		fmt.Printf("[AI Router] Diverting to Dynamic Out-of-Scope Refusal flow...\n")
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
		fmt.Printf("[AI Router] Dynamic Out-of-Scope failed: %v. Falling back to static message.\n", err)
		return &AIAskResponse{
			Answer:   "เรื่องนี้อยู่นอกขอบเขตที่ผมดูแลในฐานะผู้ช่วยร้านอาหารครับ ผมช่วยได้ในเรื่องยอดขาย วัตถุดิบ กำไรเมนู หรือแคปชั่นโปรโมทร้านครับ",
			Intent:   AIIntentOutOfScope,
			Task:     AITaskOutOfScope,
			Model:    "local-focus-guard-fallback",
			Snapshot: AISnapshot{},
		}, nil
	}

	intent = mapTaskToIntent(routerResult.Task)
	needsData := routerResult.NeedsRestaurantData || intent == AIIntentAnalysis

	// Step 5: Conversational Flow (Needs Data = False, 0 DB load)
	if !needsData {
		fmt.Printf("[AI Router] Diverting to conversational flow (%s / %s, 0 DB snapshot load)...\n", routerResult.Task, intent)

		provider := s.getAIProvider()

		tryConv := func(name string, fn func() (string, string, error)) (string, string, bool) {
			a, m, e := fn()
			if e == nil {
				return a, m, true
			}
			fmt.Printf("[AI Service] Conversational %s failed: %v\n", name, e)
			return "", "", false
		}

		var convOrder []func() (string, string, error)
		switch provider {
		case "groq":
			if len(groqKeys) > 0 {
				convOrder = append(convOrder, func() (string, string, error) {
					return s.askGroqWithRotation(question, history, nil, true)
				})
			}
		case "gemini":
			if len(geminiKeys) > 0 {
				convOrder = append(convOrder, func() (string, string, error) {
					return s.askGeminiWithRotation(question, history, nil, true)
				})
			}
		case "ollama":
			convOrder = append(convOrder, func() (string, string, error) {
				return s.askOllamaWithRotation(question, history, nil, true)
			})
		default: // auto: Groq → Gemini → Ollama
			if len(groqKeys) > 0 {
				convOrder = append(convOrder, func() (string, string, error) {
					return s.askGroqWithRotation(question, history, nil, true)
				})
			}
			if len(geminiKeys) > 0 {
				convOrder = append(convOrder, func() (string, string, error) {
					return s.askGeminiWithRotation(question, history, nil, true)
				})
			}
			convOrder = append(convOrder, func() (string, string, error) {
				return s.askOllamaWithRotation(question, history, nil, true)
			})
		}

		providerNames := []string{"Groq", "Gemini", "Ollama"}
		for i, fn := range convOrder {
			name := ""
			if i < len(providerNames) {
				name = providerNames[i]
			}
			if a, m, ok := tryConv(name, fn); ok {
				return &AIAskResponse{
					Answer:   a,
					Intent:   intent,
					Task:     routerResult.Task,
					Model:    m,
					Snapshot: AISnapshot{},
				}, nil
			}
		}

		return nil, errors.New("AI ทุก provider ไม่สามารถตอบได้ขณะนี้ครับ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง")
	}

	// Step 6: Analytical Flow (Needs Data = True, DB snapshot load)
	fmt.Println("[AI Router] Diverting to Rich Analytical business flow (Building DB Snapshot)...")
	snapshot, err := s.buildSnapshot(restaurantID)
	if err != nil {
		return nil, err
	}
	if answer, guarded := localAnalyticalGuardrailAnswer(question, snapshot); guarded {
		return &AIAskResponse{
			Answer:   answer,
			Intent:   intent,
			Task:     routerResult.Task,
			Model:    "local-readiness-guardrail",
			Snapshot: snapshot,
		}, nil
	}

	toolToRun := routerResult.SuggestedTool
	provider := s.getAIProvider()

	// executeAnalytical runs one provider's analytical call and handles CALL_TOOL responses.
	type analyticalFn func() (string, string, error)
	executeAnalytical := func(callFn analyticalFn, providerName string) (*AIAskResponse, error) {
		answer, model, err := callFn()
		if err != nil {
			fmt.Printf("[AI Service] Analytical %s failed: %v\n", providerName, err)
			return nil, err
		}
		if strings.HasPrefix(answer, "CALL_TOOL:") {
			toolName := AIToolName(strings.TrimPrefix(answer, "CALL_TOOL:"))
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
		return &AIAskResponse{
			Answer:   answer,
			Intent:   intent,
			Task:     routerResult.Task,
			Model:    model,
			Snapshot: snapshot,
		}, nil
	}

	// Build ordered list of analytical providers by config
	type namedAnalytical struct {
		name string
		fn   analyticalFn
	}
	var analyticalOrder []namedAnalytical
	switch provider {
	case "groq":
		if len(groqKeys) > 0 {
			analyticalOrder = append(analyticalOrder, namedAnalytical{"Groq", func() (string, string, error) {
				return s.askGroqWithRotation(question, history, &snapshot, false)
			}})
		}
	case "gemini":
		if len(geminiKeys) > 0 {
			analyticalOrder = append(analyticalOrder, namedAnalytical{"Gemini", func() (string, string, error) {
				return s.askGeminiWithRotation(question, history, &snapshot, false)
			}})
		}
	case "ollama":
		analyticalOrder = append(analyticalOrder, namedAnalytical{"Ollama", func() (string, string, error) {
			return s.askOllamaWithRotation(question, history, &snapshot, false)
		}})
	default: // auto: Groq → Gemini → Ollama
		if len(groqKeys) > 0 {
			analyticalOrder = append(analyticalOrder, namedAnalytical{"Groq", func() (string, string, error) {
				return s.askGroqWithRotation(question, history, &snapshot, false)
			}})
		}
		if len(geminiKeys) > 0 {
			analyticalOrder = append(analyticalOrder, namedAnalytical{"Gemini", func() (string, string, error) {
				return s.askGeminiWithRotation(question, history, &snapshot, false)
			}})
		}
		analyticalOrder = append(analyticalOrder, namedAnalytical{"Ollama", func() (string, string, error) {
			return s.askOllamaWithRotation(question, history, &snapshot, false)
		}})
	}

	for _, p := range analyticalOrder {
		if resp, err := executeAnalytical(p.fn, p.name); err == nil {
			return resp, nil
		}
	}

	// Fallback to local hardcoded tool template only if the LLM analytical loop fails
	if toolToRun != "" {
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
