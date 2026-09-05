package joyboy

import (
	"strings"
	"testing"
)

// Asked for a weekly overview the model fetched sales and menus but no
// inventory, then wrote an inventory heading anyway and said the system had no
// data for it. The shop had the data; nobody had asked for it. The rule that
// caused it told the model inventory "must always be there". The rule lives
// in answerTemplate, the writing half of the prompt, not in the persona.
func TestPersonaCoversOnlyTheBlocksItWasGiven(t *testing.T) {
	for _, rule := range []string{
		"ข้อมูลทุกบล็อกที่**มีอยู่จริง**",
		"ห้ามเขียนถึงเรื่องนั้นเลย",
		"ห้ามขึ้นหัวข้อแล้วบอกว่า",
	} {
		if !strings.Contains(answerTemplate, rule) {
			t.Errorf("the persona lost the rule %q", rule)
		}
	}
	// The old wording promised a block that may not arrive.
	if strings.Contains(answerTemplate, "มักถูกลืมบ่อยที่สุด ต้องมีเสมอ") {
		t.Error("the unconditional 'inventory must always be there' line is back")
	}
}
