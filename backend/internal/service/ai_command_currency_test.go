package service

import (
	"strings"
	"testing"
)

// "บันทึกค่าไฟ 5000 ดอล" was written down as a 5,000-baht expense. The
// extractor now names the currency and the pipeline asks instead of writing.
func TestForeignCurrencyIsAQuestionNotAConversion(t *testing.T) {
	drafts, err := ParseStockCommandDrafts(`[{"name":"ค่าไฟ","kind":"expense","quantity":5000,"category":"utilities","currency":"usd"}]`)
	if err != nil || len(drafts) != 1 {
		t.Fatalf("drafts = %+v, err = %v", drafts, err)
	}
	if drafts[0].Currency != "USD" {
		t.Fatalf("currency = %q, want USD", drafts[0].Currency)
	}
	question := AIForeignCurrencyQuestion(drafts[0])
	for _, want := range []string{"บาทเท่านั้น", "ค่าไฟ", "5000", "ดอลลาร์สหรัฐ", "กี่บาท"} {
		if !strings.Contains(question, want) {
			t.Errorf("question lost %q: %s", want, question)
		}
	}
	// Baht, unsaid, or a command that carries no money: nothing to ask.
	for _, draft := range []AIStockCommandDraft{
		{Name: "ค่าไฟ", Kind: "expense", Quantity: 5000},
		{Name: "ค่าไฟ", Kind: "expense", Quantity: 5000, Currency: "THB"},
		{Name: "หมูสับ", Kind: "in", Quantity: 2, Unit: "กก.", Currency: "USD"},
	} {
		if q := AIForeignCurrencyQuestion(draft); q != "" {
			t.Errorf("%+v should not be asked about, got %q", draft, q)
		}
	}
	// A code the table does not name is read back as the code.
	if q := AIForeignCurrencyQuestion(AIStockCommandDraft{Name: "ค่าเช่า", Kind: "cost", Quantity: 12, Currency: "CHF"}); !strings.Contains(q, "CHF") {
		t.Errorf("unknown code should be read back as is: %s", q)
	}
}

// "บันทึกค่าไฟ" with no amount is a command missing a number, not a
// non-command: the prompt says so twice and shows it once.
func TestExtractorPromptKeepsAnExpenseWithoutAnAmount(t *testing.T) {
	for _, want := range []string{
		"ไม่บอกจำนวนเงิน ก็ยังเป็นคำสั่ง",
		`ข้อความ: "บันทึกค่าไฟ"`,
		`"currency":"USD"`,
		"ห้ามแปลงสกุลเงินเอง",
	} {
		if !strings.Contains(aiStockExtractionPrompt, want) {
			t.Errorf("extraction prompt lost %q", want)
		}
	}
}
