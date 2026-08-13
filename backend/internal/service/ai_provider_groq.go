package service

// ---------------------------------------------------------------------------
// Groq provider (OpenAI-compatible API)
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

func (s *AIService) askGroqWithRotation(question string, history []AIConversationMessage, snapshot *AISnapshot, isConversation bool, candidateTools ...[]AIToolName) (string, string, error) {
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
			var allowed []AIToolName
			if len(candidateTools) > 0 {
				allowed = candidateTools[0]
			}
			answer, model, err = s.executeGroq(question, history, *snapshot, currentKey, allowed)
		}

		if err == nil {
			return answer, model, nil
		}

		lastErr = err
		if err == errRateLimit {
			aiStage("warn", "Groq key %d/%d rate limited (429) → rotating", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		aiStage("warn", "Groq key %d/%d failed: %v → rotating", (idx%uint32(numKeys))+1, numKeys, err)
	}

	return "", "", lastErr
}

func (s *AIService) executeClassifierGroq(question string, apiKey string) (string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	aiStage("call", "Groq classifier model=%s", model)

	prompt := fmt.Sprintf(routerClassifierTemplate, question)

	payload := groqRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Temperature: zeroTemperature(), // deterministic routing
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
		return "", newAIProviderHTTPError("Groq", "classifier", resp.StatusCode)
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) > 0 {
		return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
	}
	return "", errors.New("groq returned empty classifier response")
}

func (s *AIService) executeGroq(question string, history []AIConversationMessage, snapshot AISnapshot, apiKey string, candidateTools []AIToolName) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	aiStage("call", "Groq analytical model=%s", model)

	prompt, err := analyticalPrompt(question, history, snapshot)
	if err != nil {
		return "", "", err
	}

	payload := groqRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Tools: s.getGroqToolsForCandidates(candidateTools),
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
		return "", "", newAIProviderHTTPError("Groq", "analytical request", resp.StatusCode)
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	if len(parsed.Choices) > 0 {
		msg := parsed.Choices[0].Message
		if len(msg.ToolCalls) > 0 {
			if len(msg.ToolCalls) != 1 {
				return "", "", errors.New("Groq returned more than one tool call")
			}
			toolName, err := validateGroqReadOnlyToolCall(msg.ToolCalls[0])
			if err != nil {
				return "", "", err
			}
			return fmt.Sprintf("CALL_TOOL:%s", toolName), model, nil
		}
		return msg.Content, model, nil
	}
	return "", "", errors.New("groq returned an empty response")
}

func (s *AIService) executeGroqConversation(question string, history []AIConversationMessage, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	aiStage("call", "Groq conversation model=%s", model)

	prompt := fmt.Sprintf(conversationPersonaTemplate, question, conversationPrompt(history))

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
		return "", "", newAIProviderHTTPError("Groq", "conversation request", resp.StatusCode)
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
				Name:        "get_highest_margin_menu",
				Description: "Get details about the menu item with the highest profit margin.",
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
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_sales_summary",
				Description: fmt.Sprintf("Get the verified total revenue and order count in the recent %.0f-day analysis period.", analysisWindowDays),
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_lowest_cost_menu",
				Description: "Get the menu item with the lowest ingredient cost per dish.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_sales_trend",
				Description: "Compare the last 7 days of sales against the previous 7 days to show the revenue trend.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_average_order_value",
				Description: "Get the average revenue per order (average check size) over the recent analysis period.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_order_type_breakdown",
				Description: "Get the revenue and order split by order type (dine-in, takeaway, delivery).",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_menu_revenue_ranking",
				Description: "Get the menus ranked by total revenue generated (not by quantity sold).",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_peak_periods",
				Description: "Get the busiest day of the week and busiest hour of the day by order count.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_slow_moving_menus",
				Description: "Get the menus with the fewest sales (including none) that may be candidates for removal.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_menu_engineering",
				Description: "Classify menus by popularity and margin into Star / Plowhorse / Puzzle / Dog quadrants.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_ingredient_reorder_forecast",
				Description: "Estimate which ingredients will run out soon based on their usage rate over the analysis window.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_dead_stock",
				Description: "List ingredients that hold stock but were not used at all in the window (tied-up cash / spoilage risk).",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_top_cost_ingredients",
				Description: "Rank ingredients by total cost consumed in the analysis window.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_store_summary",
				Description: "Backend-composed overall store overview (sales, trend, top menus, best margin, low stock) for broad summary requests.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_sales_for_period",
				Description: "Sales for a specific period named by the user: today, yesterday, last 7 days, or the previous week.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
		{
			Type: "function",
			Function: groqFunctionShortcut{
				Name:        "get_most_expensive_menu",
				Description: "The menu items with the highest listed price per dish (menu price, not revenue).",
				Parameters:  groqParameters{Type: "object"},
			},
		},
	}
}

func validateGroqReadOnlyToolCall(call groqToolCall) (AIToolName, error) {
	toolName := AIToolName(strings.TrimSpace(call.Function.Name))
	if !isProviderSnapshotTool(toolName) {
		return "", errors.New("Groq requested an unsupported tool")
	}
	arguments := strings.TrimSpace(call.Function.Arguments)
	if arguments == "" {
		arguments = "{}"
	}
	var decoded map[string]json.RawMessage
	if err := json.Unmarshal([]byte(arguments), &decoded); err != nil || decoded == nil {
		return "", errors.New("Groq returned invalid tool arguments")
	}
	if len(decoded) != 0 {
		return "", errors.New("Groq supplied arguments to a no-argument tool")
	}
	return toolName, nil
}

func (s *AIService) getGroqToolsForCandidates(candidates []AIToolName) []groqTool {
	if len(candidates) == 0 {
		return nil
	}
	allowed := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		allowed[string(candidate)] = struct{}{}
	}
	all := s.getGroqTools()
	filtered := make([]groqTool, 0, len(candidates))
	for _, tool := range all {
		if _, ok := allowed[tool.Function.Name]; ok {
			filtered = append(filtered, tool)
		}
	}
	return filtered
}

func (s *AIService) executeSecondRoundGroq(prompt string, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	aiStage("call", "Groq second-round model=%s", model)
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
		return "", "", newAIProviderHTTPError("Groq", "second-round request", resp.StatusCode)
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
			aiStage("warn", "Groq second-round key %d/%d rate limited → rotating", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		aiStage("warn", "Groq second-round key %d/%d failed: %v → rotating", (idx%uint32(numKeys))+1, numKeys, err)
	}
	return "", "", lastErr
}
