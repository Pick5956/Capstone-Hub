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
// road that produced this sentence. That one used to be replaced.
//
// It no longer is, and the reason is worth keeping. The rule the model was given
// asked it to judge: "do not say you did something, because nothing happened this
// round" — which requires knowing what happened this round, and the model cannot
// know that. It sees a prompt and a fact sheet. So Go read the Thai and threw the
// answer away when the judgement went wrong, which is how a recipe step ("เพิ่ม
// น้ำมันแล้วใส่กระเทียม") once became "I can't help with this".
//
// The rule is now unconditional instead: never state the outcome of a write, in
// any situation, because the confirmation card announces it. That is checkable
// without judgement — and it costs the owner nothing, because the card was always
// the thing that actually said "บันทึกลงระบบแล้ว", in green, with an icon and a
// countdown. The sentence was never carrying that information.
//
// What stays here is a tripwire. Nothing is replaced or edited; a claim that slips
// through is logged so the decision can be revisited from evidence rather than
// from either of us guessing.
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

// The verbs that name something this system can actually do. On their own they
// prove nothing — a recipe uses half of them.
const joyboyChangeVerbs = `(?:ปิดขาย|เปิดขาย|ปิดสถานะ|เปิดสถานะ|บันทึก|อัปเดต|อัพเดต|แก้ไข|ปรับ|เพิ่ม|ลบ|สร้าง|ตั้งค่า|ย้าย|จอง|ยกเลิก|ดำเนินการ)`

// joyboyClaimDone matches a claim that one of those was carried out. What makes
// it a claim rather than an instruction is where the "แล้ว" sits: at the end of
// what is being said ("ปรับสต๊อกหมูสับให้แล้วครับ"), not in the middle of the
// next step.
//
// The first version matched "<verb> … แล้ว" anywhere, and a recipe was the thing
// that exposed it: "เพิ่มพริก 5 เม็ดแล้วผัดต่อ" is an instruction to the reader,
// not a claim about the database, and the owner asking for a recipe got
// "ขอโทษครับ เรื่องนี้ผมยังช่วยไม่ได้ครับ" instead of an answer.
var (
	// "…แล้ว" closing a line, with or without the polite particle.
	joyboyClaimDoneAtEnd = regexp.MustCompile(`(?m)` + joyboyChangeVerbs + `[^\n]{0,40}แล้ว(?:ครับ|ค่ะ|นะครับ|นะคะ)?[ \t]*$`)
	// "…แล้วครับ" mid-line, where the particle marks the end of the claim even
	// though the sentence continues.
	joyboyClaimDonePolite = regexp.MustCompile(joyboyChangeVerbs + `[^\n]{0,40}แล้ว(?:ครับ|ค่ะ|นะครับ|นะคะ)`)
)

func joyboyClaimsSomethingWasDone(text string) bool {
	return joyboyClaimDoneAtEnd.MatchString(text) || joyboyClaimDonePolite.MatchString(text)
}

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
	if joyboyClaimsSomethingWasDone(text) {
		aiStage("warn", "joyboy: answer claims a change was applied with no tool behind it — the persona rule was not followed")
	}
	if joyboyMoneyFigure.MatchString(text) {
		aiStage("warn", "joyboy: answer states a baht figure with no tool behind it — check for invention")
	}
	return answer
}
