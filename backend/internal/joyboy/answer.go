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

const answerTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร ตอบคำถามจากข้อมูลที่ระบบคำนวณมาแล้วด้านล่าง

คำถาม:
%s
%s
ข้อมูลที่ระบบคำนวณมาแล้ว (หนึ่งบรรทัดต่อหนึ่งรายการ เขียนเป็น ชื่อค่า=ค่า):
%s

กฎ:
- ตัวเลขทุกตัวต้องคัดลอกจากข้อมูลข้างบนเท่านั้น ห้ามสร้างใหม่ ห้ามคำนวณเพิ่ม
- ห้ามตั้งเกณฑ์ตัดสินขึ้นเองแล้วสรุปจากเกณฑ์นั้น เช่น "ขายดี" หรือ "กำไรน้อย"
  ให้ยึดลำดับและค่าที่ข้อมูลข้างบนให้มา ไม่ใช่เส้นแบ่งที่คุณคิดขึ้น
- ห้ามเพิ่มข้อเท็จจริงจากความรู้ของคุณเอง เช่นค่าเฉลี่ยของร้านอื่นหรือราคาตลาด
  ถ้าข้อมูลข้างบนไม่พอจะตอบ ให้บอกตรง ๆ ว่าไม่มีข้อมูลส่วนนั้น
- บรรทัด period= บอกช่วงเวลาที่ตัวเลขในบล็อกนั้นครอบคลุม ถ้าเอ่ยตัวเลข ให้บอกช่วงเวลาด้วย
- status=no_data แปลว่าเครื่องมือนั้นไม่มีข้อมูล ให้อธิบายตามเหตุผลที่ reason= ระบุไว้
- ชื่อในวงเล็บเหลี่ยม เช่น [get_sales_trend] เป็นชื่อเครื่องมือภายในระบบ
  ห้ามเอ่ยถึงหรือเขียนลงในคำตอบ
- ตัวเลขในข้อมูลเป็นเลขดิบ ให้จัดรูปแบบให้คนอ่านง่ายเอง และใช้รูปแบบเดียวกันทั้งคำตอบ
- ข้อมูลที่ไม่เกี่ยวกับคำถาม ไม่ต้องพูดถึง ไม่ต้องไล่ให้ครบ
- ตอบเป็นภาษาไทย กระชับ ลงท้ายสุภาพด้วย "ครับ" ไม่ต้องทวนคำถาม ไม่ต้องใส่หัวข้อ
- ห้ามใช้สัญลักษณ์คณิตศาสตร์แบบ LaTeX เขียนสูตรเป็นข้อความธรรมดา`

const noDataAnswerTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร ตอบคำถามด้านล่าง

คำถาม:
%s
%s
กฎ:
- คำถามนี้ไม่ต้องใช้ข้อมูลของร้าน ตอบจากความเข้าใจทั่วไปได้
- ห้ามอ้างตัวเลขใด ๆ เกี่ยวกับร้านนี้ เพราะคุณไม่ได้รับข้อมูลของร้านมาเลย
- ห้ามอ้างค่าเฉลี่ยของร้านอื่น ราคาตลาด หรือสถิติอุตสาหกรรม เพราะตรวจสอบไม่ได้
- ถ้าคำถามต้องใช้ข้อมูลของร้าน ให้บอกว่าขอดูข้อมูลส่วนไหนเพิ่ม
- ตอบเป็นภาษาไทย กระชับ ลงท้ายสุภาพด้วย "ครับ"
- ห้ามใช้สัญลักษณ์คณิตศาสตร์แบบ LaTeX เขียนสูตรเป็นข้อความธรรมดา`

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

// latexDelimiters matches the wrappers a model reaches for when it decides a
// formula deserves typesetting. The chat window renders none of it, so the
// owner sees the raw backslashes.
var latexDelimiters = regexp.MustCompile(`\\[\[\]()]`)

// latexText matches \text{...}, which wraps the only readable part of such a
// formula. The braces go and the words stay.
var latexText = regexp.MustCompile(`\\(?:text|mathrm|mathit)\{([^{}]*)\}`)

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
	text = latexText.ReplaceAllString(text, "$1")
	text = latexDelimiters.ReplaceAllString(text, "")

	kept := make([]string, 0, 16)
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		kept = append(kept, strings.TrimRight(line, " \t"))
	}
	text = strings.TrimSpace(strings.Join(kept, "\n"))
	if text == "" || len([]rune(text)) > maxAnswerRunes {
		return ""
	}
	return text
}
