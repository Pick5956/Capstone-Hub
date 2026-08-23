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
