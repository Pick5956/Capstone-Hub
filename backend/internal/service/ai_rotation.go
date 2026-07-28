package service

import "fmt"

// askSecondRoundWithRotation renders a follow-up prompt through the configured
// provider, falling back Groq -> Gemini in "auto" mode (ollama is opt-in only).
func (s *AIService) askSecondRoundWithRotation(prompt string) (string, string, error) {
	groqKeys := s.getGroqKeys()
	switch s.getAIProvider() {
	case "groq":
		return s.askSecondRoundGroqWithRotation(prompt)
	case "gemini":
		return s.askSecondRoundGeminiWithRotation(prompt)
	case "ollama":
		return s.executeSecondRoundOllama(prompt)
	default:
		if len(groqKeys) > 0 {
			answer, model, err := s.askSecondRoundGroqWithRotation(prompt)
			if err == nil {
				return answer, model, nil
			}
			fmt.Printf("[AI Service] Second round Groq failed, trying Gemini fallback: %v\n", err)
		}
		return s.askSecondRoundGeminiWithRotation(prompt)
	}
}

func (s *AIService) askOutOfScopeWithRotation(question string, history []AIConversationMessage) (string, string, error) {
	prompt := outOfScopePrompt(question, history)
	return s.askSecondRoundWithRotation(prompt)
}
