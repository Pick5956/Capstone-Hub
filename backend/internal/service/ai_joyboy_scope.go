package service

import (
	"regexp"
	"strings"
)

// Capability boundary for joyboy.
//
// When no tool ran there is no fact sheet behind the answer, so anything it
// states about this shop came from nowhere. Two shapes can appear, and they are
// not equally dangerous — which is why they are no longer treated the same way.
//
// A claim that something was DONE is always false here: joyboy's write path
// short-circuits long before this point, so no change can have happened on the
// road that produced this sentence. That one is replaced.
//
// A figure used to be replaced too, on the theory that a number with no tool
// behind it must be invented. That caught real inventions, and it also caught
// every honest answer that happened to contain a number: a recipe measured in
// grams, advice about growing sales by a percentage, a cooking time. The owner
// asked a general question and got "I can't help with this" — the assistant
// looked broken over a unit of measure. So the figure check now only reports;
// the prompt is what tells the model not to invent shop numbers, and the log is
// how we find out if it ever does.

const joyboyOutOfScopeAnswer = "ขอโทษครับ เรื่องนี้ผมยังช่วยไม่ได้ครับ"

// joyboyClaimDone matches "<change verb> ... แล้ว" — the shape of a claim that
// something was written ("ปิดขายเมนูต้มยำกุ้งแล้วครับ"). A bare "แล้ว" is left
// alone because honest sentences use it too ("ข้อมูลถึงเมื่อวานแล้ว").
var joyboyClaimDone = regexp.MustCompile(`(ปิดขาย|เปิดขาย|ปิดสถานะ|เปิดสถานะ|บันทึก|อัปเดต|อัพเดต|แก้ไข|ปรับ|เพิ่ม|ลบ|สร้าง|ตั้งค่า|ย้าย|จอง|ยกเลิก|ดำเนินการ)[^
]{0,40}แล้ว`)

// joyboyMoneyFigure matches a baht amount, the shape a made-up shop figure takes
// most often. It no longer blocks anything — it is the tripwire that tells us
// whether an untooled answer ever states money as fact, so the decision to stop
// blocking can be revisited with evidence instead of a guess.
var joyboyMoneyFigure = regexp.MustCompile(`[\d][\d,\.]*\s*บาท`)

// joyboyScopedAnswer returns the answer to send. The model's own text goes out
// unless it claims a change was made with no tool behind it, which cannot be
// true.
func joyboyScopedAnswer(answer string, toolCount int) string {
	text := strings.TrimSpace(answer)
	if text == "" || toolCount > 0 {
		return answer
	}
	if joyboyClaimDone.MatchString(text) {
		return joyboyOutOfScopeAnswer
	}
	if joyboyMoneyFigure.MatchString(text) {
		aiStage("warn", "joyboy: answer states a baht figure with no tool behind it — check for invention")
	}
	return answer
}
