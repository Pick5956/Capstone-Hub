package service

import (
	"encoding/json"
	"strings"
	"testing"
)

// MaxCompletionTokens was added to a struct three legacy call sites already
// marshal. None of them set it, and this proves that costs them nothing: the key
// has to be absent from the JSON, so the bytes Groq receives are the same ones
// it received before the field existed. Drop the omitempty and this fails.
//
// It also pins the name. Groq deprecated max_tokens in favour of this one, and
// a request carrying the deprecated key would be quietly ignored rather than
// rejected — the ceiling would look set and would not be.
func TestGroqRequestOmitsMaxCompletionTokensWhenUnset(t *testing.T) {
	body, err := json.Marshal(groqRequest{
		Model:    "openai/gpt-oss-20b",
		Messages: []groqMessage{{Role: "user", Content: "สวัสดี"}},
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(body), "max_completion_tokens") {
		t.Fatalf("an unset ceiling reached the provider: %s", body)
	}

	ceiling := 3072
	withCeiling, err := json.Marshal(groqRequest{
		Model:               "openai/gpt-oss-20b",
		Messages:            []groqMessage{{Role: "user", Content: "สวัสดี"}},
		MaxCompletionTokens: &ceiling,
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if !strings.Contains(string(withCeiling), `"max_completion_tokens":3072`) {
		t.Fatalf("a set ceiling did not reach the provider: %s", withCeiling)
	}
	if strings.Contains(string(withCeiling), `"max_tokens"`) {
		t.Fatalf("the deprecated key was sent instead: %s", withCeiling)
	}
}

// reasoning_effort is only valid on gpt-oss. GROQ_MODEL is an environment
// variable, so pointing it at any other model must not start attaching a field
// that model will reject — a config change would otherwise break every answer.
// An empty preference is the other half: it is what every caller except joyboy
// sends, and it has to produce no field at all.
func TestReasoningEffortIsSentOnlyWhenAskedForAndSupported(t *testing.T) {
	effort := groqReasoningEffortFor("openai/gpt-oss-20b", "low")
	if effort == nil || *effort != "low" {
		t.Fatalf("gpt-oss-20b low = %v, want \"low\"", effort)
	}
	if got := groqReasoningEffortFor("openai/gpt-oss-120b", "medium"); got == nil || *got != "medium" {
		t.Fatalf("gpt-oss-120b medium = %v", got)
	}
	// No preference: no field, whatever the model.
	for _, model := range []string{"openai/gpt-oss-20b", "llama-3.3-70b-versatile"} {
		if got := groqReasoningEffortFor(model, ""); got != nil {
			t.Fatalf("%q was sent reasoning_effort=%q without being asked", model, *got)
		}
	}
	// A preference a model cannot take is dropped rather than sent.
	for _, model := range []string{"llama-3.3-70b-versatile", "qwen/qwen3-32b", "", "  "} {
		if got := groqReasoningEffortFor(model, "low"); got != nil {
			t.Fatalf("%q was sent reasoning_effort=%q", model, *got)
		}
	}

	body, err := json.Marshal(groqRequest{
		Model:           "llama-3.3-70b-versatile",
		Messages:        []groqMessage{{Role: "user", Content: "hi"}},
		ReasoningEffort: groqReasoningEffortFor("llama-3.3-70b-versatile", "low"),
	})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if strings.Contains(string(body), "reasoning_effort") {
		t.Fatalf("an unsupported model was sent the field: %s", body)
	}
}

// A cut-off reply is the failure this parsing exists to catch: it arrives with
// content, parses cleanly, and is only distinguishable from a finished one by
// finish_reason. The token counts come along because the ceiling cannot be
// chosen without knowing what a reply costs.
func TestGroqResponseReadsFinishReasonAndUsage(t *testing.T) {
	raw := `{
		"choices": [{
			"message": {"role": "assistant", "content": "มูลค่ารวมของสิน"},
			"finish_reason": "length"
		}],
		"usage": {
			"prompt_tokens": 1204,
			"completion_tokens": 900,
			"total_tokens": 2104,
			"completion_tokens_details": {"reasoning_tokens": 812}
		}
	}`
	var parsed groqResponse
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(parsed.Choices) != 1 {
		t.Fatalf("choices = %d, want 1", len(parsed.Choices))
	}
	if parsed.Choices[0].FinishReason != "length" {
		t.Fatalf("finish_reason = %q, want \"length\"", parsed.Choices[0].FinishReason)
	}
	if parsed.Choices[0].Message.Content != "มูลค่ารวมของสิน" {
		t.Fatalf("the reply text was lost: %q", parsed.Choices[0].Message.Content)
	}
	if parsed.Usage.CompletionTokens != 900 || parsed.Usage.PromptTokens != 1204 {
		t.Fatalf("usage = %+v", parsed.Usage)
	}
	// The one number that says whether the ceiling went on thinking or on
	// writing, which need opposite fixes.
	if parsed.Usage.CompletionTokensDetails.ReasoningTokens != 812 {
		t.Fatalf("reasoning_tokens = %d, want 812", parsed.Usage.CompletionTokensDetails.ReasoningTokens)
	}
}

// A provider that reports neither field must still parse, and must not be read
// as "finished normally, thought about nothing" — the zero values are absence
// of a report, and the log wording has to keep that distinction.
func TestGroqResponseSurvivesAProviderThatReportsNeither(t *testing.T) {
	var parsed groqResponse
	if err := json.Unmarshal([]byte(`{"choices":[{"message":{"role":"assistant","content":"ok"}}]}`), &parsed); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if parsed.Choices[0].FinishReason != "" || parsed.Usage.CompletionTokens != 0 {
		t.Fatalf("absent fields invented values: %+v", parsed)
	}
	if parsed.Choices[0].Message.Content != "ok" {
		t.Fatal("the reply text was lost when the extra fields were missing")
	}
}

// positiveOrNil is what keeps "zero means default" true at the wire: an unset
// ceiling has to become a nil pointer so omitempty drops the key, while a real
// ceiling has to survive. Get this wrong and either every legacy call starts
// sending max_completion_tokens=0 (which Groq would read as a zero-length reply)
// or joyboy's ceiling never reaches the provider.
func TestPositiveOrNilGatesTheCeiling(t *testing.T) {
	for _, unset := range []int{0, -1, -3072} {
		if positiveOrNil(unset) != nil {
			t.Fatalf("%d produced a non-nil ceiling", unset)
		}
	}
	got := positiveOrNil(3072)
	if got == nil || *got != 3072 {
		t.Fatalf("a real ceiling was dropped: %v", got)
	}
}
