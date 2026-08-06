package service

// ---------------------------------------------------------------------------
// Gemini provider (Google Generative Language API)
// ---------------------------------------------------------------------------

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
)

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

func (s *AIService) askGeminiWithRotation(question string, history []AIConversationMessage, snapshot *AISnapshot, isConversation bool, candidateTools ...[]AIToolName) (string, string, error) {
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
			var allowed []AIToolName
			if len(candidateTools) > 0 {
				allowed = candidateTools[0]
			}
			answer, model, err = s.executeGemini(question, history, *snapshot, currentKey, allowed)
		}

		if err == nil {
			return answer, model, nil
		}

		lastErr = err
		if err == errRateLimit {
			aiStage("warn", "Gemini key %d/%d rate limited (429) → rotating", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		aiStage("warn", "Gemini key %d/%d failed: %v → rotating", (idx%uint32(numKeys))+1, numKeys, err)
	}

	return "", "", lastErr
}

func (s *AIService) executeClassifierGemini(question string, apiKey string) (string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}
	aiStage("call", "Gemini classifier model=%s", model)

	prompt := fmt.Sprintf(routerClassifierTemplate, question)

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
		return "", newAIProviderHTTPError("Gemini", "classifier", resp.StatusCode)
	}

	var parsed geminiGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if text := strings.TrimSpace(part.Text); text != "" {
				return text, nil
			}
		}
	}
	return "", errors.New("gemini returned empty classifier response")
}

func (s *AIService) executeGemini(question string, history []AIConversationMessage, snapshot AISnapshot, apiKey string, candidateTools []AIToolName) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}
	aiStage("call", "Gemini analytical model=%s", model)

	prompt, err := analyticalPrompt(question, history, snapshot)
	if err != nil {
		return "", "", err
	}

	payload := geminiGenerateRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: prompt}}},
		},
		Tools: s.getGeminiToolsForCandidates(candidateTools),
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
		return "", "", newAIProviderHTTPError("Gemini", "analytical request", resp.StatusCode)
	}

	var parsed geminiGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	toolCalls := make([]geminiFunctionCall, 0, 1)
	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.FunctionCall != nil {
				toolCalls = append(toolCalls, *part.FunctionCall)
			}
		}
	}
	if len(toolCalls) > 1 {
		return "", "", errors.New("Gemini returned more than one tool call")
	}
	if len(toolCalls) == 1 {
		toolName, err := validateGeminiReadOnlyToolCall(toolCalls[0])
		if err != nil {
			return "", "", err
		}
		return fmt.Sprintf("CALL_TOOL:%s", toolName), model, nil
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
	aiStage("call", "Gemini conversation model=%s", model)

	prompt := fmt.Sprintf(conversationPersonaTemplate, question, conversationPrompt(history))

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
		return "", "", newAIProviderHTTPError("Gemini", "conversation request", resp.StatusCode)
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
					Name:        "get_highest_margin_menu",
					Description: "Get details about the menu item with the highest profit margin.",
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
				{
					Name:        "get_sales_summary",
					Description: "Get the verified total revenue and order count in the recent 14-day analysis period.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_lowest_cost_menu",
					Description: "Get the menu item with the lowest ingredient cost per dish.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_sales_trend",
					Description: "Compare the last 7 days of sales against the previous 7 days to show the revenue trend.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_average_order_value",
					Description: "Get the average revenue per order (average check size) over the recent analysis period.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_order_type_breakdown",
					Description: "Get the revenue and order split by order type (dine-in, takeaway, delivery).",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_menu_revenue_ranking",
					Description: "Get the menus ranked by total revenue generated (not by quantity sold).",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_peak_periods",
					Description: "Get the busiest day of the week and busiest hour of the day by order count.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_slow_moving_menus",
					Description: "Get the menus with the fewest sales (including none) that may be candidates for removal.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_menu_engineering",
					Description: "Classify menus by popularity and margin into Star / Plowhorse / Puzzle / Dog quadrants.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_ingredient_reorder_forecast",
					Description: "Estimate which ingredients will run out soon based on their usage rate over the analysis window.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_dead_stock",
					Description: "List ingredients that hold stock but were not used at all in the window (tied-up cash / spoilage risk).",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_top_cost_ingredients",
					Description: "Rank ingredients by total cost consumed in the analysis window.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_store_summary",
					Description: "Backend-composed overall store overview (sales, trend, top menus, best margin, low stock) for broad summary requests.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_sales_for_period",
					Description: "Sales for a specific period named by the user: today, yesterday, last 7 days, or the previous week.",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
				{
					Name:        "get_most_expensive_menu",
					Description: "The menu items with the highest listed price per dish (menu price, not revenue).",
					Parameters:  geminiParameters{Type: "OBJECT"},
				},
			},
		},
	}
}

func validateGeminiReadOnlyToolCall(call geminiFunctionCall) (AIToolName, error) {
	toolName := AIToolName(strings.TrimSpace(call.Name))
	if !isSupportedReadOnlyTool(toolName) {
		return "", errors.New("Gemini requested an unsupported tool")
	}
	if len(call.Args) != 0 {
		return "", errors.New("Gemini supplied arguments to a no-argument tool")
	}
	return toolName, nil
}

func (s *AIService) getGeminiToolsForCandidates(candidates []AIToolName) []geminiTool {
	if len(candidates) == 0 {
		return nil
	}
	allowed := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		allowed[string(candidate)] = struct{}{}
	}
	all := s.getGeminiTools()
	if len(all) == 0 {
		return nil
	}
	declarations := make([]geminiFunctionDeclaration, 0, len(candidates))
	for _, declaration := range all[0].FunctionDeclarations {
		if _, ok := allowed[declaration.Name]; ok {
			declarations = append(declarations, declaration)
		}
	}
	if len(declarations) == 0 {
		return nil
	}
	return []geminiTool{{FunctionDeclarations: declarations}}
}

func (s *AIService) executeSecondRoundGemini(prompt string, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}
	aiStage("call", "Gemini second-round model=%s", model)
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
		return "", "", newAIProviderHTTPError("Gemini", "second-round request", resp.StatusCode)
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
			aiStage("warn", "Gemini second-round key %d/%d rate limited → rotating", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		aiStage("warn", "Gemini second-round key %d/%d failed: %v → rotating", (idx%uint32(numKeys))+1, numKeys, err)
	}
	return "", "", lastErr
}
