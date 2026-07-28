package service

// ---------------------------------------------------------------------------
// Ollama provider (OpenAI-compatible local API)
// ---------------------------------------------------------------------------

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
)

func (s *AIService) getOllamaBaseURL() string {
	if u := strings.TrimSpace(os.Getenv("OLLAMA_BASE_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "http://localhost:11434"
}

func (s *AIService) getOllamaModel() string {
	if m := strings.TrimSpace(os.Getenv("OLLAMA_MODEL")); m != "" {
		return m
	}
	return "llama3.2"
}

func (s *AIService) getOllamaContextLength() int {
	if raw := strings.TrimSpace(os.Getenv("OLLAMA_CONTEXT_LENGTH")); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value > 0 {
			return value
		}
	}
	return 4096
}

func (s *AIService) askOllamaWithRotation(question string, history []AIConversationMessage, snapshot *AISnapshot, isConversation bool) (string, string, error) {
	var answer, model string
	var err error
	if isConversation {
		answer, model, err = s.executeOllamaConversation(question, history)
	} else {
		answer, model, err = s.executeOllama(question, history, *snapshot)
	}
	return answer, model, err
}

// executeClassifierOllama runs the JSON AI Router prompt against a local Ollama instance.
func (s *AIService) executeClassifierOllama(question string) (string, error) {
	baseURL := s.getOllamaBaseURL()
	model := s.getOllamaModel()
	fmt.Printf("[AI Classifier] Calling Ollama %s at %s\n", model, baseURL)

	prompt := fmt.Sprintf(routerClassifierCompactTemplate, question)

	payload := ollamaRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Think:   false,
		Options: ollamaOptions{NumCtx: s.getOllamaContextLength()},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequest(http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer ollama")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("ollama classifier: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("ollama classifier failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) > 0 {
		return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
	}
	return "", errors.New("ollama returned empty classifier response")
}

// executeOllama runs the full analytical prompt (with tool calling) against a local Ollama instance.
func (s *AIService) executeOllama(question string, history []AIConversationMessage, snapshot AISnapshot) (string, string, error) {
	baseURL := s.getOllamaBaseURL()
	model := s.getOllamaModel()
	fmt.Printf("[AI Request] Calling Ollama (Analytical) %s at %s\n", model, baseURL)

	prompt, err := analyticalPrompt(question, history, snapshot)
	if err != nil {
		return "", "", err
	}

	// Attempt tool calling — not all Ollama models support it, so we omit Tools
	// and rely on the CALL_TOOL: text protocol instead (same as Groq analytical).
	payload := ollamaRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Tools:   nil,
		Think:   false,
		Options: ollamaOptions{NumCtx: s.getOllamaContextLength()},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	httpReq, err := http.NewRequest(http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer ollama")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", fmt.Errorf("ollama analytical: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("ollama analytical failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	if len(parsed.Choices) > 0 {
		content := strings.TrimSpace(parsed.Choices[0].Message.Content)
		if content != "" {
			return content, model, nil
		}
		// Handle tool_calls from models that support it
		if tc := parsed.Choices[0].Message.ToolCalls; len(tc) > 0 {
			return fmt.Sprintf("CALL_TOOL:%s", tc[0].Function.Name), model, nil
		}
	}
	return "", "", errors.New("ollama returned empty analytical response")
}

// executeOllamaConversation runs a lightweight conversational prompt against a local Ollama instance.
func (s *AIService) executeOllamaConversation(question string, history []AIConversationMessage) (string, string, error) {
	baseURL := s.getOllamaBaseURL()
	model := s.getOllamaModel()
	fmt.Printf("[AI Request] Calling Ollama (Conversation) %s at %s\n", model, baseURL)

	prompt := fmt.Sprintf(conversationPersonaTemplate, question, conversationPrompt(history))

	payload := ollamaRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Think:   false,
		Options: ollamaOptions{NumCtx: s.getOllamaContextLength()},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	httpReq, err := http.NewRequest(http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer ollama")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", fmt.Errorf("ollama conversation: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("ollama conversation failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	if len(parsed.Choices) > 0 {
		if content := strings.TrimSpace(parsed.Choices[0].Message.Content); content != "" {
			return content, model, nil
		}
	}
	return "", "", errors.New("ollama returned empty conversation response")
}

// executeSecondRoundOllama renders a prompt through the configured local
// provider for tool-result narration and policy responses.
func (s *AIService) executeSecondRoundOllama(prompt string) (string, string, error) {
	baseURL := s.getOllamaBaseURL()
	model := s.getOllamaModel()
	fmt.Printf("[AI Second Round] Calling Ollama %s at %s\n", model, baseURL)

	payload := ollamaRequest{
		Model: model,
		Messages: []groqMessage{
			{Role: "user", Content: prompt},
		},
		Think:   false,
		Options: ollamaOptions{NumCtx: s.getOllamaContextLength()},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", err
	}

	httpReq, err := http.NewRequest(http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer ollama")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", "", fmt.Errorf("ollama second round: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("ollama second round failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", err
	}
	if len(parsed.Choices) > 0 {
		if content := strings.TrimSpace(parsed.Choices[0].Message.Content); content != "" {
			return content, model, nil
		}
	}
	return "", "", errors.New("ollama second round returned empty response")
}
