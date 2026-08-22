package service

// The follow-up that the word list did not know.
//
// Measured on 22 Aug against the running backend: the owner asked for three new
// Songkran menu ideas, got them, and then asked "ขอวิธีทำสามรายการนี้หน่อย".
// The log shows no rewrite at all — looksContextDependent knows "อันนี้" and not
// "รายการนี้" — so the classifier read the sentence alone, came back at 0.40, and
// the owner was told to rephrase while the three items sat one turn above.
//
// Growing the word list fixes that sentence and nothing else. These tests pin
// the behaviour that fixes the whole class: when the classifier says it is
// unsure and there is history to work with, the question is rewritten and asked
// again, whatever words it happened to use.

import (
	"context"
	"strings"
	"testing"
)

func songkranHistory() []AIConversationMessage {
	return []AIConversationMessage{
		{Role: "user", Content: "วันสงกรานต์เอาเมนูใหม่อะไรมาขายดี"},
		{Role: "assistant", Content: "แนะนำ 3 ตัวเลือกครับ 1. น้ำส้มเย็น 2. ข้าวกุ้งต้มยำ 3. น้ำชาเย็นสับปะรด"},
	}
}

func TestUnrecognisedFollowUpIsRewrittenAfterTheClassifierGivesUp(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	t.Setenv("AI_NARRATION", "off")

	const asked = "ขอวิธีทำสามรายการนี้หน่อย"
	const rewritten = "ขอวิธีทำน้ำส้มเย็น ข้าวกุ้งต้มยำ และน้ำชาเย็นสับปะรดหน่อย"

	var classified []string
	provider := &stubAIProviderAdapter{
		id: "groq", displayName: "Groq", configured: true,
		classify: func(question string) (AIRouterResult, error) {
			classified = append(classified, question)
			if question == asked {
				// What the live classifier actually answered for this sentence.
				return AIRouterResult{Task: AITaskUnclear, Confidence: 0.40}, nil
			}
			return AIRouterResult{Task: AITaskRestaurantContent, Confidence: 0.85}, nil
		},
		complete: func(string) (aiProviderAnswer, error) {
			return aiProviderAnswer{Text: rewritten, Model: "rewrite-model"}, nil
		},
		answer: func(request aiProviderAnswerRequest) (aiProviderAnswer, error) {
			if request.Question != rewritten {
				t.Errorf("answered %q, want the rewritten question", request.Question)
			}
			return aiProviderAnswer{Text: "สูตรทั้งสามรายการครับ", Model: "answer-model"}, nil
		},
	}
	service := &AIService{providerAdapters: []aiProviderAdapter{provider}}

	response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: asked,
		History:  songkranHistory(),
	})
	if err != nil {
		t.Fatalf("AskOperationsForOwner: %v", err)
	}
	if response.Task == AITaskUnclear {
		t.Fatalf("the owner was still asked to rephrase: %q", response.Answer)
	}
	if len(classified) != 2 || classified[0] != asked || classified[1] != rewritten {
		t.Fatalf("classifier saw %q, want the original then the rewrite", classified)
	}
	if !strings.Contains(response.Answer, "สูตร") {
		t.Fatalf("answer = %q", response.Answer)
	}
}

// The second chance must not fire on a question the classifier understood, and
// must not fire when there is no history to rewrite against — the first would
// spend a provider call on every answered question, the second would spend one
// on every vague opening line.
func TestSecondChanceOnlyRunsWhenItCanHelp(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	t.Setenv("AI_NARRATION", "off")

	newService := func(confidence float64, rewrites *int) (*AIService, *stubAIProviderAdapter) {
		provider := &stubAIProviderAdapter{
			id: "groq", displayName: "Groq", configured: true,
			classify: func(string) (AIRouterResult, error) {
				return AIRouterResult{Task: AITaskGeneralChat, Confidence: confidence}, nil
			},
			complete: func(string) (aiProviderAnswer, error) {
				*rewrites++
				return aiProviderAnswer{Text: "เขียนใหม่", Model: "rewrite-model"}, nil
			},
			answer: func(aiProviderAnswerRequest) (aiProviderAnswer, error) {
				return aiProviderAnswer{Text: "ตอบแล้วครับ", Model: "answer-model"}, nil
			},
		}
		return &AIService{providerAdapters: []aiProviderAdapter{provider}}, provider
	}

	confidentRewrites := 0
	confident, _ := newService(0.95, &confidentRewrites)
	if _, err := confident.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "สวัสดีครับ",
		History:  songkranHistory(),
	}); err != nil {
		t.Fatalf("confident ask: %v", err)
	}
	if confidentRewrites != 0 {
		t.Fatalf("a confident classification triggered %d rewrites", confidentRewrites)
	}

	historylessRewrites := 0
	historyless, _ := newService(0.30, &historylessRewrites)
	response, err := historyless.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "เอามา",
	})
	if err != nil {
		t.Fatalf("historyless ask: %v", err)
	}
	if historylessRewrites != 0 {
		t.Fatalf("a question with no history triggered %d rewrites", historylessRewrites)
	}
	if response.Task != AITaskUnclear {
		t.Fatalf("with nothing to resolve against, the question must still be handed back, got task %q", response.Task)
	}
}
