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
	Model    string     `json:"model"`
	Snapshot AISnapshot `json:"snapshot"`
}

type AISnapshot struct {
	GeneratedAt      string                           `json:"generated_at"`
	SalesDays        []repository.AISalesSummary      `json:"sales_days"`
	TopMenuItems     []repository.AIMenuSummary       `json:"top_menu_items"`
	MenuMargins      []repository.AIMenuMarginSummary `json:"menu_margins"`
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

func (s *AIService) shouldQueryDB(question string) (bool, error) {
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
				return strings.Contains(answer, "YES"), nil
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
				return strings.Contains(answer, "YES"), nil
			}
			fmt.Printf("[AI Classifier] Gemini Key %d/%d failed: %v, rotating...\n", (idx%uint32(numKeys))+1, numKeys, err)
		}
	}

	// Default fallback: if everything fails, assume YES to avoid breaking analytical flows
	return true, errors.New("failed to classify via any model, falling back to YES")
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

	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()

	if len(groqKeys) == 0 && len(geminiKeys) == 0 {
		return nil, errors.New("neither GROQ_API_KEY nor GEMINI_API_KEY is configured")
	}

	// 1. DYNAMIC CLASSIFICATION (Agentic Router Decision)
	// We dynamically check if the question requires access to real-time restaurant operational databases.
	needsDB, err := s.shouldQueryDB(questionWithHistory(question, history))
	if err != nil {
		fmt.Printf("[AI Router] Warning: Classifier failed: %v. Defaulting to YES.\n", err)
	}

	// 2. NO-DATA FLOW: Simple greetings, chit-chat, off-topic chat
	if !needsDB {
		fmt.Println("[AI Router] Diverting to Conversational/Greeting Bypass flow (0 DB Snapshot load)...")

		// Try Groq first if available
		if len(groqKeys) > 0 {
			answer, model, err := s.askGroqWithRotation(question, history, nil, true)
			if err == nil {
				return &AIAskResponse{
					Answer:   answer,
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
					Model:    model,
					Snapshot: AISnapshot{},
				}, nil
			}
			return nil, err
		}

		return nil, errors.New("โควต้าการใช้งาน AI ทั้งหมดของคุณหมดลงชั่วคราวแล้วครับ กรุณารอประมาณ 1 นาทีแล้วลองใหม่อีกครั้งนะครับ")
	}

	// 3. ANALYTICAL DATA-DRIVEN FLOW: Queries DB, constructs Snapshot JSON context
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

func (s *AIService) askGroqWithRotation(question string, history []AIConversationMessage, snapshot *AISnapshot, isGreeting bool) (string, string, error) {
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

		if isGreeting {
			answer, model, err = s.executeGroqGreeting(question, history, currentKey)
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

func (s *AIService) askGeminiWithRotation(question string, history []AIConversationMessage, snapshot *AISnapshot, isGreeting bool) (string, string, error) {
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

		if isGreeting {
			answer, model, err = s.executeGeminiGreeting(question, history, currentKey)
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
	if sales == nil {
		sales = []repository.AISalesSummary{}
	}
	if topMenus == nil {
		topMenus = []repository.AIMenuSummary{}
	}
	if menuMargins == nil {
		menuMargins = []repository.AIMenuMarginSummary{}
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
		InventorySummary: summary,
		StockRisks:       risks,
	}, nil
}

func (s *AIService) executeClassifierGroq(question string, apiKey string) (string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}

	prompt := fmt.Sprintf(`You are a precise routing classifier. Analyze the user's input and determine if answering it requires accessing real-time restaurant operational databases (such as sales history, transaction metrics, menu item profit margins, stock levels, or inventory risk warnings).
Reply with exactly one word: "YES" or "NO" (without punctuation).

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

	prompt := fmt.Sprintf(`You are a precise routing classifier. Analyze the user's input and determine if answering it requires accessing real-time restaurant operational databases (such as sales history, transaction metrics, menu item profit margins, stock levels, or inventory risk warnings).
Reply with exactly one word: "YES" or "NO" (without punctuation).

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

func (s *AIService) executeGeminiGreeting(question string, history []AIConversationMessage, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}

	prompt := fmt.Sprintf(`You are a friendly and polite AI operations assistant for a Thai restaurant management system.
Answer in natural, warm, and brief Thai (about 2-3 sentences).
The user is only greeting you or chatting off-topic. Greet them back warmly, politely, and briefly explain that you are a specialized restaurant operational assistant, and then offer to help them analyze their restaurant operations (such as sales history, profit margins, or ingredients inventory levels).

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

func (s *AIService) executeGroqGreeting(question string, history []AIConversationMessage, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}

	prompt := fmt.Sprintf(`You are a friendly and polite AI operations assistant for a Thai restaurant management system.
Answer in natural, warm, and brief Thai (about 2-3 sentences).
The user is only greeting you or chatting off-topic. Greet them back warmly, politely, and briefly explain that you are a specialized restaurant operational assistant, and then offer to help them analyze their restaurant operations (such as sales history, profit margins, or ingredients inventory levels).

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
