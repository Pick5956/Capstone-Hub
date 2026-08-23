package service

// Compose mode: the answer is written by the model, the figures are still ours.
//
// Until now Go rendered the whole answer and the model was allowed one sentence
// on top. That guaranteed the numbers and guaranteed the wording too, which is
// why two people asking the same thing in different words got byte-identical
// replies, and why the reply to "which menu earns the most" read the same as the
// reply to "how much does the kale stir-fry earn".
//
// Here the rendered answer stops being what the owner reads and becomes the fact
// sheet the model reads: it already carries every figure next to its Thai label,
// which is exactly what a fact sheet needs, and it is the same text the number
// lock checks against. Nothing new has to be built to describe the data.
//
// What does not move: every figure still comes from Go, and a composed answer
// that mentions a figure Go did not compute is thrown away. What the model gains
// is the wording, the ordering, the emphasis, and the freedom to leave out what
// the question did not ask about.

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

// aiAnswerComposeMode reports whether the model writes the answer. Default is
// the template, so this can be turned on for a run and off again in one line.
func aiAnswerComposeMode() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("AI_ANSWER_MODE")), "compose")
}

// maxComposedAnswerRunes has to hold a real answer, not a lead-in: a five-row
// ranking with a figure or two per row runs past a thousand characters.
const maxComposedAnswerRunes = 1400

const composePromptTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร กำลังจะตอบคำถามจากข้อมูลที่ระบบคำนวณมาแล้ว

คำถามของเจ้าของร้าน:
%s

ข้อมูลที่ระบบคำนวณมาแล้ว:
%s
%s
เขียนคำตอบภาษาไทยให้เจ้าของร้านอ่าน ตอบให้ตรงคำถามที่ถูกถาม
%s

กฎเหล็ก:
- ตัวเลขทุกตัวต้องคัดลอกมาจากข้อมูลข้างบนเท่านั้น ห้ามสร้างใหม่ ห้ามคำนวณเพิ่ม ห้ามปัดเศษ
- ห้ามเพิ่มข้อเท็จจริงจากความรู้ของคุณเอง เช่นค่าเฉลี่ยของร้านอื่น ราคาตลาด หรือความนิยมของเมนู
  ทุกอย่างที่พูดต้องอ้างได้จากข้อมูลข้างบน
- ข้อมูลไหนไม่เกี่ยวกับคำถาม ไม่ต้องพูดถึง ไม่ต้องไล่ให้ครบ
- ห้ามขึ้นต้นด้วยการทวนคำถาม ตอบเลย
- เขียนให้กระชับ ไม่เกิน 6 บรรทัด`

// answerShapeRule keeps a ranking looking like a ranking and a single fact
// reading like a sentence. It counts named things, not bullet lines: the
// margin answer is ONE menu described by seven figures, and counting those
// figures as rows told the model to make a list, which it dutifully did -
// every composed answer came back as the same table with different bullets.
//
// A named thing is a numbered row or a bolded entity at the start of a line,
// which is how every list template in localToolAnswer writes its items, and
// how none of the single-fact templates writes its attributes.
func answerShapeRule(deterministic string) string {
	if countAnswerRows(deterministic) >= 2 {
		return "ข้อมูลชุดนี้มีหลายรายการ ให้แสดงเป็นรายการเรียงบรรทัด อ่านง่าย"
	}
	return "ข้อมูลชุดนี้เป็นเรื่องเดียว ให้เขียนเป็นประโยคภาษาคนต่อเนื่อง ห้ามทำเป็นรายการหรือ bullet"
}

// answerRowMarker matches "1. " and "- **name**", the two ways the rendered
// templates start a new item, and deliberately not a plain "- label value".
var answerRowMarker = regexp.MustCompile(`(?m)^\s*(?:\d+\.\s|[-•*]\s*\*\*)`)

func countAnswerRows(deterministic string) int {
	return len(answerRowMarker.FindAllString(deterministic, -1))
}

// composeAnswer returns the model's answer, or an empty string when there is
// nothing trustworthy to show and the caller should keep the rendered one.
func (s *AIService) composeAnswer(question, deterministic, observations string) string {
	prompt := fmt.Sprintf(
		composePromptTemplate,
		question,
		deterministic,
		observations,
		answerShapeRule(deterministic),
	)

	var raw string
	for _, adapter := range s.orderedProviderAdapters() {
		if adapter == nil || !adapter.Configured() {
			continue
		}
		answer, err := adapter.Complete(prompt)
		if err != nil {
			aiStage("warn", "compose via %s failed (%v) → keeping the rendered answer", adapter.DisplayName(), err)
			continue
		}
		raw = answer.Text
		break
	}

	composed := sanitizeComposedAnswer(raw)
	if composed == "" {
		return ""
	}
	// A figure the model was not given is a figure it invented, whatever else the
	// sentence around it says. This is the only check standing between the owner
	// and a confident wrong number, which is why turning it off is loud.
	if !aiNumberLockEnabled() {
		warnNumberLockDisabled()
		return composed
	}
	if !narrationUsesOnlyKnownNumbers(composed, allowedNumbers(deterministic+" "+observations)) {
		aiStage("warn", "composed answer mentioned a number that was not computed → discarded")
		return ""
	}
	return composed
}

// sanitizeComposedAnswer keeps the shape the model chose - line breaks and
// bullets are part of a readable answer here - and only removes the wrappers it
// was told not to add.
func sanitizeComposedAnswer(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	text = strings.Trim(text, "`")
	text = strings.TrimPrefix(text, "json")
	text = strings.TrimSpace(text)

	lines := strings.Split(text, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimRight(line, " \t")
		// A heading means it ignored the format instructions; the body is still
		// usable, so the heading is dropped rather than the whole answer.
		if strings.HasPrefix(strings.TrimSpace(trimmed), "#") {
			continue
		}
		kept = append(kept, trimmed)
	}
	text = strings.TrimSpace(strings.Join(kept, "\n"))
	if text == "" {
		return ""
	}
	if len([]rune(text)) > maxComposedAnswerRunes {
		return ""
	}
	return text
}
