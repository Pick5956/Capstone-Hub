package service

import "testing"

// Nothing the model writes is replaced any more.
//
// The rule it is given is now unconditional — never state the outcome of a write,
// because the confirmation card announces it — so there is no judgement left for
// Go to second-guess. The detector below still has to be accurate, because a
// claim that slips through is logged and that log is the evidence for whether
// this guard should exist at all.
func TestJoyboyScopedAnswerNeverReplaces(t *testing.T) {
	// Every one of these once became "ขอโทษครับ เรื่องนี้ผมยังช่วยไม่ได้ครับ".
	// Three are false claims and three are ordinary sentences; the point is that
	// the owner now receives all six exactly as written.
	for _, answer := range []string{
		"ปิดขายเมนูต้มยำกุ้งน้ำข้นแล้วครับ",
		"อัปเดตแล้วครับ",
		"ปรับสต๊อกหมูสับให้แล้วครับ",
		"ตั้งกระทะให้ร้อน เพิ่มน้ำมันแล้วใส่กระเทียมลงไปผัดจนหอมครับ",
		"ผัดหมูสับจนสุก ปรับไฟให้แรงแล้วใส่ใบกะเพราตอนท้ายครับ",
		"ผัดกะเพราใช้หมูสับ 200 กรัม พริกขี้หนู 5 เม็ดครับ",
	} {
		if got := joyboyScopedAnswer(answer, 0); got != answer {
			t.Errorf("the answer must go out as written: %q → %q", answer, got)
		}
	}

	withTool := "ยอดขายวันนี้ 12,500 บาทครับ"
	if got := joyboyScopedAnswer(withTool, 1); got != withTool {
		t.Errorf("tool-backed answer must pass through, got %q", got)
	}
}

// The detector is now a measuring instrument rather than a gate, which raises
// the bar on it rather than lowering it: a log that fires on recipes would tell
// us the model is breaking a rule it is actually keeping.
func TestJoyboyClaimDetectorStillDiscriminates(t *testing.T) {
	claims := []string{
		"ปิดขายเมนูต้มยำกุ้งน้ำข้นแล้วครับ",
		"อัปเดตแล้วครับ",
		"ปรับสต๊อกหมูสับให้แล้วครับ",
	}
	for _, answer := range claims {
		if !joyboyClaimsSomethingWasDone(answer) {
			t.Errorf("this states a completed change and should be logged: %q", answer)
		}
	}

	// Recipe steps use the same verbs. The "แล้ว" joins two instructions to the
	// reader; it is not a report about the database.
	notClaims := []string{
		"สวัสดีครับ ผมเป็นผู้ช่วยวิเคราะห์ร้าน",
		"ผมช่วยดูยอดขาย เมนู และคลังวัตถุดิบได้ครับ",
		"ผมดูข้อมูลย้อนหลังได้ 30 วันครับ",
		"ผัดกะเพราใช้หมูสับ 200 กรัม พริกขี้หนู 5 เม็ดครับ",
		"ถ้าอยากให้ยอดขายโตสัก 10% ลองเริ่มจากเมนูที่กำไรดีก่อนครับ",
		"เก็บผักชีในตู้เย็นได้ประมาณ 5 วันครับ",
		"ราคาหมูตลาดตอนนี้ผมไม่มีข้อมูลครับ แนะนำให้เช็คกับเจ้าประจำอีกที",
		"ตั้งกระทะให้ร้อน เพิ่มน้ำมันแล้วใส่กระเทียมลงไปผัดจนหอมครับ",
		"ผัดหมูสับจนสุก ปรับไฟให้แรงแล้วใส่ใบกะเพราตอนท้ายครับ",
	}
	for _, answer := range notClaims {
		if joyboyClaimsSomethingWasDone(answer) {
			t.Errorf("this is not a claim about the database and must not be logged: %q", answer)
		}
	}
}
