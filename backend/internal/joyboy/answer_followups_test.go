package joyboy

import (
	"context"
	"strings"
	"testing"
)

// The writer ends its reply with three questions the owner might ask next.
// They come off the end before anything else looks at the answer, so the
// cleaning and the figure check never see them and the owner never sees the
// marker. What the model wrote is kept as written — the rules that make a
// follow-up good are in the prompt; Go only takes list markers off and stops
// at the three the screen can show.
func TestSplitFollowUpsTakesTheBlockOffTheEnd(t *testing.T) {
	raw := "ปีกไก่เหลือ 417 กรัม ใกล้หมดครับ\n\n===ถามต่อ===\n- ปีกไก่พอถึงเมื่อไหร่\n2. สั่งปีกไก่เพิ่ม 5 กิโล\n\n\"เมนูไหนใช้ปีกไก่\"\nข้อที่สี่ที่จอไม่มีที่ให้\n"
	answer, followUps, _ := splitFollowUps(raw)
	if strings.Contains(answer, "ถามต่อ") || strings.Contains(answer, "ปีกไก่พอถึง") {
		t.Fatalf("the block stayed in the answer: %q", answer)
	}
	want := []string{"ปีกไก่พอถึงเมื่อไหร่", "สั่งปีกไก่เพิ่ม 5 กิโล", "เมนูไหนใช้ปีกไก่"}
	if len(followUps) != len(want) {
		t.Fatalf("follow-ups = %q, want %q", followUps, want)
	}
	for i := range want {
		if followUps[i] != want[i] {
			t.Errorf("follow-up %d = %q, want %q", i, followUps[i], want[i])
		}
	}
}

func TestSplitFollowUpsLeavesAReplyWithoutTheBlockAlone(t *testing.T) {
	answer, followUps, _ := splitFollowUps("ยอดขายวันนี้ 5,000 บาทครับ")
	if answer != "ยอดขายวันนี้ 5,000 บาทครับ" || followUps != nil {
		t.Fatalf("answer = %q, follow-ups = %v", answer, followUps)
	}
}

// End to end: the questions reach the caller on the Answer, and the text the
// owner reads stops where the answer stops.
func TestAskReturnsTheWritersFollowUps(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_low_stock_ingredients"},
		replies:  []string{"ปีกไก่ใกล้หมดครับ\n===ถามต่อ===\nปีกไก่พอถึงเมื่อไหร่\nสั่งปีกไก่เพิ่ม\nเมนูไหนใช้ปีกไก่"},
	}
	tools := &fakeTools{results: []ToolResult{
		{Tool: "get_low_stock_ingredients", Label: "วัตถุดิบใกล้หมด", Body: "- ปีกไก่: 417 กรัม"},
	}}
	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "ของใกล้หมดมีอะไร"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if answer.Text != "ปีกไก่ใกล้หมดครับ" {
		t.Fatalf("text = %q", answer.Text)
	}
	if len(answer.FollowUps) != 3 || answer.FollowUps[0] != "ปีกไก่พอถึงเมื่อไหร่" {
		t.Fatalf("follow-ups = %q", answer.FollowUps)
	}
	// Both templates carry the rules, so a chat reply gets them too.
	for _, want := range []string{followUpMarker, "เสียงของเจ้าของร้าน", "ห้ามซ้ำกับคำถามที่เพิ่งถาม"} {
		if !strings.Contains(chat.lastPrompt, want) {
			t.Errorf("the writer prompt lost %q", want)
		}
	}
	if !strings.Contains(answerPrompt("สวัสดี", nil, "", ""), followUpMarker) {
		t.Error("the no-data template does not ask for follow-ups")
	}
}

// A how-to answer may end its block with the page it was explaining. The
// path is kept apart from the questions and never shown as one.
func TestSplitFollowUpsKeepsThePageLineApart(t *testing.T) {
	raw := "กดเพิ่มรายจ่ายที่มุมขวาบนครับ\n===ถามต่อ===\nดูรายจ่ายเดือนนี้\nรายจ่ายหมวดไหนเยอะสุด\nบันทึกค่าไฟ\nไปหน้า /expenses\n"
	answer, followUps, navigateTo := splitFollowUps(raw)
	if navigateTo != "/expenses" {
		t.Fatalf("navigateTo = %q", navigateTo)
	}
	if len(followUps) != 3 || strings.Contains(strings.Join(followUps, "|"), "ไปหน้า") {
		t.Fatalf("follow-ups = %q", followUps)
	}
	if strings.Contains(answer, "ไปหน้า") {
		t.Fatalf("the page line leaked into the answer: %q", answer)
	}
	// Not a path: ignored, not shown as a question either.
	if _, ups, nav := splitFollowUps("x\n===ถามต่อ===\nไปหน้า จัดการเมนู\nถามอะไรดี"); nav != "" || len(ups) != 1 {
		t.Fatalf("a page line without a path should be dropped: nav=%q ups=%q", nav, ups)
	}
}
