package joyboy

import (
	"strings"
	"testing"
)

// The fact sheet labels blocks so the model knows which figures came from where.
// The model then cited those labels to the owner, who has no idea what
// get_sales_trend is. The prompt asks it not to; this makes sure.
func TestToolLabelsNeverReachTheOwner(t *testing.T) {
	cleaned := cleanAnswer("ยอดขาย 7 วันล่าสุด = 77340 บาท [get_sales_trend]\nเมนูขายดี ต้มยำกุ้ง [get_top_selling_menus]")
	if strings.Contains(cleaned, "[") {
		t.Fatalf("a tool label survived: %q", cleaned)
	}
	if !strings.Contains(cleaned, "77340") || !strings.Contains(cleaned, "ต้มยำกุ้ง") {
		t.Fatalf("stripping the label took the answer with it: %q", cleaned)
	}
}

// Square brackets are only stripped when they hold a tool-shaped name, so a
// bracket an owner would actually read stays put.
func TestOrdinaryBracketsAreLeftAlone(t *testing.T) {
	cleaned := cleanAnswer("ยอดขายรวม 82,291 บาท [ช่วง 30 วันล่าสุด] ครับ")
	if !strings.Contains(cleaned, "[ช่วง 30 วันล่าสุด]") {
		t.Fatalf("a readable bracket was removed: %q", cleaned)
	}
}

// The chat window renders no LaTeX, so the owner reads the backslashes. Raw
// string literals here so the test data is exactly what the model sends.
func TestLatexIsFlattenedIntoReadableText(t *testing.T) {
	cleaned := cleanAnswer(`สูตรคือ
\[
\text{กำไรขั้นต้น} = \text{รายได้รวม} - \text{ต้นทุนขาย}
\]`)
	for _, token := range []string{`\[`, `\]`, `\text{`} {
		if strings.Contains(cleaned, token) {
			t.Fatalf("LaTeX token %q survived: %q", token, cleaned)
		}
	}
	if !strings.Contains(cleaned, "กำไรขั้นต้น") || !strings.Contains(cleaned, "ต้นทุนขาย") {
		t.Fatalf("the formula lost its words: %q", cleaned)
	}
}
