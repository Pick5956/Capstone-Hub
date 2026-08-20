package service

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// aiProviderAnswerMode describes the current response path without exposing a
// provider's wire format to the orchestration layer.
type aiProviderAnswerMode uint8

const (
	aiProviderAnswerConversation aiProviderAnswerMode = iota + 1
	aiProviderAnswerAnalytical
)

type aiProviderAnswerRequest struct {
	Question       string
	History        []AIConversationMessage
	Snapshot       *AISnapshot
	Mode           aiProviderAnswerMode
	CandidateTools []AIToolName
}

type aiProviderAnswer struct {
	Text  string
	Model string
}

// aiProviderAdapter is the provider-neutral boundary used by AIService.
// Groq and Gemini keep their own HTTP payloads and response parsing behind this
// interface, while routing, fallback order, and backend policy remain shared.
type aiProviderAdapter interface {
	ID() string
	DisplayName() string
	Configured() bool
	Classify(question string) (AIRouterResult, error)
	Answer(request aiProviderAnswerRequest) (aiProviderAnswer, error)
	Complete(prompt string) (aiProviderAnswer, error)
}

type groqProviderAdapter struct {
	service *AIService
}

func (a *groqProviderAdapter) ID() string          { return "groq" }
func (a *groqProviderAdapter) DisplayName() string { return "Groq" }
func (a *groqProviderAdapter) Configured() bool    { return len(a.service.getGroqKeys()) > 0 }

func (a *groqProviderAdapter) Classify(question string) (AIRouterResult, error) {
	keys := a.service.getGroqKeys()
	if len(keys) == 0 {
		return AIRouterResult{}, errors.New("GROQ_API_KEYS is not configured")
	}

	attempts, releaseAt := nextProviderAttempts(&a.service.keyHealth, "groq", keys, &a.service.groqKeyIndex)
	if len(attempts) == 0 {
		return AIRouterResult{}, allKeysRateLimitedError("Groq classifier", len(keys), releaseAt)
	}

	var lastErr error
	for _, attempt := range attempts {
		raw, err := a.service.executeClassifierGroq(question, attempt.Key)
		if err == nil {
			a.service.keyHealth.clear("groq", attempt.Index)
			result, parseErr := parseRouterJSON(raw)
			if parseErr == nil {
				return result, nil
			}
			lastErr = parseErr
			aiStage("warn", "Groq classifier returned invalid JSON (%v) → rotating", parseErr)
			continue
		}
		lastErr = err
		// A withdrawn model answers 404 for every key, so stop instead of spending
		// the remaining keys rediscovering the same failure.
		if errors.Is(err, errModelUnavailable) {
			aiStage("error", "Groq classifier: %v — skipping remaining keys", err)
			return AIRouterResult{}, err
		}
		if errors.Is(err, errRateLimit) {
			wait := retryAfterOf(err)
			a.service.keyHealth.park("groq", attempt.Index, time.Now().Add(wait))
			aiStage("warn", "Groq classifier key %d/%d rate limited → parked for %s", attempt.Position, attempt.Total, wait.Round(time.Second))
			continue
		}
		aiStage("warn", "Groq classifier key %d/%d failed: %v → rotating", attempt.Position, attempt.Total, err)
	}
	return AIRouterResult{}, fmt.Errorf("Groq classifier exhausted configured keys: %w", lastErr)
}

func (a *groqProviderAdapter) Answer(request aiProviderAnswerRequest) (aiProviderAnswer, error) {
	if request.Mode == aiProviderAnswerConversation {
		text, model, err := a.service.askGroqWithRotation(request.Question, request.History, nil, true)
		return aiProviderAnswer{Text: text, Model: model}, err
	}
	if request.Mode != aiProviderAnswerAnalytical {
		return aiProviderAnswer{}, errors.New("unsupported AI provider answer mode")
	}
	if request.Snapshot == nil {
		return aiProviderAnswer{}, errors.New("analytical provider request requires a snapshot")
	}
	text, model, err := a.service.askGroqWithRotation(request.Question, request.History, request.Snapshot, false, request.CandidateTools)
	return aiProviderAnswer{Text: text, Model: model}, err
}

func (a *groqProviderAdapter) Complete(prompt string) (aiProviderAnswer, error) {
	text, model, err := a.service.askSecondRoundGroqWithRotation(prompt)
	return aiProviderAnswer{Text: text, Model: model}, err
}

type geminiProviderAdapter struct {
	service *AIService
}

func (a *geminiProviderAdapter) ID() string          { return "gemini" }
func (a *geminiProviderAdapter) DisplayName() string { return "Gemini" }
func (a *geminiProviderAdapter) Configured() bool    { return len(a.service.getGeminiKeys()) > 0 }

func (a *geminiProviderAdapter) Classify(question string) (AIRouterResult, error) {
	keys := a.service.getGeminiKeys()
	if len(keys) == 0 {
		return AIRouterResult{}, errors.New("GEMINI_API_KEYS is not configured")
	}

	attempts, releaseAt := nextProviderAttempts(&a.service.keyHealth, "gemini", keys, &a.service.geminiKeyIndex)
	if len(attempts) == 0 {
		return AIRouterResult{}, allKeysRateLimitedError("Gemini classifier", len(keys), releaseAt)
	}

	var lastErr error
	for _, attempt := range attempts {
		raw, err := a.service.executeClassifierGemini(question, attempt.Key)
		if err == nil {
			a.service.keyHealth.clear("gemini", attempt.Index)
			result, parseErr := parseRouterJSON(raw)
			if parseErr == nil {
				return result, nil
			}
			lastErr = parseErr
			aiStage("warn", "Gemini classifier returned invalid JSON (%v) → rotating", parseErr)
			continue
		}
		lastErr = err
		// A withdrawn model answers 404 for every key, so stop instead of spending
		// the remaining keys rediscovering the same failure.
		if errors.Is(err, errModelUnavailable) {
			aiStage("error", "Gemini classifier: %v — skipping remaining keys", err)
			return AIRouterResult{}, err
		}
		if errors.Is(err, errRateLimit) {
			wait := retryAfterOf(err)
			a.service.keyHealth.park("gemini", attempt.Index, time.Now().Add(wait))
			aiStage("warn", "Gemini classifier key %d/%d rate limited → parked for %s", attempt.Position, attempt.Total, wait.Round(time.Second))
			continue
		}
		aiStage("warn", "Gemini classifier key %d/%d failed: %v → rotating", attempt.Position, attempt.Total, err)
	}
	return AIRouterResult{}, fmt.Errorf("Gemini classifier exhausted configured keys: %w", lastErr)
}

func (a *geminiProviderAdapter) Answer(request aiProviderAnswerRequest) (aiProviderAnswer, error) {
	if request.Mode == aiProviderAnswerConversation {
		text, model, err := a.service.askGeminiWithRotation(request.Question, request.History, nil, true)
		return aiProviderAnswer{Text: text, Model: model}, err
	}
	if request.Mode != aiProviderAnswerAnalytical {
		return aiProviderAnswer{}, errors.New("unsupported AI provider answer mode")
	}
	if request.Snapshot == nil {
		return aiProviderAnswer{}, errors.New("analytical provider request requires a snapshot")
	}
	text, model, err := a.service.askGeminiWithRotation(request.Question, request.History, request.Snapshot, false, request.CandidateTools)
	return aiProviderAnswer{Text: text, Model: model}, err
}

func (a *geminiProviderAdapter) Complete(prompt string) (aiProviderAnswer, error) {
	text, model, err := a.service.askSecondRoundGeminiWithRotation(prompt)
	return aiProviderAnswer{Text: text, Model: model}, err
}

func defaultAIProviderAdapters(service *AIService) []aiProviderAdapter {
	return []aiProviderAdapter{
		&groqProviderAdapter{service: service},
		&geminiProviderAdapter{service: service},
	}
}

func (s *AIService) allProviderAdapters() []aiProviderAdapter {
	if s.providerAdapters != nil {
		return s.providerAdapters
	}
	return defaultAIProviderAdapters(s)
}

// orderedProviderAdapters applies the public AI_PROVIDER policy in one place.
// Auto mode retains the established Groq -> Gemini fallback order.
func (s *AIService) orderedProviderAdapters() []aiProviderAdapter {
	adapters := s.allProviderAdapters()
	provider := s.getAIProvider()
	if provider == "auto" {
		return adapters
	}
	for _, adapter := range adapters {
		if adapter.ID() == provider {
			return []aiProviderAdapter{adapter}
		}
	}
	return nil
}

func (s *AIService) hasConfiguredProvider() bool {
	for _, adapter := range s.orderedProviderAdapters() {
		if adapter.Configured() {
			return true
		}
	}
	return false
}

func missingProviderConfigurationError(provider string) error {
	return fmt.Errorf("%s_API_KEYS is not configured", strings.ToUpper(provider))
}
