package service

import "testing"

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
