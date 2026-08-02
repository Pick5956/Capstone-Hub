package service

import (
	"fmt"
	"strings"
)

// looksContextDependent decides whether the latest message is a follow-up that
// needs the conversation to make sense (e.g. "แล้วอันที่สองล่ะ", "ทำไม",
// "มันกำไรเท่าไหร่", "what about last month"). It is intentionally conservative:
// a false positive only costs one rewrite call that returns the question
// unchanged, while self-contained questions skip the rewrite entirely.
func looksContextDependent(question string) bool {
	n := strings.ToLower(strings.TrimSpace(question))
	if n == "" {
		return false
	}
	if strings.HasPrefix(n, "แล้ว") || strings.HasPrefix(n, "ทำไม") || strings.HasPrefix(n, "why") {
		return true
	}
	for _, marker := range []string{
		"ล่ะ", "มัน", "อันนั้น", "อันนี้", "อันแรก", "อันที่", "ตัวที่", "ตัวนั้น",
		"เมนูนั้น", "เมื่อกี้", "ก่อนหน้า", "ข้างบน", "ที่บอก", "ที่ว่า", "เพราะอะไร",
		"what about", "how about", "the second", "the first one", "the next one", "that one",
	} {
		if strings.Contains(n, marker) {
			return true
		}
	}
	// A bare ordinal ("อันดับรองลงมา", "อันดับสอง") names no metric of its own, so
	// it can only mean something relative to the previous turn.
	if explicitRank(n) > 1 && !hasMetricWord(n) {
		return true
	}
	return false
}

// cleanRewrite normalises the model's rewrite output to a single-line question:
// first non-empty line, surrounding quotes stripped.
func cleanRewrite(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = strings.TrimSpace(s[:i])
	}
	s = strings.Trim(s, "\"'`“”")
	return strings.TrimSpace(s)
}

// resolveContextualQuestion rewrites a follow-up fragment into a self-contained
// question using history, so the assistant can continue a conversation. It only
// resolves references — figures are still looked up fresh downstream. On any
// failure (no provider, LLM error, empty/oversized output) it returns the
// original question so the flow never breaks.
func (s *AIService) resolveContextualQuestion(question string, history []AIConversationMessage) (string, bool) {
	if len(history) == 0 || !looksContextDependent(question) {
		return question, false
	}
	// A rewrite needs a configured provider; without one, keep the original.
	if len(s.getGroqKeys()) == 0 && len(s.getGeminiKeys()) == 0 && s.getAIProvider() != "ollama" {
		return question, false
	}

	prompt := fmt.Sprintf(contextRewriteTemplate, conversationPrompt(history), question)
	rewritten, _, err := s.askSecondRoundWithRotation(prompt)
	if err != nil {
		aiStage("warn", "context rewrite failed (%v) → using original question", err)
		return question, false
	}

	cleaned := cleanRewrite(rewritten)
	if cleaned == "" || len([]rune(cleaned)) > 300 {
		return question, false
	}
	return cleaned, cleaned != strings.TrimSpace(question)
}
