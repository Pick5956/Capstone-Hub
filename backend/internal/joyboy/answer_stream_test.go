package joyboy

import (
	"context"
	"strings"
	"testing"
)

// A chat that streams: the reply arrives in pieces, then as a whole.
type fakeStreamChat struct {
	fakeChat
	pieces []string
}

func (c *fakeStreamChat) CompleteStream(ctx context.Context, prompt string, kind CallKind, onDelta func(string)) (string, error) {
	c.writeCalls++
	c.lastPrompt = prompt
	for _, piece := range c.pieces {
		onDelta(piece)
	}
	return strings.Join(c.pieces, ""), nil
}

// While the answer is being written the owner sees it grow, never the
// follow-up marker, and what they end up with is exactly the finished answer
// the non-streaming path would have produced.
func TestAskStreamsDraftsThatNeverShowTheFollowUpBlock(t *testing.T) {
	chat := &fakeStreamChat{
		fakeChat: fakeChat{selected: []string{"get_low_stock_ingredients"}},
		pieces:   []string{"ปีกไก่", "ใกล้หมดครับ", "\n==", "=ถามต่อ===\nปีกไก่พอถึงเมื่อไหร่\nสั่งเพิ่ม\nเมนูไหนใช้"},
	}
	tools := &fakeTools{results: []ToolResult{{Tool: "get_low_stock_ingredients", Label: "วัตถุดิบใกล้หมด", Body: "- ปีกไก่: 417 กรัม"}}}
	var drafts []string
	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{
		Question: "ของใกล้หมดมีอะไร",
		OnDraft:  func(text string) { drafts = append(drafts, text) },
	})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if len(drafts) == 0 {
		t.Fatal("nobody was shown a draft")
	}
	for _, draft := range drafts {
		if strings.Contains(draft, "=") || strings.Contains(draft, "ถามต่อ") || strings.Contains(draft, "พอถึง") {
			t.Errorf("a draft showed the follow-up block: %q", draft)
		}
	}
	if drafts[len(drafts)-1] != "ปีกไก่ใกล้หมดครับ" || answer.Text != "ปีกไก่ใกล้หมดครับ" {
		t.Fatalf("last draft %q, final %q", drafts[len(drafts)-1], answer.Text)
	}
	if len(answer.FollowUps) != 3 {
		t.Fatalf("follow-ups = %q", answer.FollowUps)
	}
}

// No watcher, or a chat that cannot stream: the plain call, as before.
func TestAskWithoutAWatcherDoesNotStream(t *testing.T) {
	chat := &fakeStreamChat{fakeChat: fakeChat{replies: []string{"สวัสดีครับ"}}, pieces: []string{"ไม่ควรถูกใช้"}}
	answer, err := newAssistant(t, chat, &fakeTools{}).Ask(context.Background(), Request{Question: "สวัสดี"})
	if err != nil || answer.Text != "สวัสดีครับ" {
		t.Fatalf("answer = %q, err = %v", answer.Text, err)
	}
}
