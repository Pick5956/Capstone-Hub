package joyboy

import (
	"strings"
	"testing"
)

// Every other rule in the answer prompt is about figures: where they may come
// from, how to format them, when to name the period. Asked "วันนี้กินอะไรดี" the
// model reached for menu tools — the only menu tools it has are commercial ones
// — and those rules then obliged it to quote profit at someone deciding what to
// have for dinner. This rule is the one that says figures are optional.
func TestTheAnswerPromptAllowsAnAnswerWithoutFigures(t *testing.T) {
	prompt := answerPrompt("วันนี้กินอะไรดี", nil, "rank=1 menu=ต้มยำกุ้งน้ำข้น qty=108")
	if !strings.Contains(prompt, "ก็ไม่ต้องยกตัวเลขพวกนั้นมาประกอบ") {
		t.Fatal("the rule releasing the model from quoting figures is missing")
	}
	// It must stay a permission, not a ban: a question about sales still needs
	// its numbers.
	if !strings.Contains(prompt, "ตัวเลขทุกตัวต้องมาจากข้อมูลข้างบน") {
		t.Fatal("the rule anchoring figures to the data was lost")
	}
}

// The thousand-separator rule failed twice as a plain statement of the right
// form, so it now carries two things a statement does not: the wrong form named
// outright, because "15 012" is what actually came out, and a pass over the
// figures before answering, because this is the one rule the model has to apply
// at every figure rather than once. Both parts are load-bearing; whoever tidies
// this rule down to one line is about to reintroduce round four.
func TestTheAnswerPromptPinsTheThousandSeparator(t *testing.T) {
	prompt := answerPrompt("ยอดขาย 7 วัน", nil, "period=7 วันล่าสุด\nrevenue=15012.00")
	for _, required := range []string{
		"คั่นหลักพันด้วยจุลภาคเท่านั้น",
		"ห้ามคั่นด้วยช่องว่าง",
		"15 012",
		"ไล่ดูตัวเลขทุกตัวที่เขียนไปอีกครั้ง",
	} {
		if !strings.Contains(prompt, required) {
			t.Fatalf("the thousand-separator rule lost %q", required)
		}
	}
}
