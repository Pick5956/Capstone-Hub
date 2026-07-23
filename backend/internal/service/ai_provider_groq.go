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

func (s *AIService) executeClassifierGroq(question string, apiKey string) (string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	fmt.Printf("[AI Classifier] Calling Groq %s using key: %s\n", model, maskAPIKey(apiKey))

	prompt := fmt.Sprintf(routerClassifierTemplate, question)

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
		return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
	}
	return "", errors.New("groq returned empty classifier response")
}

func (s *AIService) executeGroq(question string, history []AIConversationMessage, snapshot AISnapshot, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	fmt.Printf("[AI Request] Calling Groq (Analytical) %s using key: %s\n", model, maskAPIKey(apiKey))

	prompt, err := analyticalPrompt(question, history, snapshot)
	if err != nil {
		return "", "", err
	}

	payload := groqRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Tools: nil,
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

func (s *AIService) executeGroqConversation(question string, history []AIConversationMessage, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	fmt.Printf("[AI Request] Calling Groq (Conversation) %s using key: %s\n", model, maskAPIKey(apiKey))

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
				Description: "Get the verified total revenue and order count in the recent 14-day analysis period.",
				Parameters:  groqParameters{Type: "object"},
			},
		},
	}
}

func (s *AIService) executeSecondRoundGroq(prompt string, apiKey string) (string, string, error) {
	model := strings.TrimSpace(os.Getenv("GROQ_MODEL"))
	if model == "" {
		model = "groq/compound-mini"
	}
	fmt.Printf("[AI Second Round] Calling Groq %s using key: %s\n", model, maskAPIKey(apiKey))
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
