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

// answerTemplate says what to write before it says what not to. An earlier
// version was ten prohibitions and no instruction, and the model did the only
// thing left to it: copied the shape of the fact sheet, key names and all. The
// fix is not another prohibition — it is telling it what the answer looks like
// without handing it a sentence to fill in.
const answerTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร ตอบคำถามจากข้อมูลที่ระบบคำนวณมาแล้วด้านล่าง

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
- เขียนตัวเลขให้อ่านง่าย คั่นหลักพันด้วยจุลภาค ตัด .00 ที่ไม่มีเศษทิ้ง
  และใช้รูปแบบเดียวกันทุกตัวเลขในคำตอบ
- มีหลายรายการที่ต้องเทียบกัน ใช้รายการสั้น ๆ ได้ · มีรายการเดียว เขียนเป็นประโยค
- ลงท้ายคำตอบด้วย "ครับ" ครั้งเดียวติดท้ายประโยคสุดท้าย
  ห้ามขึ้นบรรทัดใหม่แล้วเขียนแค่คำว่า "ครับ"

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
- ห้ามทวนคำถาม ห้ามใส่หัวข้อ ห้ามใช้สัญลักษณ์คณิตศาสตร์แบบ LaTeX`

const noDataAnswerTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร ตอบคำถามด้านล่าง

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
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
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
