package service

// The wiring, not the orchestration — joyboy's own tests cover the logic with
// fakes. What matters here is that the two halves meet correctly: the catalogue
// the model is offered, and the fact that a failure leaves as an outage rather
// than as an answer nobody vouched for.

import (
	"context"
	"errors"
	"strings"
	"testing"

	"Project-M/internal/joyboy"
)

func TestJoyboyIsOffUntilTheModeSaysOtherwise(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "")
	if aiOrchestrationMode() == aiOrchestratorJoyboy {
		t.Fatal("joyboy must not be the default")
	}
	for _, mode := range []string{"legacy", "shadow", "planner"} {
		t.Setenv("AI_ORCHESTRATOR_MODE", mode)
		if aiOrchestrationMode() == aiOrchestratorJoyboy {
			t.Fatalf("mode %q selected joyboy", mode)
		}
	}
	t.Setenv("AI_ORCHESTRATOR_MODE", "joyboy")
	if aiOrchestrationMode() != aiOrchestratorJoyboy {
		t.Fatal("AI_ORCHESTRATOR_MODE=joyboy must select joyboy")
	}
}

func TestJoyboyCatalogueOffersEveryReadOnlyToolWithADescription(t *testing.T) {
	tools := &joyboyTools{service: &AIService{}, restaurantID: 1}
	catalogue := tools.Catalogue()
	if len(catalogue) == 0 {
		t.Fatal("the model was offered no tools at all")
	}
	for _, spec := range catalogue {
		if strings.TrimSpace(spec.Description) == "" {
			t.Fatalf("%s has no description, so the model can only guess from its name", spec.Name)
		}
		// A tool the executor does not recognise would be offered and then
		// silently dropped, which reads to the model as a tool that never works.
		// joyboy-only tools are handled by runJoyboyExtraTool, not this path.
		if !isJoyboyExtraTool(AIToolName(spec.Name)) && !isSupportedReadOnlyTool(AIToolName(spec.Name)) {
			t.Fatalf("%s is offered but is not a supported read-only tool", spec.Name)
		}
	}
}

// Nothing in the catalogue may take arguments: a tool with a restaurant
// parameter is a tool a model could aim at another shop.
func TestNoOfferedToolTakesArguments(t *testing.T) {
	for _, definition := range (&AIService{}).getGroqTools() {
		if len(definition.Function.Parameters.Properties) != 0 {
			t.Fatalf("%s accepts arguments", definition.Function.Name)
		}
	}
}

func TestJoyboyRunsNothingWhenNoToolWasAskedFor(t *testing.T) {
	// No repository is wired, so any snapshot read would fail. Returning cleanly
	// proves the greeting path never touches the database.
	tools := &joyboyTools{service: &AIService{}, restaurantID: 1}
	results, err := tools.Run(context.Background(), nil, "")
	if err != nil || len(results) != 0 {
		t.Fatalf("results = %v, err = %v", results, err)
	}
}

func TestJoyboyFailureIsReportedAsAnOutage(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "joyboy")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")

	// No provider is configured, so the very first model call fails.
	service := &AIService{providerAdapters: []aiProviderAdapter{
		&stubAIProviderAdapter{id: "groq", displayName: "Groq", configured: false},
	}}

	_, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "เมนูไหนขายดี",
	})
	if err == nil {
		t.Fatal("an answer was produced with no provider available")
	}
	if !errors.Is(err, ErrAIProviderUnavailable) && !errors.Is(err, ErrAIQuotaExceeded) {
		t.Fatalf("error = %v, want an outage the API layer can report", err)
	}
	// The owner must never be handed the fact sheet as though it were an answer.
	if strings.Contains(err.Error(), "เมนูที่ขายดีที่สุด") {
		t.Fatal("the fact sheet leaked into the failure path")
	}
}

func TestJoyboyHistoryCarriesRoleAndContent(t *testing.T) {
	turns := joyboyHistory([]AIConversationMessage{
		{Role: "user", Content: "เมนูไหนกำไรดีสุด"},
		{Role: "assistant", Content: "ข้าวกะเพราไก่ไข่ดาว"},
	})
	if len(turns) != 2 || turns[0].Role != "user" || turns[1].Content != "ข้าวกะเพราไก่ไข่ดาว" {
		t.Fatalf("turns = %+v", turns)
	}
	var empty []joyboy.Turn
	if got := joyboyHistory(nil); len(got) != len(empty) {
		t.Fatalf("no history should stay empty, got %+v", got)
	}
}

// Both rounds run at medium — low was tried and lost twice, breaking tool
// choice on the select round and drifting figures (96 dishes written as 95) on
// the write round. What still differs is the ceiling: the write round thinks
// long enough to hit the 2,048 default mid-word, so it carries 3,072, while the
// select round emits a short array and needs no ceiling at all. Collapse either
// difference and a measured failure returns.
func TestJoyboySpendsThinkingWhereTheDecisionIs(t *testing.T) {
	sel := joyboyCompleteOptions(joyboy.CallSelectTools)
	if sel.ReasoningEffort != "medium" {
		t.Fatalf("choosing tools runs at %q, want \"medium\"", sel.ReasoningEffort)
	}
	if sel.MaxCompletionTokens != 0 {
		t.Fatalf("the select round carries a ceiling it does not need: %d", sel.MaxCompletionTokens)
	}

	write := joyboyCompleteOptions(joyboy.CallWriteAnswer)
	if write.ReasoningEffort != "medium" {
		t.Fatalf("writing the answer runs at %q, want \"medium\"", write.ReasoningEffort)
	}
	// The ceiling has to clear the worst measured medium cost of 1,917 thinking
	// plus 326 writing, or the truncation it exists to prevent comes back.
	if write.MaxCompletionTokens < 2243 {
		t.Fatalf("the write ceiling %d does not clear the measured worst case of 2,243", write.MaxCompletionTokens)
	}

	// An unrecognised kind must not silently become the cheap path: a new call
	// added later is more likely to be a decision, and it must not lose the
	// ceiling either, since losing it is a silent truncation.
	if got := joyboyCompleteOptions(joyboy.CallKind(99)); got.ReasoningEffort != "medium" {
		t.Fatalf("an unknown call kind ran at %q instead of medium", got.ReasoningEffort)
	}
}
