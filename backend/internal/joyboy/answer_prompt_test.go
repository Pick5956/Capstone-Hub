package joyboy

import (
	"strings"
	"testing"
)

// The prompts are format strings, so a literal percent sign has to be doubled
// and the verbs have to match the arguments. Getting it wrong prints
// "%!s(MISSING)" into the instructions the model reads, which produces a worse
// answer rather than an error. go vet catches it at build time; this catches it
// for anyone editing the prompt without running vet.
func TestPromptsRenderWithoutFormatArtifacts(t *testing.T) {
	rendered := []string{
		answerPrompt("เมนูไหนขายดี", nil, "[get_top_selling_menus]\nrank=1 menu=ต้มยำกุ้ง qty=109"),
		answerPrompt("สวัสดี", nil, ""),
		answerPrompt("แล้วอันที่สองล่ะ", []Turn{{Role: "user", Content: "เมนูไหนขายดี"}}, "rank=1 menu=ต้มยำกุ้ง"),
	}
	for _, prompt := range rendered {
		if strings.Contains(prompt, "%!") {
			t.Fatalf("a format verb did not match its argument:\n%s", prompt)
		}
		if strings.Contains(prompt, "(MISSING)") || strings.Contains(prompt, "(EXTRA") {
			t.Fatalf("the prompt has the wrong number of arguments:\n%s", prompt)
		}
	}
}

// Both prompts have to carry the question through; a template that drops it
// still renders cleanly and still ruins the answer.
func TestBothPromptsCarryTheQuestion(t *testing.T) {
	withData := answerPrompt("เมนูไหนกำไรดีสุด", nil, "menu=ข้าวกะเพรา margin_pct=69.85")
	if !strings.Contains(withData, "เมนูไหนกำไรดีสุด") || !strings.Contains(withData, "margin_pct=69.85") {
		t.Fatal("the question or the data was lost from the data prompt")
	}
	withoutData := answerPrompt("กำไรขั้นต้นคืออะไร", nil, "   ")
	if !strings.Contains(withoutData, "กำไรขั้นต้นคืออะไร") {
		t.Fatal("the question was lost from the no-data prompt")
	}
	// A sheet of nothing but spaces must take the no-data path, or the model is
	// shown an empty data block and invents something to fill it.
	if strings.Contains(withoutData, "ข้อมูลที่ระบบคำนวณมาแล้ว") {
		t.Fatal("a blank sheet was passed off as data")
	}
}

// The client renders markdown, so the answer prompt now asks for it — bounded,
// to avoid the sea-of-orange the bold rule would otherwise cause and the
// per-answer inconsistency formatting is prone to. This pins the intent: bold
// only the headline figure, real list rows, headings-with-emoji for overviews,
// and plain prose for short answers. It also guards that the old blanket
// heading ban did not creep back in.
func TestTheAnswerPromptAsksForBoundedFormatting(t *testing.T) {
	prompt := answerPrompt("สรุปสถานการณ์ร้าน", nil, "revenue=77340.00")
	for _, want := range []string{
		"ทำตัวหนาด้วย **",
		"ตัวที่สำคัญที่สุดตัวเดียว",
		"ใช้หัวข้อสั้น ๆ",
		"อิโมจิ",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("the formatting guidance lost %q", want)
		}
	}
	if strings.Contains(prompt, "ห้ามใส่หัวข้อ") {
		t.Fatal("the blanket heading ban is back and contradicts the formatting rules")
	}
}
