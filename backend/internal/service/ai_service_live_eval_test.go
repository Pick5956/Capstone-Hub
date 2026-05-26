//go:build ai_eval

package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/joho/godotenv"
)

type liveIntentEvalCase struct {
	Name           string   `json:"name"`
	Question       string   `json:"question"`
	ExpectedIntent AIIntent `json:"expected_intent"`
}

func liveAIServiceOrSkip(t *testing.T) *AIService {
	t.Helper()
	if os.Getenv("AI_EVAL_ENABLED") != "1" {
		t.Skip("set AI_EVAL_ENABLED=1 to run live provider evaluation; this consumes provider quota")
	}

	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	svc := ProvideAIService(nil)
	if len(svc.getGroqKeys()) == 0 && len(svc.getGeminiKeys()) == 0 {
		t.Skip("live provider evaluation enabled, but no GROQ/GEMINI API key is configured")
	}
	return svc
}

func TestLiveProviderIntentEvaluation(t *testing.T) {
	svc := liveAIServiceOrSkip(t)

	raw, err := os.ReadFile(filepath.Join("testdata", "ai_live_intent_cases.json"))
	if err != nil {
		t.Fatalf("read live evaluation cases: %v", err)
	}
	var cases []liveIntentEvalCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("decode live evaluation cases: %v", err)
	}

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			intent, err := svc.classifyIntent(tc.Question)
			if err != nil {
				t.Fatalf("classifyIntent(%q): %v", tc.Question, err)
			}
			if intent != tc.ExpectedIntent {
				t.Fatalf("classifyIntent(%q) = %q, want %q", tc.Question, intent, tc.ExpectedIntent)
			}
		})
	}
}

func TestLiveConversationResponseIsDirectAndNonEmpty(t *testing.T) {
	svc := liveAIServiceOrSkip(t)
	response, err := svc.AskOperations(0, &AIAskRequest{Question: "ขอบคุณครับ ช่วยได้มากเลย"})
	if err != nil {
		t.Fatalf("AskOperations conversation flow: %v", err)
	}
	if response.Intent != AIIntentChat {
		t.Fatalf("AskOperations conversation intent = %q, want %q", response.Intent, AIIntentChat)
	}
	if strings.TrimSpace(response.Answer) == "" {
		t.Fatal("AskOperations conversation flow returned an empty answer")
	}
	if response.Model == "" || response.Model == "local-router" {
		t.Fatalf("AskOperations conversation model = %q, want a live provider model", response.Model)
	}
}
