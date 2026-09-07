package service

import (
	"strings"
	"testing"
)

// The two providers' event streams fold into the same thing: the text in
// order, each piece handed on as it lands, the usage from the last event.
func TestReadGeminiSSEFoldsTextAndUsage(t *testing.T) {
	body := strings.NewReader(strings.Join([]string{
		`data: {"candidates":[{"content":{"parts":[{"text":"ยอดขาย"}]}}]}`,
		"",
		`: keep-alive`,
		`data: {"candidates":[{"content":{"parts":[{"text":"วันนี้ 1,310 บาทครับ"}]}}],"usageMetadata":{"promptTokenCount":5380,"candidatesTokenCount":90,"totalTokenCount":5470}}`,
		"",
	}, "\n"))
	var pieces []string
	text, usage, firstAt, err := readGeminiSSE(body, func(s string) { pieces = append(pieces, s) })
	if err != nil {
		t.Fatal(err)
	}
	if text != "ยอดขายวันนี้ 1,310 บาทครับ" || len(pieces) != 2 || firstAt.IsZero() {
		t.Fatalf("text=%q pieces=%q firstAt=%v", text, pieces, firstAt)
	}
	if usage.PromptTokenCount != 5380 || usage.CandidatesTokenCount != 90 {
		t.Fatalf("usage = %+v", usage)
	}
}

func TestReadGroqSSEFoldsTextFinishAndUsage(t *testing.T) {
	body := strings.NewReader(strings.Join([]string{
		`data: {"choices":[{"delta":{"role":"assistant","content":""},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"content":"ปีกไก่"},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"content":"ใกล้หมดครับ"},"finish_reason":"stop"}]}`,
		`data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":12}}`,
		`data: [DONE]`,
	}, "\n"))
	var pieces []string
	text, finish, usage, _, err := readGroqSSE(body, func(s string) { pieces = append(pieces, s) })
	if err != nil {
		t.Fatal(err)
	}
	if text != "ปีกไก่ใกล้หมดครับ" || finish != "stop" || len(pieces) != 2 {
		t.Fatalf("text=%q finish=%q pieces=%q", text, finish, pieces)
	}
	if usage.PromptTokens != 100 || usage.CompletionTokens != 12 {
		t.Fatalf("usage = %+v", usage)
	}
}
