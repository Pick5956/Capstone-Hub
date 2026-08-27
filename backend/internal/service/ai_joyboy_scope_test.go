package service

import "testing"

// An answer produced with no tools cannot know a figure or that anything was
// changed; those get replaced. Honest chat and capability answers pass through.
func TestJoyboyScopedAnswer(t *testing.T) {
	unbacked := []string{
		"ยอดขายวันนี้ 12,500 บาทครับ",
		"เมนูขายดีขายไป 40 รายการครับ",
		"ปิดขายเมนูต้มยำกุ้งน้ำข้นแล้วครับ",
		"อัปเดตแล้วครับ",
		"ร้านมีโต๊ะว่าง 5 โต๊ะครับ",
	}
	for _, a := range unbacked {
		if got := joyboyScopedAnswer(a, 0); got != joyboyOutOfScopeAnswer {
			t.Errorf("unbacked answer %q should be replaced, got %q", a, got)
		}
	}

	kept := []string{
		"สวัสดีครับ ผมเป็นผู้ช่วยวิเคราะห์ร้าน",
		"ผมช่วยดูยอดขาย เมนู และคลังวัตถุดิบได้ครับ",
		"ผมดูข้อมูลย้อนหลังได้ 30 วันครับ",
	}
	for _, a := range kept {
		if got := joyboyScopedAnswer(a, 0); got != a {
			t.Errorf("honest answer %q should pass through, got %q", a, got)
		}
	}

	// With a tool behind it, figures are backed by a fact sheet — never replaced.
	withTool := "ยอดขายวันนี้ 12,500 บาทครับ"
	if got := joyboyScopedAnswer(withTool, 1); got != withTool {
		t.Errorf("tool-backed answer must pass through, got %q", got)
	}
}
