package service

import (
	"fmt"
	"strings"
)

func maskAPIKey(key string) string {
	if len(key) <= 10 {
		return "***"
	}
	return fmt.Sprintf("%s...%s", key[:6], key[len(key)-4:])
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
