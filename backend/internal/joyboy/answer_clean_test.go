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

// A closing "ครับ" jammed against bold markup or an English word — "**9,988 บาท**ครับ",
// "Dishyครับ" — reads as cramped once rendered, because the particle touches the
// non-Thai character with no gap. A space goes in there. But Thai convention runs
// the particle on without one, so "บาทครับ" must be left exactly as it is.
func TestCleanAnswerSpacesAParticleStuckToNonThai(t *testing.T) {
	cases := []struct{ in, want string }{
		{"ยอดขายวันนี้คือ **9,988 บาท**ครับ", "ยอดขายวันนี้คือ **9,988 บาท** ครับ"},
		{"ผมคือผู้ช่วยของระบบ Dishyครับ", "ผมคือผู้ช่วยของระบบ Dishy ครับ"},
		{"กำไร 4,469ครับ", "กำไร 4,469 ครับ"},
		// Thai particle convention: no space, and cleaning must not add one.
		{"สวัสดีครับ", "สวัสดีครับ"},
		{"ยอดขาย 77,340 บาทครับ", "ยอดขาย 77,340 บาทครับ"},
		// Already spaced stays spaced (idempotent).
		{"Dishy ครับ", "Dishy ครับ"},
	}
	for _, c := range cases {
		if got := cleanAnswer(c.in); got != c.want {
			t.Errorf("cleanAnswer(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
