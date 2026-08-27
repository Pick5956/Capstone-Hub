package service

import (
	"regexp"
	"strings"
)

// Capability boundary for joyboy.
//
// When no tool ran there is no fact sheet behind the answer, so any figure in it
// was invented and any claim that something was done is false — joyboy's only
// write path short-circuits before this point. Rather than let a confident-
// sounding guess reach the owner, the answer is replaced with a plain "I can't
// help with this yet". This is deterministic: it inspects the produced text, not
// the model's intent.

const joyboyOutOfScopeAnswer = "ขอโทษครับ เรื่องนี้ผมยังช่วยไม่ได้ครับ"

// joyboyClaimDone matches "<change verb> ... แล้ว" — the shape of a claim that
// something was written ("ปิดขายเมนูต้มยำกุ้งแล้วครับ"). A bare "แล้ว" is left
// alone because honest sentences use it too ("ข้อมูลถึงเมื่อวานแล้ว").
var joyboyClaimDone = regexp.MustCompile(`(ปิดขาย|เปิดขาย|ปิดสถานะ|เปิดสถานะ|บันทึก|อัปเดต|อัพเดต|แก้ไข|ปรับ|เพิ่ม|ลบ|สร้าง|ตั้งค่า|ย้าย|จอง|ยกเลิก|ดำเนินการ)[^
]{0,40}แล้ว`)

// joyboyAmountFigure matches a number carrying a unit of measure — the shape an
// invented data point takes. Units like "วัน" and "คน" are left out on purpose:
// they appear in honest capability sentences ("ผมดูย้อนหลังได้ 30 วัน").
var joyboyAmountFigure = regexp.MustCompile(`[\d][\d,\.]*\s*(บาท|%|เปอร์เซ็นต์|รายการ|จาน|ชิ้น|กรัม|กิโลกรัม|กก\.|กิโล|ออเดอร์|บิล|ที่นั่ง|โต๊ะ)`)

// joyboyAnswerIsUnbacked reports whether an answer produced with no tools states
// something it cannot possibly know: a measured figure, or that a change was
// made.
func joyboyAnswerIsUnbacked(answer string) bool {
	text := strings.TrimSpace(answer)
	if text == "" {
		return false
	}
	if joyboyAmountFigure.MatchString(text) {
		return true
	}
	if joyboyClaimDone.MatchString(text) {
		return true
	}
	return false
}

// joyboyScopedAnswer returns the answer to send: the model's own text when it is
// backed by tools or says nothing it cannot know, otherwise the apology.
func joyboyScopedAnswer(answer string, toolCount int) string {
	if toolCount > 0 {
		return answer
	}
	if joyboyAnswerIsUnbacked(answer) {
		return joyboyOutOfScopeAnswer
	}
	return answer
}
