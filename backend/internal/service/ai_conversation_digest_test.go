package service

import (
	"strings"
	"testing"

	"Project-M/internal/entity"
)

// The digest is the one layer the model writes, and it was built deliberately
// without a Go gate on its content: the owner's call was to see what the model
// does before deciding it needs bars. What Go still does is hygiene, and these
// tests pin exactly that line — nothing here judges whether a summary is a good
// summary, only that what comes back is safe to paste into the next prompt.
func TestTidyDigestIsHygieneNotJudgement(t *testing.T) {
	// Ordinary output passes through as written. The wording is the model's.
	clean := tidyDigest("- เจ้าของตัดสินใจยังไม่สั่งกะเพรา เพราะพรุ่งนี้ร้านปิด\n- สนใจกำไรมากกว่ายอดขาย")
	if !strings.Contains(clean, "ยังไม่สั่งกะเพรา") || !strings.Contains(clean, "สนใจกำไร") {
		t.Fatalf("a normal digest should survive untouched: %q", clean)
	}

	// A bare tool name would be copied into an answer sooner or later; the
	// bracketed cleaner downstream does not catch this form.
	if got := tidyDigest("- ดูยอดขายด้วย get_sales_summary แล้วคุยต่อ"); strings.Contains(got, "get_sales_summary") {
		t.Errorf("a raw tool name reached the digest: %q", got)
	}

	// Markdown would be read as instructions when this text is pasted into a
	// prompt, so it is stripped rather than trusted.
	if got := tidyDigest("## หัวข้อ\n**- ตัดสินใจปิดร้านพรุ่งนี้**"); strings.Contains(got, "#") || strings.Contains(got, "**") {
		t.Errorf("markdown survived into the digest: %q", got)
	}

	// "Nothing worth remembering" is a real answer and must not be stored as text.
	for _, empty := range []string{"", "   ", "ไม่มี", "- ไม่มี"} {
		if got := tidyDigest(empty); got != "" {
			t.Errorf("tidyDigest(%q) = %q, want empty", empty, got)
		}
	}

	// A runaway reply becomes a second conversation inside every later prompt.
	huge := strings.Repeat("- จำเรื่องนี้ไว้ด้วยนะครับ\n", 200)
	if runes := []rune(tidyDigest(huge)); len(runes) > aiDigestMaxRunes {
		t.Errorf("digest overran its cap: %d runes", len(runes))
	}
}

// The prompt has to show both sides of each exchange. An earlier draft passed
// only the owner's questions, and a decision usually lives in the reply to
// something the assistant said — half a conversation cannot show one.
func TestTheDigestPromptShowsBothSidesAndBansFigures(t *testing.T) {
	prompt := buildDigestPrompt([]entity.AIConversationTurn{
		{Sequence: 1, Question: "กะเพราใกล้หมดยัง", Answer: "เหลือ 400 กรัมครับ"},
		{Sequence: 2, Question: "ไม่ต้องสั่ง พรุ่งนี้ปิดร้าน", Answer: "รับทราบครับ"},
	}, "")
	for _, want := range []string{"กะเพราใกล้หมดยัง", "เหลือ 400 กรัมครับ", "ไม่ต้องสั่ง พรุ่งนี้ปิดร้าน"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("the digest prompt lost %q", want)
		}
	}
	if !strings.Contains(prompt, "ห้ามใส่ตัวเลขทุกชนิด") {
		t.Error("the digest must be told to keep figures out — they go stale between turns")
	}
	// An existing digest is handed back so the model merges rather than restarts.
	merged := buildDigestPrompt([]entity.AIConversationTurn{{Question: "ถามใหม่", Answer: "ตอบใหม่"}},
		"- เคยตัดสินใจว่าจะไม่ขึ้นราคา")
	if !strings.Contains(merged, "เคยตัดสินใจว่าจะไม่ขึ้นราคา") {
		t.Error("the previous digest must be shown so it can be carried forward")
	}
}
