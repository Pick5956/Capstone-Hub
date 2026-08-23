package joyboy

import (
	"fmt"
	"strings"
)

// maxAnswerRunes is large enough for a five-row ranking with a figure or two per
// row. Past it the model has stopped answering and started writing an essay.
const maxAnswerRunes = 1600

// historyTurns is how far back the model is shown. Two exchanges is enough to
// resolve "แล้วอันที่สองล่ะ" without pushing the older half of a long
// conversation into every prompt.
const historyTurns = 4

const selectToolsTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร กำลังจะตอบคำถามด้านล่าง

คำถาม:
%s
%s
เลือกเครื่องมือที่ต้องใช้เพื่อตอบคำถามนี้ เรียกได้หลายตัวพร้อมกัน
ถ้าคำถามไม่ต้องใช้ข้อมูลของร้านเลย เช่นทักทายหรือถามความหมายของศัพท์ ก็ไม่ต้องเรียกเครื่องมือ`

const answerTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร ตอบคำถามจากข้อมูลที่ระบบคำนวณมาแล้วด้านล่าง

คำถาม:
%s
%s
ข้อมูลที่ระบบคำนวณมาแล้ว:
%s

กฎ:
- ตัวเลขทุกตัวต้องคัดลอกจากข้อมูลข้างบนเท่านั้น ห้ามสร้างใหม่ ห้ามคำนวณเพิ่ม ห้ามปัดเศษ
- ห้ามเพิ่มข้อเท็จจริงจากความรู้ของคุณเอง เช่นค่าเฉลี่ยของร้านอื่นหรือราคาตลาด
  ถ้าข้อมูลข้างบนไม่พอจะตอบ ให้บอกตรง ๆ ว่าไม่มีข้อมูลส่วนนั้น
- แต่ละบล็อกในข้อมูลมีป้ายบอกว่ามาจากไหนและครอบคลุมช่วงเวลาใด
  ถ้าเอ่ยตัวเลข ให้บอกช่วงเวลาที่ตัวเลขนั้นครอบคลุมด้วย
- ข้อมูลที่ไม่เกี่ยวกับคำถาม ไม่ต้องพูดถึง ไม่ต้องไล่ให้ครบ
- ตอบเป็นภาษาไทย กระชับ ไม่ต้องทวนคำถาม ไม่ต้องใส่หัวข้อ`

const noDataAnswerTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร ตอบคำถามด้านล่าง

คำถาม:
%s
%s
กฎ:
- คำถามนี้ไม่ต้องใช้ข้อมูลของร้าน ตอบจากความเข้าใจทั่วไปได้
- ห้ามอ้างตัวเลขใด ๆ เกี่ยวกับร้านนี้ เพราะคุณไม่ได้รับข้อมูลของร้านมาเลย
- ห้ามอ้างค่าเฉลี่ยของร้านอื่น ราคาตลาด หรือสถิติอุตสาหกรรม เพราะตรวจสอบไม่ได้
- ถ้าคำถามต้องใช้ข้อมูลของร้าน ให้บอกว่าขอดูข้อมูลส่วนไหนเพิ่ม
- ตอบเป็นภาษาไทย กระชับ`

func selectToolsPrompt(question string, history []Turn) string {
	return fmt.Sprintf(selectToolsTemplate, question, formatHistory(history))
}

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
