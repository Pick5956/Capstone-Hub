package service

import "fmt"

// askSecondRoundWithRotation renders a follow-up prompt through the configured
// provider, falling back Groq -> Gemini -> Ollama in "auto" mode.
func (s *AIService) askSecondRoundWithRotation(prompt string) (string, string, error) {
	groqKeys := s.getGroqKeys()
	geminiKeys := s.getGeminiKeys()
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
		if len(geminiKeys) > 0 {
			answer, model, err := s.askSecondRoundGeminiWithRotation(prompt)
			if err == nil {
				return answer, model, nil
			}
			fmt.Printf("[AI Service] Second round Gemini failed, trying Ollama fallback: %v\n", err)
		}
		return s.executeSecondRoundOllama(prompt)
	}
}

func (s *AIService) askOutOfScopeWithRotation(question string, history []AIConversationMessage) (string, string, error) {
	prompt := outOfScopePrompt(question, history)
	return s.askSecondRoundWithRotation(prompt)
}
