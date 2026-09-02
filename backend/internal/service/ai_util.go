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
	return sanitizeConversationHistoryInternal(history, false)
}

func sanitizeConversationHistoryInternal(history []AIConversationMessage, trustReducedDocsContext bool) []AIConversationMessage {
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
		if role == "assistant" && !trustReducedDocsContext {
			if docURLs := safeSystemDocURLsFromText(content); len(docURLs) > 0 {
				content = reduceSystemDocsAnswerForProvider(content, docURLs)
			}
		}
		// Keep the END of an over-long message, not the start. A follow-up points
		// at what was said last ("อันสุดท้ายที่บอก", "ตัวที่สองที่ยกมา"), and the
		// prompt builder was already cutting from the front for that reason — but
		// this cut runs first, so the tail was gone before it ever got there and
		// the rule downstream never fired.
		runes := []rune(content)
		if len(runes) > 400 {
			content = "…" + string(runes[len(runes)-400:])
		}
		id := strings.TrimSpace(message.ID)
		if len([]rune(id)) > 128 {
			id = ""
		}
		// Topic has to survive the sanitiser. It is written by the server from the
		// tool a stored turn actually used, and it is what turns a trimmed turn
		// into a readable index line ("— เรื่องวัตถุดิบและสต๊อก"). Dropped here, the
		// index still rendered — just with every label missing, in production only:
		// the joyboy tests build their turns directly and never crossed this line.
		cleaned = append(cleaned, AIConversationMessage{ID: id, Role: role, Content: content, Topic: message.Topic})
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
