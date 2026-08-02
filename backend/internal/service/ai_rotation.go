package service

import "errors"

// askSecondRoundWithRotation renders a follow-up prompt through the configured
// provider, falling back Groq -> Gemini in "auto" mode.
func (s *AIService) askSecondRoundWithRotation(prompt string) (string, string, error) {
	var lastErr error
	provider := s.getAIProvider()
	for _, adapter := range s.orderedProviderAdapters() {
		if !adapter.Configured() {
			if provider != "auto" {
				return "", "", missingProviderConfigurationError(adapter.ID())
			}
			continue
		}
		answer, err := adapter.Complete(prompt)
		if err == nil {
			return answer.Text, answer.Model, nil
		}
		lastErr = err
		aiStage("warn", "second-round %s failed → trying next provider: %v", adapter.DisplayName(), err)
	}
	if lastErr != nil {
		return "", "", lastErr
	}
	return "", "", errors.New("no configured AI provider")
}

func (s *AIService) askOutOfScopeWithRotation(question string, history []AIConversationMessage) (string, string, error) {
	prompt := outOfScopePrompt(question, history)
	return s.askSecondRoundWithRotation(prompt)
}
