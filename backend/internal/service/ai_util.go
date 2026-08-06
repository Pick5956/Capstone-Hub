package service

import (
	"encoding/json"
	"strings"
)

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func sanitizeConversationHistory(history []AIConversationMessage) []AIConversationMessage {
	if len(history) > structuredPlannerMaxContextItems {
		history = history[len(history)-structuredPlannerMaxContextItems:]
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
		id := strings.TrimSpace(message.ID)
		if len([]rune(id)) > 128 {
			id = ""
		}
		cleaned = append(cleaned, AIConversationMessage{ID: id, Role: role, Content: content})
	}
	return cleaned
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

func almostEqual(a, b float64) bool {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.05
}
