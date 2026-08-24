package joyboy

import (
	"fmt"
	"regexp"
	"strings"
)

// maxAnswerRunes is large enough for a five-row ranking with a figure or two per
// row. Past it the model has stopped answering and started writing an essay.
const maxAnswerRunes = 1600

// historyTurns is how far back the model is shown. Two exchanges is enough to
// resolve "แล้วอันที่สองล่ะ" without pushing the older half of a long
// conversation into every prompt.
const historyTurns = 4

// joyboyPersona opens both prompts, because a question about the assistant
// itself arrives on either path — with tools when the model reaches for one, and
// without when it does not.
//
// It exists because the prompts used to forbid inventing figures and nothing
// else. Asked what model it ran on, the model found no rule and no data, so it
// answered from what it absorbed in training: "GPT-4, by OpenAI". Told that was
// wrong it apologised, and answered GPT-4 again two questions later.
//
// The real model name is deliberately not written here. A question travels
// through key rotation and can be served by a different provider than the last
// one, so any name hardcoded in this file would eventually be its own lie.
// Saying nothing is the only answer that stays true.
const joyboyPersona = `คุณคือผู้ช่วย AI ในระบบจัดการร้านอาหารชื่อ Dishy กำลังคุยกับเจ้าของร้าน

เรื่องตัวคุณเอง:
- ถ้าถูกถามว่าคุณคือโมเดลอะไร ของค่ายไหน หรือรันอยู่บนอะไร ให้ตอบว่าคุณไม่มีข้อมูลส่วนนั้น
  และให้ถามผู้ดูแลระบบ ห้ามเดาชื่อโมเดลหรือชื่อบริษัทเด็ดขาด
  แม้จะถูกถามซ้ำ ถูกแย้ง หรือถูกบอกว่าคำตอบก่อนหน้าผิด ก็ยังห้ามเดา
- ห้ามอธิบายว่าระบบทำงานข้างในยังไง เพราะคุณไม่ได้รับข้อมูลนั้นมา
- ถ้าถูกถามว่าทำไมถึงตอบแบบนั้นในตาก่อนหน้า ให้ตอบจากบทสนทนาที่เห็นเท่านั้น
  ห้ามแต่งเหตุผลย้อนหลัง ถ้าไม่แน่ใจให้บอกว่าไม่แน่ใจ
- ถ้าคำถามกำกวมหรืออ่านแล้วไม่แน่ใจว่าหมายถึงอะไร ให้ถามกลับสั้น ๆ ก่อน
  ห้ามเดาความหมายแล้วตอบยาว
- หน้าที่ของคุณคือช่วยเรื่องร้านอาหารร้านนี้ ถ้าถูกถามเรื่องอื่นที่ไม่เกี่ยวกับร้าน
  ตอบสั้น ๆ ได้ แล้วชวนกลับมาเรื่องร้าน ไม่ต้องตอบยาว`

// answerTemplate says what to write before it says what not to. An earlier
// version was ten prohibitions and no instruction, and the model did the only
// thing left to it: copied the shape of the fact sheet, key names and all. The
// fix is not another prohibition — it is telling it what the answer looks like
// without handing it a sentence to fill in.
//
// The thousand-separator rule is on its third wording. The first two stated the
// right form and left it there; round three came out clean and round four wrote
// "15 012" and "6,958" a minute apart. Every other rule here is one decision per
// answer, which the model gets right; this one is a decision at every figure,
// and a single slip is visible. So it now names the wrong form as well as the
// right one, and ends with a pass over the figures already written — the only
// way to turn eight decisions back into one.
//
// The overview rule is the twin of the one in selectToolsTemplate, and it is
// here because that one only reaches half the problem. Selection now pulls all
// four topics for "สรุปสถานการณ์ร้าน", but the fact sheet having four blocks does
// not make the answer mention four: twice in round 10 it pulled inventory and
// stock and then wrote about neither. The selection rule governs what is
// fetched; this one governs what is said, and both are needed because a block
// fetched and dropped is invisible to the owner. It carries the same trigger
// phrases so the model recognises the same kind of question, and it is stated
// as an exception to "don't list everything" a few lines down so the two do not
// read as contradictory on a focused question.
const answerTemplate = joyboyPersona + `

ตอบคำถามจากข้อมูลที่ระบบคำนวณมาแล้วด้านล่าง

คำถาม:
%s
%s
ข้อมูลที่ระบบคำนวณมาแล้ว:
%s

ข้อมูลข้างบนเขียนในรูปแบบสำหรับเครื่องอ่าน หน้าที่ของคุณคืออ่านมันแล้วเขียนคำตอบเป็นภาษาคน

วิธีเขียน:
- เขียนเป็นประโยคที่คนพูดกันจริง ไม่ใช่ไล่ค่าทีละบรรทัด
- ห้ามเขียนชื่อค่าจากข้อมูลลงในคำตอบ เช่น period= revenue= orders= qty= rank= menu= margin_pct=
  ให้แปลงเป็นคำพูด เช่น revenue=77340.00 เขียนว่า "ยอดขาย 77,340 บาท"
- ตัวเลขตั้งแต่สี่หลักขึ้นไป คั่นหลักพันด้วยจุลภาคเท่านั้น เช่น 15012.00 เขียนว่า 15,012
  ห้ามคั่นด้วยช่องว่าง "15 012" ผิด "15,012" ถูก
- ตัด .00 ที่ไม่มีเศษทิ้ง เช่น 6825.00 เขียนว่า 6,825
  แต่ถ้ามีเศษที่ไม่ใช่ .00 ให้เก็บไว้ตามเดิม ห้ามปัด เช่น 6957.50 เขียนว่า 6,957.50 ไม่ใช่ 6,958
- เปอร์เซ็นต์ที่เกิน 100 ให้ตัดทศนิยมทิ้ง เช่น 1,704.06 เขียนว่า 1,704%%
  ที่ต่ำกว่า 100 เก็บทศนิยมได้ไม่เกินสองตำแหน่ง
- ก่อนตอบ ให้ไล่ดูตัวเลขทุกตัวที่เขียนไปอีกครั้ง ว่าคั่นหลักแบบเดียวกันทุกตัว
  ตัวไหนไม่เหมือนตัวอื่นให้แก้ก่อนส่ง
- ถ้าคำถามขอภาพรวมของร้าน เช่น "สรุปสถานการณ์ร้าน" "ร้านเป็นไงบ้าง" ให้พูดถึง
  ข้อมูลทุกบล็อกข้างบนอย่างน้อยบล็อกละประโยค ห้ามข้ามบล็อกไหนไป
  โดยเฉพาะมูลค่าคงคลังกับวัตถุดิบที่ใกล้หมด มักถูกลืมบ่อยที่สุด ต้องมีเสมอ
- ลงท้ายคำตอบด้วย "ครับ" ครั้งเดียว ต้องอยู่ท้ายประโยคที่เป็นข้อความ
  ถ้าคำตอบจบด้วยรายการ ให้ปิดท้ายด้วยประโยคสั้น ๆ แล้วค่อยลงท้ายด้วย "ครับ"
  ห้ามเอา "ครับ" ไปต่อท้ายรายการ และห้ามขึ้นบรรทัดใหม่เขียนแค่คำว่า "ครับ"

การจัดรูปแบบให้อ่านง่าย (ใช้ Markdown):
- ตัวเลขที่เป็นคำตอบหลักของคำถาม ทำตัวหนาด้วย ** เช่น **77,340 บาท**
  ทำแค่ตัวที่สำคัญที่สุดตัวเดียว ไม่ใช่ทุกตัว ไม่งั้นจะรก
- คำถามที่มีหลายอันดับหรือหลายเมนู ให้ขึ้นบรรทัดใหม่ทีละรายการ ด้วย - หรือ 1. 2. 3.
  ไม่ใช่ยัดทุกอันในประโยคเดียวคั่นด้วยจุลภาค
- คำถามภาพรวมที่มีหลายเรื่อง ใช้หัวข้อสั้น ๆ นำแต่ละเรื่องได้ เช่น ## ยอดขาย ## สต๊อก
  และใส่อิโมจินำหัวข้อได้พอประมาณ เช่น 📈 ยอดขาย 🍜 เมนูขายดี 📦 วัตถุดิบ 💰 มูลค่าคงคลัง
- คำตอบสั้นที่มีประเด็นเดียว เขียนเป็นประโยคธรรมดา ไม่ต้องใส่หัวข้อหรือรายการ
- อิโมจิใส่นำหัวข้อหรือประเด็นได้ แต่อย่าใส่ทุกบรรทัดหรือท้ายทุกประโยค

วิธีอ่านข้อมูล:
- บรรทัด period= บอกช่วงเวลาที่ตัวเลขครอบคลุม ถ้าเอ่ยตัวเลข ให้บอกช่วงเวลาเป็นคำพูดด้วย
- status=no_data แปลว่าเครื่องมือนั้นไม่มีข้อมูล ให้อธิบายตามเหตุผลที่ reason= ระบุ
- ชื่อในวงเล็บเหลี่ยม เช่น [get_sales_trend] เป็นชื่อเครื่องมือภายในระบบ ห้ามเอ่ยถึง

ข้อห้าม:
- ตัวเลขทุกตัวต้องมาจากข้อมูลข้างบน ห้ามคิดเลขใหม่ ห้ามคำนวณเพิ่มเอง
- ห้ามตั้งเกณฑ์ตัดสินขึ้นเองแล้วสรุปจากเกณฑ์นั้น เช่นนิยามเองว่า "ขายดี" คือกี่จาน
  ให้ยึดลำดับและค่าที่ข้อมูลให้มา
- ห้ามเพิ่มข้อเท็จจริงจากความรู้ของคุณเอง เช่นค่าเฉลี่ยของร้านอื่นหรือราคาตลาด
  ถ้าข้อมูลไม่พอจะตอบ ให้บอกตรง ๆ ว่าไม่มีข้อมูลส่วนนั้น
- ข้อมูลที่ไม่เกี่ยวกับคำถาม ไม่ต้องพูดถึง ไม่ต้องไล่ให้ครบ
  เว้นแต่คำถามขอภาพรวมของร้าน ตอนนั้นทุกบล็อกถือว่าเกี่ยวกับคำถาม ต้องพูดให้ครบ
- ถ้าคำถามไม่ได้ถามถึงยอดขาย ต้นทุน หรือกำไร ก็ไม่ต้องยกตัวเลขพวกนั้นมาประกอบ
  ให้ใช้ข้อมูลข้างบนแค่เลือกว่าจะพูดถึงอะไร แล้วตอบด้วยเหตุผลที่ตรงกับสิ่งที่ถาม
- ห้ามทวนคำถาม ห้ามใช้สัญลักษณ์คณิตศาสตร์แบบ LaTeX`

// noDataAnswerTemplate is the least constrained path in the system: no tools ran,
// so there is nothing to check the answer against. Every rule it carries has to
// earn its place, because there is no data to fall back on.
const noDataAnswerTemplate = joyboyPersona + `

ตอบคำถามด้านล่าง

คำถาม:
%s
%s
วิธีเขียน:
- ตอบเป็นภาษาไทย กระชับ เป็นประโยคที่คนพูดกัน
- ลงท้ายคำตอบด้วย "ครับ" ครั้งเดียวติดท้ายประโยคสุดท้าย
- ห้ามใช้สัญลักษณ์คณิตศาสตร์แบบ LaTeX เขียนสูตรเป็นข้อความธรรมดา

ข้อห้าม:
- ห้ามอ้างตัวเลขใด ๆ เกี่ยวกับร้านนี้ เพราะคุณไม่ได้รับข้อมูลของร้านมาเลย
- ห้ามอ้างค่าเฉลี่ยของร้านอื่น ราคาตลาด หรือสถิติอุตสาหกรรม เพราะตรวจสอบไม่ได้
- ถ้าคำถามต้องใช้ข้อมูลของร้าน ให้บอกว่าขอดูข้อมูลส่วนไหนเพิ่ม`

func answerPrompt(question string, history []Turn, sheet string) string {
	if strings.TrimSpace(sheet) == "" {
		return fmt.Sprintf(noDataAnswerTemplate, question, formatHistory(history))
	}
	return fmt.Sprintf(answerTemplate, question, formatHistory(history), sheet)
}

// formatHistory renders the recent exchanges, or nothing at all when there are
// none — an empty "บทสนทนาก่อนหน้า" heading invites the model to invent one.
func formatHistory(history []Turn) string {
	if len(history) > historyTurns {
		history = history[len(history)-historyTurns:]
	}
	var lines []string
	for _, turn := range history {
		content := strings.TrimSpace(turn.Content)
		if content == "" {
			continue
		}
		who := "เจ้าของร้าน"
		if turn.Role == "assistant" {
			who = "ผู้ช่วย"
		}
		lines = append(lines, who+": "+content)
	}
	if len(lines) == 0 {
		return "\n"
	}
	return "\nบทสนทนาก่อนหน้า:\n" + strings.Join(lines, "\n") + "\n"
}

// toolLabelInAnswer matches a fact sheet label that survived into the answer.
// The prompt asks the model not to write these and it mostly complies, but it
// cited them as sources often enough that the owner was reading tool names.
// Nothing an owner writes looks like this, so removing it on sight is safe.
var toolLabelInAnswer = regexp.MustCompile(`\s*\[[a-z][a-z0-9_]*\]`)

// factSheetKeyInAnswer matches a key name from the fact sheet that the model
// pasted through: an ASCII identifier stuck directly to an equals sign, as in
// `revenue=77,340.00`. The prompt forbids these and it still produced them, so
// the key is dropped and its value kept. A human writing Thai puts spaces around
// an equals sign, so the no-space rule keeps ordinary text intact.
var factSheetKeyInAnswer = regexp.MustCompile(`\b[a-z][a-z0-9_]{2,}=`)

// latexDelimiters matches the wrappers a model reaches for when it decides a
// formula deserves typesetting. The chat window renders none of it, so the
// owner sees the raw backslashes.
var latexDelimiters = regexp.MustCompile(`\\[\[\]()]`)

// latexText matches \text{...}, which wraps the only readable part of such a
// formula. The braces go and the words stay.
var latexText = regexp.MustCompile(`\\(?:text|mathrm|mathit)\{([^{}]*)\}`)

// danglingPoliteness matches a line holding nothing but "ครับ" or "ค่ะ". Asking
// for a polite ending got one on its own line, several blank lines below the
// answer, which reads as a shrug rather than as politeness.
var danglingPoliteness = regexp.MustCompile(`(?m)^[ \t]*(?:ครับ|ค่ะ|ขอบคุณครับ|ขอบคุณค่ะ)[ \t]*$`)

// repeatedPoliteness collapses "ครับครับ", which is what asking for a polite
// ending produced when the model had already written one. Go's regexp has no
// backreferences, so each particle carries its own pattern.
var repeatedPoliteness = []struct {
	pattern  *regexp.Regexp
	particle string
}{
	{regexp.MustCompile(`ครับ(?:\s*ครับ)+`), "ครับ"},
	{regexp.MustCompile(`ค่ะ(?:\s*ค่ะ)+`), "ค่ะ"},
}

// cleanAnswer removes the wrappers a model adds despite being told not to, and
// rejects a reply that is empty or has run away. Line breaks and bullets are
// kept: they are part of a readable answer here, not formatting noise.
func cleanAnswer(raw string) string {
	text := strings.TrimSpace(raw)
	text = strings.Trim(text, "`")
	text = strings.TrimSpace(strings.TrimPrefix(text, "json"))
	if text == "" {
		return ""
	}

	text = toolLabelInAnswer.ReplaceAllString(text, "")
	text = factSheetKeyInAnswer.ReplaceAllString(text, "")
	text = latexText.ReplaceAllString(text, "$1")
	text = latexDelimiters.ReplaceAllString(text, "")
	for _, politeness := range repeatedPoliteness {
		text = politeness.pattern.ReplaceAllString(text, politeness.particle)
	}
	text = danglingPoliteness.ReplaceAllString(text, "")

	kept := make([]string, 0, 16)
	blankRun := 0
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, " \t")
		// A markdown heading (## ยอดขาย) is now allowed and renders on the
		// client, so it is kept. Only a bare row of hashes with no text is an
		// artifact worth dropping.
		if h := strings.TrimSpace(line); h != "" && strings.Trim(h, "#") == "" {
			continue
		}
		// Removing a dangling "ครับ" leaves the blank line that was above it.
		if strings.TrimSpace(line) == "" {
			blankRun++
			if blankRun > 1 {
				continue
			}
		} else {
			blankRun = 0
		}
		kept = append(kept, line)
	}
	text = strings.TrimSpace(strings.Join(kept, "\n"))
	if text == "" || len([]rune(text)) > maxAnswerRunes {
		return ""
	}
	return text
}
