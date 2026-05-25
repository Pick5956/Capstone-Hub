package service

import "testing"

func TestLocalIntent(t *testing.T) {
	cases := []struct {
		question string
		want     AIIntent
	}{
		{question: "สวัสดี", want: AIIntentGreeting},
		{question: "hello", want: AIIntentGreeting},
		{question: "ทำอะไรได้บ้าง", want: AIIntentCapability},
	}

	for _, tc := range cases {
		got, ok := localIntent(tc.question)
		if !ok || got != tc.want {
			t.Fatalf("localIntent(%q) = %q, %t; want %q, true", tc.question, got, ok, tc.want)
		}
	}
}

func TestLocalIntentDoesNotConsumeAmbiguousWorkTerms(t *testing.T) {
	for _, question := range []string{"เมนู", "คลัง", "ยอดขาย"} {
		if got, ok := localIntent(question); ok {
			t.Fatalf("localIntent(%q) = %q, true; ambiguous work terms should continue to clarification or classification", question, got)
		}
	}
}

func TestParseIntentFallsBackToAnalysis(t *testing.T) {
	if got := parseIntent("ANALYSIS"); got != AIIntentAnalysis {
		t.Fatalf("parseIntent(ANALYSIS) = %q, want %q", got, AIIntentAnalysis)
	}
	if got := parseIntent("CONVERSATION."); got != AIIntentChat {
		t.Fatalf("parseIntent(CONVERSATION.) = %q, want %q", got, AIIntentChat)
	}
	if got := parseIntent("unexpected"); got != AIIntentAnalysis {
		t.Fatalf("parseIntent(unexpected) = %q, want safe analysis fallback", got)
	}
}
