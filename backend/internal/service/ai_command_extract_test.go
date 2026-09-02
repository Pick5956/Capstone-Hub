package service

import (
	"strings"
	"testing"
)

// The bug this guard exists for: a request for a summary came back as the
// prompt's own examples, presented as twenty-one things the owner had ordered.
func TestInventedNamesAreDropped(t *testing.T) {
	question := "สรุปสิ่งที่ผมสั่งไว้ทั้งหมดให้หน่อย"
	drafts := []AIStockCommandDraft{
		{Name: "ค่าไฟ", Kind: "expense", Quantity: 3200},
		{Name: "ผักชี", Kind: "in", Quantity: 2, Unit: "กก."},
		{Name: "ซุปเห็ดครีม", Kind: "menu_off"},
	}
	if kept := keepDraftsTheOwnerNamed(drafts, question, nil); len(kept) != 0 {
		t.Fatalf("nothing in that sentence names anything, got %+v", kept)
	}
}

func TestNamesTheOwnerActuallySaidSurvive(t *testing.T) {
	kept := keepDraftsTheOwnerNamed(
		[]AIStockCommandDraft{
			{Name: "หมูสามชั้น", Kind: "in", Quantity: 3000, Unit: "กก."},
			// The prompt asks for an empty name when the target is unclear, so the
			// assistant can ask rather than guess. Dropping it would turn a question
			// back to the owner into silence.
			{Name: "", Kind: "in", Note: "ของอีกตัวที่หมดเมื่อวาน"},
		},
		"เพิ่ม หมูสามชั้น 3000 กก เข้าคลัง แล้วก็เติมของอีกตัวที่หมดเมื่อวานด้วย", nil)
	if len(kept) != 2 {
		t.Fatalf("both drafts should survive, got %+v", kept)
	}
}

// A name the assistant proposed and the owner accepted is not an invention: it
// came from the conversation, which is exactly the case the prompt allows.
func TestNamesFromTheConversationSurvive(t *testing.T) {
	history := []AIConversationMessage{
		{Role: "assistant", Content: `ยังไม่มี "หมูสามชั้น" ในคลังครับ ให้ผมเพิ่มเข้าคลังให้ไหม`},
	}
	kept := keepDraftsTheOwnerNamed(
		[]AIStockCommandDraft{{Name: "หมูสามชั้น", Kind: "create", Quantity: 500, Unit: "กก."}},
		"เพิ่มเลย 500 กก.", history)
	if len(kept) != 1 {
		t.Fatalf("a name carried over from the conversation must survive, got %+v", kept)
	}
}

// The confirmation card read 'เพิ่มรายจ่าย "บันทึกค่าไฟ"' — the verb the owner
// used to give the order had become part of the thing being recorded.
func TestExtractionPromptForbidsVerbsInsideNames(t *testing.T) {
	for _, rule := range []string{
		"ห้ามเอาคำกริยามาไว้ในชื่อ",
		`"บันทึกค่าไฟ 3200" → name="ค่าไฟ"`,
	} {
		if !strings.Contains(aiStockExtractionPrompt, rule) {
			t.Errorf("the extraction prompt no longer says: %s", rule)
		}
	}
}

// A negative number has to survive the parser to reach the code that knows why
// it is wrong.
//
// It used to be flattened to zero here, which erased the difference between "the
// owner said something impossible" and "the owner said nothing". The resolver
// then asked the bare "ตั้งราคาเท่าไหร่ครับ", and on the turns where no tool ran
// the answer round filled the silence with "ผู้ช่วยทำให้ไม่ได้ครับ ต้องไปทำใน
// ระบบเองครับ" — telling the owner that menu prices cannot be changed through
// the assistant, which is one of the nine things it can do.
func TestNegativeQuantitiesSurviveParsing(t *testing.T) {
	drafts, err := ParseStockCommandDrafts(
		`[{"name":"ข้าวกะเพรา","kind":"menu_price","quantity":-50,"unit":""}]`)
	if err != nil || len(drafts) != 1 {
		t.Fatalf("parse = %+v err=%v", drafts, err)
	}
	if drafts[0].Quantity != -50 {
		t.Errorf("the number the owner said was changed to %v — the resolver can no longer explain it", drafts[0].Quantity)
	}
}

// "ตั้งราคาแกงเขียวหวานไก่ 139 ดีมั้ย" asks whether to change a price. Read as a
// menu_price command it becomes a confirmation card: the owner asked for an
// opinion and was handed the button that makes the change.
func TestExtractionPromptLeavesSuppositionsAlone(t *testing.T) {
	for _, rule := range []string{
		"ประโยคสมมติ",
		"ดีมั้ย",
		"คุ้มมั้ย",
		`"ตั้งราคาเมนูY 139 ดีมั้ย"`,
		"ไม่ได้ถามผล",
	} {
		if !strings.Contains(aiStockExtractionPrompt, rule) {
			t.Errorf("the extraction prompt no longer says: %s", rule)
		}
	}
}
