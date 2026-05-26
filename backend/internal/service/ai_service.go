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
	Model    string     `json:"model"`
	Snapshot AISnapshot `json:"snapshot"`
}

type AISnapshot struct {
	GeneratedAt      string                           `json:"generated_at"`
	SalesDays        []repository.AISalesSummary      `json:"sales_days"`
	TopMenuItems     []repository.AIMenuSummary       `json:"top_menu_items"`
	MenuMargins      []repository.AIMenuMarginSummary `json:"menu_margins"`
	LowMarginMenus   []repository.AIMenuMarginSummary `json:"low_margin_menus"`
	InventorySummary AIInventorySummary               `json:"inventory_summary"`
	StockRisks       []AIStockRisk                    `json:"stock_risks"`
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

func (s *AIService) getGroqKeys() []string {
	keysStr := os.Getenv("GROQ_API_KEYS")
	if keysStr == "" {
		keysStr = os.Getenv("GROQ_API_KEY")
	}
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
		keysStr = os.Getenv("GEMINI_API_KEY")
	}
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

	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()

	if len(groqKeys) == 0 && len(geminiKeys) == 0 {
		return nil, errors.New("neither GROQ_API_KEY nor GEMINI_API_KEY is configured")
	}

	if !locallyResolved {
		var err error
		intent, err = s.classifyIntent(questionWithHistory(question, history))
		if err != nil {
			fmt.Printf("[AI Router] Warning: Classifier failed: %v. Defaulting to analysis.\n", err)
		}
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

	// Try Groq (Ultra-fast 200ms) with rotated keys
	if len(groqKeys) > 0 {
		answer, model, err := s.askGroqWithRotation(question, history, &snapshot, false)
		if err == nil {
			return &AIAskResponse{
				Answer:   answer,
				Intent:   intent,
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
			return &AIAskResponse{
				Answer:   answer,
				Intent:   intent,
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
		GeneratedAt:      repository.BangkokNow().Format(time.RFC3339),
		SalesDays:        sales,
		TopMenuItems:     topMenus,
		MenuMargins:      menuMargins,
		LowMarginMenus:   lowMarginMenus,
		InventorySummary: summary,
		StockRisks:       risks,
	}, nil
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

	snapshotJSON, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return "", "", err
	}
	prompt := fmt.Sprintf(`You are an AI operations assistant for a Thai restaurant management system.
Answer in natural Thai for a restaurant owner or manager.
Use only the provided restaurant snapshot. Do not invent numbers.
If the available data is not enough for a confident recommendation, say what is missing.
Keep the answer practical: summarize the situation, risks, and next actions.
Format for a narrow chat panel: use short headings and bullet lists.
Do not use Markdown tables or horizontal-rule separators; express tabular comparisons as bullet points.

Restaurant snapshot JSON:
%s

Recent conversation context:
%s

User question:
%s`, string(snapshotJSON), conversationPrompt(history), question)

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

	snapshotJSON, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return "", "", err
	}
	prompt := fmt.Sprintf(`You are an AI operations assistant for a Thai restaurant management system.
Answer in natural Thai for a restaurant owner or manager.
Use only the provided restaurant snapshot. Do not invent numbers.
If the available data is not enough for a confident recommendation, say what is missing.
Keep the answer practical: summarize the situation, risks, and next actions.
Format for a narrow chat panel: use short headings and bullet lists.
Do not use Markdown tables or horizontal-rule separators; express tabular comparisons as bullet points.

Restaurant snapshot JSON:
%s

Recent conversation context:
%s

User question:
%s`, string(snapshotJSON), conversationPrompt(history), question)

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

type geminiGenerateRequest struct {
	Contents []geminiContent `json:"contents"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}

type groqMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type groqRequest struct {
	Model    string        `json:"model"`
	Messages []groqMessage `json:"messages"`
}

type groqResponse struct {
	Choices []struct {
		Message groqMessage `json:"message"`
	} `json:"choices"`
}
