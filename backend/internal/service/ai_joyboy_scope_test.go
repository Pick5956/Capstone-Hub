package service

import "testing"

// An answer produced with no tools cannot have changed anything, so a claim that
// it did is replaced. Everything else passes through, including the ordinary
// answers that carry a number — a recipe in grams, advice in percent — which the
// old figure check used to turn into "I can't help with this".
func TestJoyboyScopedAnswer(t *testing.T) {
	replaced := []string{
		"ปิดขายเมนูต้มยำกุ้งน้ำข้นแล้วครับ",
		"อัปเดตแล้วครับ",
		"ปรับสต๊อกหมูสับให้แล้วครับ",
	}
	for _, a := range replaced {
		if got := joyboyScopedAnswer(a, 0); got != joyboyOutOfScopeAnswer {
			t.Errorf("a claim that something was done should be replaced: %q → %q", a, got)
		}
	}

	kept := []string{
		"สวัสดีครับ ผมเป็นผู้ช่วยวิเคราะห์ร้าน",
		"ผมช่วยดูยอดขาย เมนู และคลังวัตถุดิบได้ครับ",
		"ผมดูข้อมูลย้อนหลังได้ 30 วันครับ",
		// General knowledge that happens to carry a figure. Every one of these was
		// replaced by the apology before the figure check was demoted to a log.
		"ผัดกะเพราใช้หมูสับ 200 กรัม พริกขี้หนู 5 เม็ดครับ",
		"ถ้าอยากให้ยอดขายโตสัก 10% ลองเริ่มจากเมนูที่กำไรดีก่อนครับ",
		"เก็บผักชีในตู้เย็นได้ประมาณ 5 วันครับ",
		"ราคาหมูตลาดตอนนี้ผมไม่มีข้อมูลครับ แนะนำให้เช็คกับเจ้าประจำอีกที",
		// Recipe steps use the same verbs a claim does. The "แล้ว" here joins two
		// instructions to the reader; it is not a report about the database, and
		// blocking it turned "how do I cook this" into an apology.
		"ตั้งกระทะให้ร้อน เพิ่มน้ำมันแล้วใส่กระเทียมลงไปผัดจนหอมครับ",
		"ผัดหมูสับจนสุก ปรับไฟให้แรงแล้วใส่ใบกะเพราตอนท้ายครับ",
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
