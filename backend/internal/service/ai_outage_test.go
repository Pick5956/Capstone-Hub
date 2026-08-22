package service

// What the owner is told when the assistant cannot run.
//
// The deterministic layer can answer many questions from the database alone, so
// for a long time a provider outage was simply absorbed: the classifier failed,
// a keyword guess took over, and an ordinary-looking answer came back. Nothing
// on screen said the assistant was degraded, and nobody could tell that the
// day's token budget was gone.
//
// These tests pin the opposite behaviour. The question is not whether an answer
// could be produced — it usually could — but whether producing one silently is
// honest. It is not.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestClassifierOutageIsReportedInsteadOfGuessed(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")

	provider := &stubAIProviderAdapter{
		id: "groq", displayName: "Groq", configured: true,
		classify: func(string) (AIRouterResult, error) {
			return AIRouterResult{}, errors.New("Groq classifier transport failed")
		},
		answer: func(aiProviderAnswerRequest) (aiProviderAnswer, error) {
			t.Error("no answer should be attempted once the classifier is down")
			return aiProviderAnswer{}, nil
		},
	}
	service := &AIService{providerAdapters: []aiProviderAdapter{provider}}

	// "เมนูไหนขายดีสุด" is exactly the shape the keyword backstop used to rescue,
	// which is what made the outage invisible.
	_, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "เมนูไหนขายดีสุด",
	})
	if err == nil {
		t.Fatal("an answer was produced while the provider was down")
	}
	if !errors.Is(err, ErrAIProviderUnavailable) {
		t.Fatalf("error = %v, want ErrAIProviderUnavailable", err)
	}
	if errors.Is(err, ErrAIQuotaExceeded) {
		t.Fatal("a transport failure must not be reported as an exhausted quota")
	}
}

func TestExhaustedQuotaIsReportedWithTheWaitTheProviderNamed(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")

	limited := &rateLimitedError{Provider: "Groq", RetryAfter: 42 * time.Minute}
	provider := &stubAIProviderAdapter{
		id: "groq", displayName: "Groq", configured: true,
		classify: func(string) (AIRouterResult, error) {
			return AIRouterResult{}, fmt.Errorf("Groq exhausted configured API keys: %w", limited)
		},
	}
	service := &AIService{providerAdapters: []aiProviderAdapter{provider}}

	_, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "ยอดขายเดือนนี้เท่าไหร่",
	})
	if !errors.Is(err, ErrAIQuotaExceeded) {
		t.Fatalf("error = %v, want ErrAIQuotaExceeded", err)
	}
	if seconds := AIRetryAfterSeconds(err); seconds != int((42 * time.Minute).Seconds()) {
		t.Fatalf("retry-after = %d seconds, want the 42 minutes the provider named", seconds)
	}
	// The owner reads this sentence, so it has to carry the wait in words.
	if !strings.Contains(err.Error(), "42 นาที") {
		t.Fatalf("message = %q, want the wait spelled out", err.Error())
	}
}

func TestRetryWaitIsWordedForTheOwner(t *testing.T) {
	cases := map[int]string{
		30:   "30 วินาที",
		90:   "2 นาที",
		2520: "42 นาที",
		7200: "2.0 ชั่วโมง",
	}
	for seconds, want := range cases {
		if got := describeRetryWait(seconds); got != want {
			t.Errorf("describeRetryWait(%d) = %q, want %q", seconds, got, want)
		}
	}
}

// A failure that carries no stated wait must not invent one.
func TestOutageWithoutAStatedWaitSaysSoPlainly(t *testing.T) {
	err := aiProviderOutageError(fmt.Errorf("all keys are rate limited (%w)", ErrAIQuotaExceeded))
	if !errors.Is(err, ErrAIQuotaExceeded) {
		t.Fatalf("error = %v, want ErrAIQuotaExceeded", err)
	}
	if AIRetryAfterSeconds(err) != 0 {
		t.Fatal("a wait was invented for a failure that never named one")
	}
	if strings.Contains(err.Error(), "นาที") || strings.Contains(err.Error(), "วินาที") {
		t.Fatalf("message = %q, want no fabricated wait", err.Error())
	}
}
