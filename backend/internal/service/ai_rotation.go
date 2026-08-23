package service

import "errors"

// askSecondRoundWithRotation renders a follow-up prompt through the configured
// provider, falling back Groq -> Gemini in "auto" mode.
func (s *AIService) askSecondRoundWithRotation(prompt string) (string, string, error) {
	return s.askSecondRoundWithOptions(prompt, aiProviderCompleteOptions{})
}

// askSecondRoundWithOptions is the same round with a per-call preference
// attached. It is a separate function so the callers that have no preference
// keep the shorter call and stay literally unchanged: the zero options they
// would have had to pass are supplied above instead.
func (s *AIService) askSecondRoundWithOptions(prompt string, opts aiProviderCompleteOptions) (string, string, error) {
	var lastErr error
	provider := s.getAIProvider()
	for _, adapter := range s.orderedProviderAdapters() {
		if !adapter.Configured() {
			if provider != "auto" {
				return "", "", missingProviderConfigurationError(adapter.ID())
			}
			continue
		}
		answer, err := adapter.Complete(prompt, opts)
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
