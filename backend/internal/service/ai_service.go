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
	"time"

	"Project-M/internal/repository"
)

type AIService struct {
	repo       *repository.AIRepository
	httpClient *http.Client
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
	Question string `json:"question" binding:"required"`
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

func (s *AIService) AskOperations(restaurantID uint, req *AIAskRequest) (*AIAskResponse, error) {
	question := strings.TrimSpace(req.Question)
	if question == "" {
		return nil, errors.New("question is required")
	}
	if len([]rune(question)) > 800 {
		return nil, errors.New("question is too long")
	}

	// check if the user is sending a simple greeting to bypass database snapshots
	if s.isGreeting(question) {
		answer, model, err := s.askGeminiGreeting(question)
		if err != nil {
			return nil, err
		}
		return &AIAskResponse{
			Answer:   answer,
			Model:    model,
			Snapshot: AISnapshot{},
		}, nil
	}

	snapshot, err := s.buildSnapshot(restaurantID)
	if err != nil {
		return nil, err
	}
	answer, model, err := s.askGemini(question, snapshot)
	if err != nil {
		return nil, err
	}

	return &AIAskResponse{
		Answer:   answer,
		Model:    model,
		Snapshot: snapshot,
	}, nil
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

func (s *AIService) askGemini(question string, snapshot AISnapshot) (string, string, error) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" {
		return "", "", errors.New("GEMINI_API_KEY is not configured")
	}
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

User question:
%s`, string(snapshotJSON), question)

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

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
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

func (s *AIService) isGreeting(q string) bool {
	q = strings.ToLower(strings.TrimSpace(q))
	q = strings.ReplaceAll(q, "?", "")
	q = strings.ReplaceAll(q, "!", "")
	q = strings.ReplaceAll(q, ".", "")
	q = strings.ReplaceAll(q, "ครับ", "")
	q = strings.ReplaceAll(q, "ค่ะ", "")
	q = strings.ReplaceAll(q, "ดีครับ", "ดี")
	q = strings.ReplaceAll(q, "ดีค่ะ", "ดี")
	q = strings.ReplaceAll(q, "ดีจ้า", "ดี")
	q = strings.ReplaceAll(q, "นะ", "")
	q = strings.ReplaceAll(q, "จ้า", "")
	q = strings.TrimSpace(q)

	greetings := []string{
		"สวัสดี", "หวัดดี", "ดี", "hello", "hi", "hey", "hola", "yo",
	}

	for _, g := range greetings {
		if q == g {
			return true
		}
	}
	return false
}

func (s *AIService) askGeminiGreeting(question string) (string, string, error) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" {
		return "", "", errors.New("GEMINI_API_KEY is not configured")
	}
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}

	prompt := fmt.Sprintf(`You are a friendly and polite AI operations assistant for a Thai restaurant management system.
Answer in natural, warm, and brief Thai (about 2-3 sentences).
The user is only greeting you. Greet them back warmly, politely, and briefly offer to help them analyze their restaurant operations (such as sales history, profit margins, or ingredients inventory levels).

User question:
%s`, question)

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
