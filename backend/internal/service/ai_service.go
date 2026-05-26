package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"Project-M/internal/repository"
)

var errRateLimit = errors.New("rate limit exceeded")

type AIIntent string

const (
	AIIntentAnalysis   AIIntent = "analysis"
	AIIntentGreeting   AIIntent = "greeting"
	AIIntentCapability AIIntent = "capabilities"
	AIIntentChat       AIIntent = "conversation"
	AIIntentUnclear    AIIntent = "unclear"
	AIIntentOutOfScope AIIntent = "out_of_scope"
)

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

type AIAskRequest struct {
	Question string                  `json:"question" binding:"required"`
	History  []AIConversationMessage `json:"history"`
}

type AIConversationMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIAskResponse struct {
	Answer   string     `json:"answer"`
	Intent   AIIntent   `json:"intent"`
	Task     AITask     `json:"task,omitempty"`
	Tool     AIToolName `json:"tool,omitempty"`
	Model    string     `json:"model"`
	Snapshot AISnapshot `json:"snapshot"`
}

type AISnapshot struct {
	GeneratedAt       string                           `json:"generated_at"`
	SalesDays         []repository.AISalesSummary      `json:"sales_days"`
	TopMenuItems      []repository.AIMenuSummary       `json:"top_menu_items"`
	MenuMargins       []repository.AIMenuMarginSummary `json:"menu_margins"`
	LowMarginMenus    []repository.AIMenuMarginSummary `json:"low_margin_menus"`
	AnalysisReadiness AIAnalysisReadiness              `json:"analysis_readiness"`
	InventorySummary  AIInventorySummary               `json:"inventory_summary"`
	StockRisks        []AIStockRisk                    `json:"stock_risks"`
}

type AIAnalysisReadiness struct {
	HasSales                  bool     `json:"has_sales"`
	SalesItems                int64    `json:"sales_items"`
	MarginItems               int64    `json:"margin_items"`
	CostedMarginItems         int64    `json:"costed_margin_items"`
	SoldMenus                 int64    `json:"sold_menus"`
	SoldMenusWithRecipes      int64    `json:"sold_menus_with_recipes"`
	MarginCostCoveragePercent float64  `json:"margin_cost_coverage_percent"`
	MenuRecipeCoveragePercent float64  `json:"menu_recipe_coverage_percent"`
	CanAnalyzeRevenue         bool     `json:"can_analyze_revenue"`
	CanAnalyzeMargin          bool     `json:"can_analyze_margin"`
	CanRecommendActions       bool     `json:"can_recommend_business_actions"`
	Warnings                  []string `json:"warnings"`
}

type AIInventorySummary struct {
	TotalItems int     `json:"total_items"`
	LowItems   int     `json:"low_items"`
	OutItems   int     `json:"out_items"`
	Value      float64 `json:"value"`
}

type AIStockRisk struct {
	Name            string  `json:"name"`
	Category        string  `json:"category"`
	Stock           float64 `json:"stock"`
	MinStock        float64 `json:"min_stock"`
	Unit            string  `json:"unit"`
	StorageType     string  `json:"storage_type"`
	CostPerUnit     float64 `json:"cost_per_unit"`
	RestockEstimate float64 `json:"restock_estimate"`
	Status          string  `json:"status"`
}

type AIVerifyPayload struct {
	LowestMarginMenuName string  `json:"lowest_margin_menu_name,omitempty"`
	Quantity             int     `json:"quantity,omitempty"`
	Revenue              float64 `json:"revenue,omitempty"`
	Cost                 float64 `json:"cost,omitempty"`
	Profit               float64 `json:"profit,omitempty"`
	Margin               float64 `json:"margin,omitempty"`
	LowStockCount        int     `json:"low_stock_count,omitempty"`
	OutOfStockCount      int     `json:"out_of_stock_count,omitempty"`
	TopMenuName          string  `json:"top_menu_name,omitempty"`
	TopMenuQuantity      int     `json:"top_menu_quantity,omitempty"`
	TotalItems           int     `json:"total_items,omitempty"`
	TotalValue           float64 `json:"total_value,omitempty"`
}

type AIFinalJSONResponse struct {
	Answer string          `json:"answer"`
	Verify AIVerifyPayload `json:"verify"`
}

func (s *AIService) getGroqKeys() []string {
	keysStr := os.Getenv("GROQ_API_KEYS")
	if keysStr == "" {
		return nil
	}
	parts := strings.Split(keysStr, ",")
	var keys []string
	for _, p := range parts {
		k := strings.TrimSpace(p)
		if k != "" {
			keys = append(keys, k)
		}
	}
	return keys
}

func (s *AIService) getGeminiKeys() []string {
	keysStr := os.Getenv("GEMINI_API_KEYS")
	if keysStr == "" {
		return nil
	}
	parts := strings.Split(keysStr, ",")
	var keys []string
	for _, p := range parts {
		k := strings.TrimSpace(p)
		if k != "" {
			keys = append(keys, k)
		}
	}
	return keys
}

func (s *AIService) classifyIntent(question string) (AIIntent, error) {
	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()

	// 1. Try Groq Classifier (Ultra-fast LPUs)
	if len(groqKeys) > 0 {
		numKeys := len(groqKeys)
		for i := 0; i < numKeys; i++ {
			idx := atomic.AddUint32(&s.groqKeyIndex, 1) - 1
			currentKey := groqKeys[idx%uint32(numKeys)]

			answer, err := s.executeClassifierGroq(question, currentKey)
			if err == nil {
				return parseIntent(answer), nil
			}
			fmt.Printf("[AI Classifier] Groq Key %d/%d failed: %v, rotating...\n", (idx%uint32(numKeys))+1, numKeys, err)
		}
	}

	// 2. Try Gemini Classifier Fallback
	if len(geminiKeys) > 0 {
		numKeys := len(geminiKeys)
		for i := 0; i < numKeys; i++ {
			idx := atomic.AddUint32(&s.geminiKeyIndex, 1) - 1
			currentKey := geminiKeys[idx%uint32(numKeys)]

			answer, err := s.executeClassifierGemini(question, currentKey)
			if err == nil {
				return parseIntent(answer), nil
			}
			fmt.Printf("[AI Classifier] Gemini Key %d/%d failed: %v, rotating...\n", (idx%uint32(numKeys))+1, numKeys, err)
		}
	}

	// Preserve analytical usefulness if provider classification is unavailable.
	return AIIntentAnalysis, errors.New("failed to classify via any model, falling back to analysis")
}

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

func localIntent(question string) (AIIntent, bool) {
	normalized := strings.ToLower(strings.Trim(strings.TrimSpace(question), "?!.,"))
	switch normalized {
	case "สวัสดี", "สวัสดีครับ", "สวัสดีค่ะ", "หวัดดี", "hello", "hi", "hey":
		return AIIntentGreeting, true
	case "ทำอะไรได้บ้าง", "ช่วยอะไรได้บ้าง", "คุณทำอะไรได้บ้าง", "what can you do", "help":
		return AIIntentCapability, true
	}
	if looksLikeUnclearInput(normalized) {
		return AIIntentUnclear, true
	}
	return "", false
}

func looksLikeUnclearInput(input string) bool {
	if input == "" {
		return false
	}
	knownSingleWords := map[string]bool{
		"menu": true, "stock": true, "inventory": true, "sales": true,
		"report": true, "reports": true, "settings": true, "profit": true,
		"margin": true, "revenue": true, "orders": true, "kitchen": true,
		"staff": true, "table": true, "tables": true, "price": true,
	}
	if knownSingleWords[input] {
		return false
	}
	if strings.ContainsAny(input, " \t\n") || len([]rune(input)) > 24 {
		return false
	}
	hasLetterOrDigit := false
	for _, char := range input {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			hasLetterOrDigit = true
			continue
		}
		if strings.ContainsRune("_-+=/\\", char) {
			continue
		}
		return false
	}
	return hasLetterOrDigit
}

func localIntentAnswer(intent AIIntent) (string, bool) {
	switch intent {
	case AIIntentGreeting:
		return "สวัสดีครับ วันนี้อยากดูยอดขาย เช็กสต๊อก หรือให้ช่วยหาเมนูในระบบครับ?", true
	case AIIntentCapability:
		return "ผมช่วยสรุปยอดขายและกำไร ตรวจวัตถุดิบเสี่ยงหมด วิเคราะห์เมนู และพาไปหน้าจัดการที่ต้องการได้ครับ ลองถามว่า \"เมนูไหนกำไรต่ำ\" หรือ \"พาไปหน้าตั้งค่าร้าน\" ได้เลย", true
	case AIIntentUnclear:
		return "ผมยังไม่เข้าใจคำขอนี้ครับ เลือกสิ่งที่ต้องการด้านล่าง หรือพิมพ์คำขอใหม่ได้เลย", true
	case AIIntentOutOfScope:
		return "เรื่องนี้อยู่นอกข้อมูลร้านที่ผมเข้าถึงครับ ผมช่วยดูยอดขาย กำไร สต๊อก เมนู หรือพาไปหน้าจัดการในระบบได้", true
	default:
		return "", false
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

	intent, locallyResolved := localIntent(question)
	if locallyResolved {
		if answer, ok := localIntentAnswer(intent); ok {
			return &AIAskResponse{
				Answer:   answer,
				Intent:   intent,
				Model:    "local-router",
				Snapshot: AISnapshot{},
			}, nil
		}
	}

	taskRoute, taskResolved := resolveLocalTask(question)
	if answer, ok := localConceptAnswer(taskRoute); ok {
		return &AIAskResponse{
			Answer:   answer,
			Intent:   AIIntentChat,
			Task:     taskRoute.Task,
			Model:    "local-knowledge",
			Snapshot: AISnapshot{},
		}, nil
	}

	// Read-only tools and explicit business decisions must reach readiness checks deterministically.
	if taskResolved && taskRoute.Task != AITaskExplainConcept {
		intent = AIIntentAnalysis
		locallyResolved = true
	}

	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()

	if !locallyResolved {
		if len(groqKeys) == 0 && len(geminiKeys) == 0 {
			return nil, errors.New("neither GROQ_API_KEY nor GEMINI_API_KEY is configured")
		}
		var err error
		intent, err = s.classifyIntent(questionWithHistory(question, history))
		if err != nil {
			fmt.Printf("[AI Router] Warning: Classifier failed: %v. Defaulting to analysis.\n", err)
		}
	}
	if intent == AIIntentAnalysis && taskRoute.Task == "" {
		taskRoute.Task = AITaskAnalyzeData
	}

	if answer, ok := localIntentAnswer(intent); ok {
		return &AIAskResponse{
			Answer:   answer,
			Intent:   intent,
			Model:    "local-router",
			Snapshot: AISnapshot{},
		}, nil
	}

	// Conversational prompts do not load operational data or make business claims.
	if intent != AIIntentAnalysis {
		fmt.Printf("[AI Router] Diverting to conversational flow (%s, 0 DB snapshot load)...\n", intent)

		if len(groqKeys) > 0 {
			answer, model, err := s.askGroqWithRotation(question, history, nil, true)
			if err == nil {
				return &AIAskResponse{
					Answer:   answer,
					Intent:   intent,
					Model:    model,
					Snapshot: AISnapshot{},
				}, nil
			}
			fmt.Printf("[AI Service] Conversational fallback from Groq to Gemini due to error: %v\n", err)
		}

		// Try Gemini
		if len(geminiKeys) > 0 {
			answer, model, err := s.askGeminiWithRotation(question, history, nil, true)
			if err == nil {
				return &AIAskResponse{
					Answer:   answer,
					Intent:   intent,
					Model:    model,
					Snapshot: AISnapshot{},
				}, nil
			}
			return nil, err
		}

		return nil, errors.New("โควต้าการใช้งาน AI ทั้งหมดของคุณหมดลงชั่วคราวแล้วครับ กรุณารอประมาณ 1 นาทีแล้วลองใหม่อีกครั้งนะครับ")
	}

	// Analytical questions load the scoped restaurant snapshot before answering.
	fmt.Println("[AI Router] Diverting to Rich Analytical business flow (Building DB Snapshot)...")
	snapshot, err := s.buildSnapshot(restaurantID)
	if err != nil {
		return nil, err
	}
	if answer, guarded := localAnalyticalGuardrailAnswer(question, snapshot); guarded {
		return &AIAskResponse{
			Answer:   answer,
			Intent:   intent,
			Task:     taskRoute.Task,
			Model:    "local-readiness-guardrail",
			Snapshot: snapshot,
		}, nil
	}
	if taskRoute.Tool != "" {
		result, err := executeReadOnlyTool(taskRoute.Tool, snapshot)
		if err != nil {
			return nil, err
		}
		if answer, answered := localToolAnswer(result); answered {
			return &AIAskResponse{
				Answer:   answer,
				Intent:   intent,
				Task:     taskRoute.Task,
				Tool:     taskRoute.Tool,
				Model:    "local-tool",
				Snapshot: snapshot,
			}, nil
		}
	}
	if len(groqKeys) == 0 && len(geminiKeys) == 0 {
		return nil, errors.New("neither GROQ_API_KEY nor GEMINI_API_KEY is configured")
	}

	// Try Groq (Ultra-fast 200ms) with rotated keys
	if len(groqKeys) > 0 {
		answer, model, err := s.askGroqWithRotation(question, history, &snapshot, false)
		if err == nil {
			if strings.HasPrefix(answer, "CALL_TOOL:") {
				toolName := AIToolName(strings.TrimPrefix(answer, "CALL_TOOL:"))
				result, err := executeReadOnlyTool(toolName, snapshot)
				if err != nil {
					return nil, err
				}
				
				// Call second round
				prompt := secondRoundPrompt(question, history, toolName, result)
				secAnswer, secModel, secErr := s.askSecondRoundWithRotation(prompt)
				if secErr == nil {
					res, parseErr := cleanAndParseJSONResponse(secAnswer)
					if parseErr == nil {
						finalAnswer := s.validateAndIntercept(res, result, snapshot)
						return &AIAskResponse{
							Answer:   finalAnswer,
							Intent:   intent,
							Task:     taskRoute.Task,
							Tool:     toolName,
							Model:    secModel,
							Snapshot: snapshot,
						}, nil
					}
					fmt.Printf("[AI Service] Failed to parse second round JSON: %v, falling back to localToolAnswer\n", parseErr)
				} else {
					fmt.Printf("[AI Service] Second round failed: %v, falling back to localToolAnswer\n", secErr)
				}

				if toolAnswer, ok := localToolAnswer(result); ok {
					return &AIAskResponse{
						Answer:   toolAnswer,
						Intent:   intent,
						Task:     taskRoute.Task,
						Tool:     toolName,
						Model:    "local-tool-calling-fallback",
						Snapshot: snapshot,
					}, nil
				}
			}
			return &AIAskResponse{
				Answer:   answer,
				Intent:   intent,
				Task:     taskRoute.Task,
				Model:    model,
				Snapshot: snapshot,
			}, nil
		}
		fmt.Printf("[AI Service] Analytical fallback from Groq to Gemini due to error: %v\n", err)
	}

	// Fallback to Gemini (Very large 1M TPM limit) with rotated keys
	if len(geminiKeys) > 0 {
		answer, model, err := s.askGeminiWithRotation(question, history, &snapshot, false)
		if err == nil {
			if strings.HasPrefix(answer, "CALL_TOOL:") {
				toolName := AIToolName(strings.TrimPrefix(answer, "CALL_TOOL:"))
				result, err := executeReadOnlyTool(toolName, snapshot)
				if err != nil {
					return nil, err
				}
				
				// Call second round
				prompt := secondRoundPrompt(question, history, toolName, result)
				secAnswer, secModel, secErr := s.askSecondRoundWithRotation(prompt)
				if secErr == nil {
					res, parseErr := cleanAndParseJSONResponse(secAnswer)
					if parseErr == nil {
						finalAnswer := s.validateAndIntercept(res, result, snapshot)
						return &AIAskResponse{
							Answer:   finalAnswer,
							Intent:   intent,
							Task:     taskRoute.Task,
							Tool:     toolName,
							Model:    secModel,
							Snapshot: snapshot,
						}, nil
					}
					fmt.Printf("[AI Service] Failed to parse second round JSON: %v, falling back to localToolAnswer\n", parseErr)
				} else {
					fmt.Printf("[AI Service] Second round failed: %v, falling back to localToolAnswer\n", secErr)
				}

				if toolAnswer, ok := localToolAnswer(result); ok {
					return &AIAskResponse{
						Answer:   toolAnswer,
						Intent:   intent,
						Task:     taskRoute.Task,
						Tool:     toolName,
						Model:    "local-tool-calling-fallback",
						Snapshot: snapshot,
					}, nil
				}
			}
			return &AIAskResponse{
				Answer:   answer,
				Intent:   intent,
				Task:     taskRoute.Task,
				Model:    model,
				Snapshot: snapshot,
			}, nil
		}
		// If Gemini also fails due to rate limits after rotation, return friendly message
		if err == errRateLimit {
			return nil, errors.New("โควต้าการใช้งาน AI ทั้งหมดของคุณหมดลงชั่วคราวแล้วครับ กรุณารอประมาณ 1 นาทีแล้วลองใหม่อีกครั้งนะครับ (API Quota Exceeded)")
		}
		return nil, err
	}

	return nil, errors.New("โควต้าการใช้งาน AI ทั้งหมดของคุณหมดลงชั่วคราวแล้วครับ กรุณารอประมาณ 1 นาทีแล้วลองใหม่อีกครั้งนะครับ (API Quota Exceeded)")
}

func (s *AIService) OperationsSnapshot(restaurantID uint) (*AISnapshot, error) {
	snapshot, err := s.buildSnapshot(restaurantID)
	if err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (s *AIService) askGroqWithRotation(question string, history []AIConversationMessage, snapshot *AISnapshot, isConversation bool) (string, string, error) {
	keys := s.getGroqKeys()
	if len(keys) == 0 {
		return "", "", errors.New("GROQ_API_KEY is not configured")
	}

	var lastErr error
	numKeys := len(keys)

	for i := 0; i < numKeys; i++ {
		idx := atomic.AddUint32(&s.groqKeyIndex, 1) - 1
		currentKey := keys[idx%uint32(numKeys)]

		var answer, model string
		var err error

		if isConversation {
			answer, model, err = s.executeGroqConversation(question, history, currentKey)
		} else {
			answer, model, err = s.executeGroq(question, history, *snapshot, currentKey)
		}

		if err == nil {
			return answer, model, nil
		}

		lastErr = err
		if err == errRateLimit {
			fmt.Printf("[AI Service] Groq Key %d/%d rate limited (429), rotating key...\n", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		fmt.Printf("[AI Service] Groq Key %d/%d failed with error: %v, rotating key...\n", (idx%uint32(numKeys))+1, numKeys, err)
	}

	return "", "", lastErr
}

func (s *AIService) askGeminiWithRotation(question string, history []AIConversationMessage, snapshot *AISnapshot, isConversation bool) (string, string, error) {
	keys := s.getGeminiKeys()
	if len(keys) == 0 {
		return "", "", errors.New("GEMINI_API_KEY is not configured")
	}

	var lastErr error
	numKeys := len(keys)

	for i := 0; i < numKeys; i++ {
		idx := atomic.AddUint32(&s.geminiKeyIndex, 1) - 1
		currentKey := keys[idx%uint32(numKeys)]

		var answer, model string
		var err error

		if isConversation {
			answer, model, err = s.executeGeminiConversation(question, history, currentKey)
		} else {
			answer, model, err = s.executeGemini(question, history, *snapshot, currentKey)
		}

		if err == nil {
			return answer, model, nil
		}

		lastErr = err
		if err == errRateLimit {
			fmt.Printf("[AI Service] Gemini Key %d/%d rate limited (429), rotating key...\n", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		fmt.Printf("[AI Service] Gemini Key %d/%d failed with error: %v, rotating key...\n", (idx%uint32(numKeys))+1, numKeys, err)
	}

	return "", "", lastErr
}

func (s *AIService) buildSnapshot(restaurantID uint) (AISnapshot, error) {
	since := repository.BangkokNow().AddDate(0, 0, -14)
	ingredients, err := s.repo.ListIngredients(restaurantID)
	if err != nil {
		return AISnapshot{}, err
	}
	sales, err := s.repo.RecentSalesSummary(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	topMenus, err := s.repo.TopMenuItems(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	menuMargins, err := s.repo.MenuMargins(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	lowMarginMenus, err := s.repo.LowMarginMenus(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	coverage, err := s.repo.AnalysisCoverage(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	if sales == nil {
		sales = []repository.AISalesSummary{}
	}
	if topMenus == nil {
		topMenus = []repository.AIMenuSummary{}
	}
	if menuMargins == nil {
		menuMargins = []repository.AIMenuMarginSummary{}
	}
	if lowMarginMenus == nil {
		lowMarginMenus = []repository.AIMenuMarginSummary{}
	}

	summary := AIInventorySummary{TotalItems: len(ingredients)}
	risks := make([]AIStockRisk, 0)
	for _, item := range ingredients {
		summary.Value += item.Stock * item.CostPerUnit
		status := "ok"
		if item.Stock <= 0 {
			status = "out"
			summary.OutItems++
		} else if item.MinStock > 0 && item.Stock <= item.MinStock {
			status = "low"
			summary.LowItems++
		}

		if status != "ok" {
			categoryName := ""
			if item.Category != nil {
				categoryName = item.Category.Name
			}
			target := item.MinStock * 2
			if target <= 0 {
				target = 1
			}
			risks = append(risks, AIStockRisk{
				Name:            item.Name,
				Category:        categoryName,
				Stock:           item.Stock,
				MinStock:        item.MinStock,
				Unit:            item.Unit,
				StorageType:     item.StorageType,
				CostPerUnit:     item.CostPerUnit,
				RestockEstimate: maxFloat(0, target-item.Stock),
				Status:          status,
			})
		}
	}
	sort.SliceStable(risks, func(i, j int) bool {
		if risks[i].Status != risks[j].Status {
			return risks[i].Status == "out"
		}
		return risks[i].RestockEstimate > risks[j].RestockEstimate
	})
	if len(risks) > 12 {
		risks = risks[:12]
	}

	return AISnapshot{
		GeneratedAt:       repository.BangkokNow().Format(time.RFC3339),
		SalesDays:         sales,
		TopMenuItems:      topMenus,
		MenuMargins:       menuMargins,
		LowMarginMenus:    lowMarginMenus,
		AnalysisReadiness: analysisReadinessFromCoverage(coverage),
		InventorySummary:  summary,
		StockRisks:        risks,
	}, nil
}

func analysisReadinessFromCoverage(coverage repository.AIAnalysisCoverage) AIAnalysisReadiness {
	readiness := AIAnalysisReadiness{
		HasSales:             coverage.SalesItems > 0,
		SalesItems:           coverage.SalesItems,
		MarginItems:          coverage.MarginItems,
		CostedMarginItems:    coverage.CostedMarginItems,
		SoldMenus:            coverage.SoldMenus,
		SoldMenusWithRecipes: coverage.SoldMenusWithRecipes,
		Warnings:             []string{},
	}
	if coverage.MarginItems > 0 {
		readiness.MarginCostCoveragePercent = float64(coverage.CostedMarginItems) / float64(coverage.MarginItems) * 100
	}
	if coverage.SoldMenus > 0 {
		readiness.MenuRecipeCoveragePercent = float64(coverage.SoldMenusWithRecipes) / float64(coverage.SoldMenus) * 100
	}

	readiness.CanAnalyzeRevenue = readiness.HasSales
	readiness.CanAnalyzeMargin = coverage.MarginItems > 0 && readiness.MarginCostCoveragePercent >= 100
	readiness.CanRecommendActions = readiness.CanAnalyzeMargin && readiness.MenuRecipeCoveragePercent >= 100

	if !readiness.HasSales {
		readiness.Warnings = append(readiness.Warnings, "No recorded sales are available in the analysis period.")
		return readiness
	}
	if coverage.MarginItems == 0 {
		readiness.Warnings = append(readiness.Warnings, "No served sales are available for confirmed margin analysis.")
		return readiness
	}
	if !readiness.CanAnalyzeMargin {
		readiness.Warnings = append(readiness.Warnings, "Some served items have no recorded inventory cost deduction; margin and profit are not confirmed.")
	}
	if readiness.MenuRecipeCoveragePercent < 100 {
		readiness.Warnings = append(readiness.Warnings, "Some sold menus have no current ingredient recipe; inventory and business recommendations need setup review.")
	}
	return readiness
}

func localAnalyticalGuardrailAnswer(question string, snapshot AISnapshot) (string, bool) {
	if snapshot.AnalysisReadiness.CanRecommendActions || !requestsBusinessDecision(question) {
		return "", false
	}
	readiness := snapshot.AnalysisReadiness
	if !readiness.HasSales {
		return "ตอนนี้ยังไม่มีข้อมูลยอดขายในช่วงวิเคราะห์ จึงยังแนะนำการปรับราคา ถอดเมนู หรือสั่งซื้อวัตถุดิบไม่ได้ครับ กรุณาบันทึกการขายและตรวจว่าสูตรวัตถุดิบพร้อมก่อน แล้วผมจะช่วยวิเคราะห์ต่อได้", true
	}
	return fmt.Sprintf(
		"ตอนนี้ผมยังแนะนำการปรับราคา ถอดเมนู หรือสั่งซื้อวัตถุดิบจากผลวิเคราะห์ไม่ได้ครับ เพราะข้อมูลต้นทุนหรือสูตรยังไม่ครบ (ต้นทุนครอบคลุม %.0f%%, สูตรครอบคลุม %.0f%%) กรุณาตรวจการผูกสูตรและการตัดสต็อกก่อน แล้วจึงวิเคราะห์การตัดสินใจนี้อีกครั้ง",
		readiness.MarginCostCoveragePercent,
		readiness.MenuRecipeCoveragePercent,
	), true
}

func requestsBusinessDecision(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	for _, phrase := range []string{
		"ปรับราคา", "ขึ้นราคา", "ลดราคา", "เปลี่ยนราคา",
		"ลบเมนู", "ถอดเมนู", "เลิกขาย", "ลดการขาย",
		"ควรซื้อ", "ซื้อวัตถุดิบ", "สั่งซื้อ",
		"increase price", "decrease price", "change price",
		"remove menu", "stop selling", "buy ingredient", "purchase", "restock",
	} {
		if strings.Contains(normalized, phrase) {
			return true
		}
	}
	return false
}

func requestsLowestMarginFact(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	hasMargin := strings.Contains(normalized, "margin") ||
		strings.Contains(normalized, "มาร์จิ้น") ||
		strings.Contains(normalized, "มาร์จิน")
	hasLowest := strings.Contains(normalized, "ต่ำที่สุด") ||
		strings.Contains(normalized, "lowest") ||
		strings.Contains(normalized, "น้อยที่สุด")
	return hasMargin && hasLowest
}

func localLowestMarginFactAnswer(question string, snapshot AISnapshot) (string, bool) {
	if !requestsLowestMarginFact(question) {
		return "", false
	}
	result, err := executeReadOnlyTool(AIToolGetLowestMarginMenu, snapshot)
	if err != nil {
		return "", false
	}
	return localToolAnswer(result)
}

func (s *AIService) executeClassifierGroq(question string, apiKey string) (string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}

	prompt := fmt.Sprintf(`You classify requests for a restaurant operations assistant.
Reply with exactly one label:
- ANALYSIS: needs restaurant sales, profit, menu performance, stock, or inventory data.
- GREETING: a greeting only, such as "hello" or "สวัสดี"; do not classify thanks or acknowledgements as greeting.
- CAPABILITIES: asks what the assistant can do.
- UNCLEAR: unreadable, random, meaningless, or too vague to answer usefully, such as "rytyt" or keyboard mashing.
- OUT_OF_SCOPE: asks for information outside the restaurant system.
- CONVERSATION: any other clear request that can be answered without live restaurant data, including thanks or acknowledgements.

User input:
%s`, question)

	payload := groqRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequest(http.MethodPost, "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", errRateLimit
		}
		return "", fmt.Errorf("groq classifier failed: %s", strings.TrimSpace(string(respBody)))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) > 0 {
		return strings.ToUpper(strings.TrimSpace(parsed.Choices[0].Message.Content)), nil
	}
	return "", errors.New("groq returned empty classifier response")
}

func (s *AIService) executeClassifierGemini(question string, apiKey string) (string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}

	prompt := fmt.Sprintf(`You classify requests for a restaurant operations assistant.
Reply with exactly one label:
- ANALYSIS: needs restaurant sales, profit, menu performance, stock, or inventory data.
- GREETING: a greeting only, such as "hello" or "สวัสดี"; do not classify thanks or acknowledgements as greeting.
- CAPABILITIES: asks what the assistant can do.
- UNCLEAR: unreadable, random, meaningless, or too vague to answer usefully, such as "rytyt" or keyboard mashing.
- OUT_OF_SCOPE: asks for information outside the restaurant system.
- CONVERSATION: any other clear request that can be answered without live restaurant data, including thanks or acknowledgements.

User input:
%s`, question)

	payload := geminiGenerateRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", model)
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", errRateLimit
		}
		return "", fmt.Errorf("gemini classifier failed: %s", strings.TrimSpace(string(respBody)))
	}

	var parsed geminiGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if text := strings.TrimSpace(part.Text); text != "" {
				return strings.ToUpper(text), nil
			}
		}
	}
	return "", errors.New("gemini returned empty classifier response")
}

func (s *AIService) executeGemini(question string, history []AIConversationMessage, snapshot AISnapshot, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}

	prompt, err := analyticalPrompt(question, history, snapshot)
	if err != nil {
		return "", "", err
	}

	payload := geminiGenerateRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
		Tools: s.getGeminiTools(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", model)
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", "", errRateLimit
		}
		return "", "", fmt.Errorf("gemini request failed: %s", strings.TrimSpace(string(respBody)))
	}

	var parsed geminiGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.FunctionCall != nil {
				return fmt.Sprintf("CALL_TOOL:%s", part.FunctionCall.Name), model, nil
			}
			if text := strings.TrimSpace(part.Text); text != "" {
				return text, model, nil
			}
		}
	}
	return "", "", errors.New("gemini returned an empty response")
}

func (s *AIService) executeGeminiConversation(question string, history []AIConversationMessage, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}

	prompt := fmt.Sprintf(`You are a concise, professional assistant inside a Thai restaurant management system.
Reply in natural Thai using "ครับ" consistently. Answer the user's actual message directly.
Do not introduce yourself, and do not repeat a welcome message.
If the message is ambiguous, ask one useful clarification question with concrete options.
You do not have live restaurant data in this flow, so do not claim sales or stock numbers.

User question:
%s

Recent conversation context:
%s`, question, conversationPrompt(history))

	payload := geminiGenerateRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", model)
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", "", errRateLimit
		}
		return "", "", fmt.Errorf("gemini request failed: %s", strings.TrimSpace(string(respBody)))
	}

	var parsed geminiGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if text := strings.TrimSpace(part.Text); text != "" {
				return text, model, nil
			}
		}
	}
	return "", "", errors.New("gemini returned an empty response")
}

func (s *AIService) executeGroq(question string, history []AIConversationMessage, snapshot AISnapshot, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}

	prompt, err := analyticalPrompt(question, history, snapshot)
	if err != nil {
		return "", "", err
	}

	payload := groqRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Tools: s.getGroqTools(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	httpReq, err := http.NewRequest(http.MethodPost, "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", "", errRateLimit
		}
		return "", "", fmt.Errorf("groq request failed: %s", strings.TrimSpace(string(respBody)))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	if len(parsed.Choices) > 0 {
		msg := parsed.Choices[0].Message
		if len(msg.ToolCalls) > 0 {
			return fmt.Sprintf("CALL_TOOL:%s", msg.ToolCalls[0].Function.Name), model, nil
		}
		return msg.Content, model, nil
	}
	return "", "", errors.New("groq returned an empty response")
}

func analyticalPrompt(question string, history []AIConversationMessage, snapshot AISnapshot) (string, error) {
	snapshotJSON, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(`You are an AI operations assistant for a Thai restaurant management system.
Answer in natural Thai for a restaurant owner or manager.
Use only the provided restaurant snapshot. Do not invent numbers.
The analysis_readiness object is a mandatory reliability guardrail:
- If can_analyze_revenue is false, explain that sales data is not available and do not rank performance or describe trends.
- If can_analyze_margin is false, do not present profit or margin as confirmed and do not recommend pricing, menu, or purchasing decisions based on margin.
- If can_recommend_business_actions is false, recommend only data setup or verification steps; do not recommend changing prices, removing menus, reducing sales, or purchasing quantities.
- If warnings is non-empty, state the relevant limitation clearly before any suggested next step.
Even when the data is complete, never claim that you changed restaurant data; changes require the user to review and confirm them in the system.
Answer only the scope requested by the user:
- If the user only requests a fact, ranking, or metric, report that result and a brief factual interpretation only. Do not propose price changes, recipe changes, promotions, purchasing, KPI targets, or other business decisions unless the user explicitly requests a recommendation.
- Clearly distinguish aggregate totals from per-item values. Never describe a total cost or total profit as a per-unit value. Calculate per-item values only from the stated quantity and label them as averages.
Keep the answer practical: summarize the situation, risks, and next actions.
Format for a narrow chat panel: use short headings and bullet lists.
Do not use Markdown tables or horizontal-rule separators; express tabular comparisons as bullet points.

Restaurant snapshot JSON:
%s

Recent conversation context:
%s

User question:
%s`, string(snapshotJSON), conversationPrompt(history), question), nil
}

func (s *AIService) executeGroqConversation(question string, history []AIConversationMessage, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}

	prompt := fmt.Sprintf(`You are a concise, professional assistant inside a Thai restaurant management system.
Reply in natural Thai using "ครับ" consistently. Answer the user's actual message directly.
Do not introduce yourself, and do not repeat a welcome message.
If the message is ambiguous, ask one useful clarification question with concrete options.
You do not have live restaurant data in this flow, so do not claim sales or stock numbers.

User question:
%s

Recent conversation context:
%s`, question, conversationPrompt(history))

	payload := groqRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	httpReq, err := http.NewRequest(http.MethodPost, "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", "", errRateLimit
		}
		return "", "", fmt.Errorf("groq request failed: %s", strings.TrimSpace(string(respBody)))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	if len(parsed.Choices) > 0 {
		return parsed.Choices[0].Message.Content, model, nil
	}
	return "", "", errors.New("groq returned an empty response")
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func sanitizeConversationHistory(history []AIConversationMessage) []AIConversationMessage {
	if len(history) > 6 {
		history = history[len(history)-6:]
	}
	cleaned := make([]AIConversationMessage, 0, len(history))
	for _, message := range history {
		role := strings.ToLower(strings.TrimSpace(message.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		content := strings.TrimSpace(message.Content)
		if content == "" {
			continue
		}
		runes := []rune(content)
		if len(runes) > 400 {
			content = string(runes[:400])
		}
		cleaned = append(cleaned, AIConversationMessage{Role: role, Content: content})
	}
	return cleaned
}

func conversationPrompt(history []AIConversationMessage) string {
	if len(history) == 0 {
		return "(none)"
	}
	var builder strings.Builder
	for _, message := range history {
		builder.WriteString(message.Role)
		builder.WriteString(": ")
		builder.WriteString(message.Content)
		builder.WriteByte('\n')
	}
	return strings.TrimSpace(builder.String())
}

func questionWithHistory(question string, history []AIConversationMessage) string {
	if len(history) == 0 {
		return question
	}
	return fmt.Sprintf("Recent conversation:\n%s\n\nCurrent question:\n%s", conversationPrompt(history), question)
}

func (s *AIService) getGeminiTools() []geminiTool {
	return []geminiTool{
		{
			FunctionDeclarations: []geminiFunctionDeclaration{
				{
					Name:        "get_lowest_margin_menu",
					Description: "Get details about the menu item with the lowest profit margin.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_low_stock_ingredients",
					Description: "Get the list of ingredients that are currently low in stock or out of stock.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_top_selling_menus",
					Description: "Get the list of top-selling menus ranked by popularity and revenue.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_inventory_valuation",
					Description: "Get the summary of the total inventory value and metrics.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
			},
		},
	}
}

func (s *AIService) getGroqTools() []groqTool {
	return []groqTool{
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_lowest_margin_menu",
				Description: "Get details about the menu item with the lowest profit margin.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_low_stock_ingredients",
				Description: "Get the list of ingredients that are currently low in stock or out of stock.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_top_selling_menus",
				Description: "Get the list of top-selling menus ranked by popularity and revenue.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_inventory_valuation",
				Description: "Get the summary of the total inventory value and metrics.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
	}
}

type geminiGenerateRequest struct {
	Contents []geminiContent `json:"contents"`
	Tools    []geminiTool    `json:"tools,omitempty"`
}

type geminiTool struct {
	FunctionDeclarations []geminiFunctionDeclaration `json:"functionDeclarations"`
}

type geminiFunctionDeclaration struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Parameters  geminiParameters `json:"parameters"`
}

type geminiParameters struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text         string              `json:"text,omitempty"`
	FunctionCall *geminiFunctionCall `json:"functionCall,omitempty"`
}

type geminiFunctionCall struct {
	Name string                 `json:"name"`
	Args map[string]interface{} `json:"args"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}

type groqMessage struct {
	Role      string         `json:"role"`
	Content   string         `json:"content"`
	ToolCalls []groqToolCall `json:"tool_calls,omitempty"`
}

type groqToolCall struct {
	Id       string       `json:"id"`
	Type     string       `json:"type"`
	Function groqToolFunc `json:"function"`
}

type groqToolFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type groqRequest struct {
	Model    string        `json:"model"`
	Messages []groqMessage `json:"messages"`
	Tools    []groqTool    `json:"tools,omitempty"`
}

type groqTool struct {
	Type     string               `json:"type"`
	Function groqFunctionShortcut `json:"function"`
}

type groqFunctionShortcut struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  groqParameters `json:"parameters"`
}

type groqParameters struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

type groqResponse struct {
	Choices []struct {
		Message groqMessage `json:"message"`
	} `json:"choices"`
}

func secondRoundPrompt(question string, history []AIConversationMessage, toolName AIToolName, toolResult AIToolResult) string {
	toolResultJSON, _ := json.MarshalIndent(toolResult, "", "  ")
	return fmt.Sprintf(`You are an AI operations assistant for a Thai restaurant management system.
You are in the second round of a double round-trip. The backend Go system has successfully executed the tool "%s" and retrieved the actual data.

IMPORTANT: You MUST respond in a valid JSON format only. Do not wrap the JSON in triple backticks or markdown, or if you do, ensure it is a valid JSON block that can be parsed.
Your response MUST EXACTLY match this structure:
{
  "answer": "Your natural Thai conversational explanation here...",
  "verify": {
    "lowest_margin_menu_name": "...", 
    "quantity": 123,
    "revenue": 123.45,
    "cost": 123.45,
    "profit": 123.45,
    "margin": 12.34,
    "low_stock_count": 123,
    "out_of_stock_count": 123,
    "top_menu_name": "...",
    "top_menu_quantity": 123,
    "total_items": 123,
    "total_value": 123.45
  }
}

Rules for the "answer" field:
1. Answer in natural, polite Thai for a restaurant owner or manager. Use "ครับ" consistently.
2. Incorporate the conversation history context naturally.
3. You MUST present the EXACT numbers from the tool result. Do NOT perform any manual mathematical calculations, averages, or totals. Use only the provided numbers.
4. Do NOT use markdown tables or horizontal rules. Use bullet points or short paragraphs suitable for a narrow chat panel.
5. Do NOT make up any numbers.

Rules for the "verify" field:
Fill in the fields of the "verify" object with the EXACT numbers and names you wrote in your "answer" text. If a field is not relevant to the tool result or your answer, you can omit it or set it to 0 or empty string.

Tool result JSON:
%s

Recent conversation context:
%s

User question:
%s`, toolName, string(toolResultJSON), conversationPrompt(history), question)
}

func (s *AIService) executeSecondRoundGemini(prompt string, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}
	payload := geminiGenerateRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", model)
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", "", errRateLimit
		}
		return "", "", fmt.Errorf("gemini second round failed: %s", strings.TrimSpace(string(respBody)))
	}
	var parsed geminiGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if text := strings.TrimSpace(part.Text); text != "" {
				return text, model, nil
			}
		}
	}
	return "", "", errors.New("gemini second round returned empty response")
}

func (s *AIService) executeSecondRoundGroq(prompt string, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	payload := groqRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}
	httpReq, err := http.NewRequest(http.MethodPost, "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return "", "", errRateLimit
		}
		return "", "", fmt.Errorf("groq second round failed: %s", strings.TrimSpace(string(respBody)))
	}
	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	if len(parsed.Choices) > 0 {
		return parsed.Choices[0].Message.Content, model, nil
	}
	return "", "", errors.New("groq second round returned empty response")
}

func (s *AIService) askSecondRoundGroqWithRotation(prompt string) (string, string, error) {
	keys := s.getGroqKeys()
	if len(keys) == 0 {
		return "", "", errors.New("GROQ_API_KEY is not configured")
	}
	var lastErr error
	numKeys := len(keys)
	for i := 0; i < numKeys; i++ {
		idx := atomic.AddUint32(&s.groqKeyIndex, 1) - 1
		currentKey := keys[idx%uint32(numKeys)]
		answer, model, err := s.executeSecondRoundGroq(prompt, currentKey)
		if err == nil {
			return answer, model, nil
		}
		lastErr = err
		if err == errRateLimit {
			fmt.Printf("[AI Service] Groq Second Round Key %d/%d rate limited, rotating...\n", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		fmt.Printf("[AI Service] Groq Second Round Key %d/%d failed: %v, rotating...\n", (idx%uint32(numKeys))+1, numKeys, err)
	}
	return "", "", lastErr
}

func (s *AIService) askSecondRoundGeminiWithRotation(prompt string) (string, string, error) {
	keys := s.getGeminiKeys()
	if len(keys) == 0 {
		return "", "", errors.New("GEMINI_API_KEY is not configured")
	}
	var lastErr error
	numKeys := len(keys)
	for i := 0; i < numKeys; i++ {
		idx := atomic.AddUint32(&s.geminiKeyIndex, 1) - 1
		currentKey := keys[idx%uint32(numKeys)]
		answer, model, err := s.executeSecondRoundGemini(prompt, currentKey)
		if err == nil {
			return answer, model, nil
		}
		lastErr = err
		if err == errRateLimit {
			fmt.Printf("[AI Service] Gemini Second Round Key %d/%d rate limited, rotating...\n", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		fmt.Printf("[AI Service] Gemini Second Round Key %d/%d failed: %v, rotating...\n", (idx%uint32(numKeys))+1, numKeys, err)
	}
	return "", "", lastErr
}

func (s *AIService) askSecondRoundWithRotation(prompt string) (string, string, error) {
	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()
	if len(groqKeys) > 0 {
		answer, model, err := s.askSecondRoundGroqWithRotation(prompt)
		if err == nil {
			return answer, model, nil
		}
		fmt.Printf("[AI Service] Second round Groq failed, trying Gemini fallback: %v\n", err)
	}
	if len(geminiKeys) > 0 {
		return s.askSecondRoundGeminiWithRotation(prompt)
	}
	return "", "", errors.New("no API keys configured for second round")
}

func cleanAndParseJSONResponse(raw string) (AIFinalJSONResponse, error) {
	cleaned := strings.TrimSpace(raw)
	if strings.HasPrefix(cleaned, "```json") {
		cleaned = strings.TrimPrefix(cleaned, "```json")
		cleaned = strings.TrimSuffix(cleaned, "```")
	} else if strings.HasPrefix(cleaned, "```") {
		cleaned = strings.TrimPrefix(cleaned, "```")
		cleaned = strings.TrimSuffix(cleaned, "```")
	}
	cleaned = strings.TrimSpace(cleaned)
	var res AIFinalJSONResponse
	err := json.Unmarshal([]byte(cleaned), &res)
	if err != nil {
		return AIFinalJSONResponse{}, err
	}
	return res, nil
}

func (s *AIService) validateAndIntercept(res AIFinalJSONResponse, result AIToolResult, snapshot AISnapshot) string {
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

func almostEqual(a, b float64) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.05
}
