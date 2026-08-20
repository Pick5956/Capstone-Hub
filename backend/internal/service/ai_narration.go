package service

// Narration: the one job the deterministic path gave up.
//
// Every figure a shop owner sees is computed in Go and rendered from a template,
// which is why the numbers can be trusted — but it also means two differently
// worded questions that hit the same tool come back byte-identical, and the
// answer never addresses what was actually asked ("what should I prep tomorrow?"
// versus "what should I reorder and when?").
//
// This adds a single opening sentence written by the LLM on top of the
// deterministic block. The model is handed the finished answer as fixed facts
// and told to copy figures verbatim; anything it writes is then checked against
// the numbers that were actually computed. A sentence that invents, rounds, or
// alters a figure is discarded and the owner sees the deterministic answer
// unchanged. Failure of any kind — quota, timeout, malformed output — also falls
// back to the template, so narration can only ever add polish, never risk.

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

// narrationEnabled lets an operator turn the extra provider call off (it costs
// one request per answered question) without a code change.
func narrationEnabled() bool {
	return !strings.EqualFold(strings.TrimSpace(os.Getenv("AI_NARRATION")), "off")
}

const maxNarrationRunes = 180

const narrationPromptTemplate = `คุณคือผู้ช่วยร้านอาหาร กำลังจะเกริ่นนำก่อนแสดงข้อมูลที่คำนวณมาแล้ว

คำถามของเจ้าของร้าน:
%s

ข้อมูลที่ระบบคำนวณมาแล้ว (ห้ามแก้ ห้ามคำนวณเพิ่ม):
%s

เขียน "ประโยคเกริ่มนำ" ภาษาไทย 1 ประโยคสั้น ๆ (ไม่เกิน 2 บรรทัด) ที่ตอบรับคำถามข้างต้นโดยตรง
กฎเหล็ก:
- ห้ามสร้างตัวเลขใหม่ ห้ามปัดเศษ ห้ามประมาณค่า ถ้าจะพูดถึงตัวเลขต้องคัดลอกมาตรง ๆ จากข้อมูลข้างบนเท่านั้น
- ห้ามสรุปซ้ำทั้งรายการ เพราะระบบจะแสดงรายการต่อจากประโยคของคุณอยู่แล้ว
- ห้ามใส่หัวข้อ ห้ามใส่เครื่องหมาย - นำหน้า ห้ามใส่ markdown
- ตอบเป็นประโยคเกริ่นนำอย่างเดียว ไม่ต้องมีคำอธิบายอื่น`

// numberToken matches figures as they appear in answers: 1,950 / 0.00 / 21.71%
var numberToken = regexp.MustCompile(`\d[\d,]*(?:\.\d+)?`)

// normalizeNumberToken makes "1,950", "1950" and "1950.00" compare equal, so a
// faithful restatement is accepted regardless of formatting.
func normalizeNumberToken(raw string) string {
	value := strings.ReplaceAll(strings.TrimSpace(raw), ",", "")
	if strings.Contains(value, ".") {
		value = strings.TrimRight(value, "0")
		value = strings.TrimSuffix(value, ".")
	}
	if value == "" {
		value = "0"
	}
	return value
}

// allowedNumbers collects every figure the deterministic answer already states.
func allowedNumbers(deterministic string) map[string]struct{} {
	allowed := make(map[string]struct{})
	for _, match := range numberToken.FindAllString(deterministic, -1) {
		allowed[normalizeNumberToken(match)] = struct{}{}
	}
	return allowed
}

// narrationUsesOnlyKnownNumbers is the lock: the sentence may only mention
// figures that were computed, spelled exactly as computed.
func narrationUsesOnlyKnownNumbers(narration string, allowed map[string]struct{}) bool {
	for _, match := range numberToken.FindAllString(narration, -1) {
		if _, ok := allowed[normalizeNumberToken(match)]; !ok {
			return false
		}
	}
	return true
}

// sanitizeNarration keeps a single clean lead-in: no markdown, no bullet, no
// heading, and short enough that the data stays the focus.
func sanitizeNarration(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	// Models sometimes wrap prose in fences or quotes despite being told not to.
	text = strings.Trim(text, "`\"' \n\r\t")
	if line, _, found := strings.Cut(text, "\n\n"); found {
		text = strings.TrimSpace(line) // keep only the lead paragraph
	}
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.Join(strings.Fields(text), " ")
	text = strings.TrimPrefix(text, "- ")
	text = strings.TrimPrefix(text, "* ")
	if strings.Contains(text, "**") || strings.HasPrefix(text, "#") {
		return "" // markdown means it ignored the format rules; don't trust it
	}
	if len([]rune(text)) > maxNarrationRunes {
		return ""
	}
	return text
}

// narrateDeterministicAnswer returns the finished answer. When narration is off,
// unavailable, or fails its checks, the deterministic answer is returned as-is.
func (s *AIService) narrateDeterministicAnswer(question, deterministic string) string {
	if !narrationEnabled() || strings.TrimSpace(deterministic) == "" {
		return deterministic
	}

	prompt := fmt.Sprintf(narrationPromptTemplate, question, deterministic)
	var raw string
	for _, adapter := range s.orderedProviderAdapters() {
		if adapter == nil || !adapter.Configured() {
			continue
		}
		answer, err := adapter.Complete(prompt)
		if err != nil {
			aiStage("warn", "narration via %s failed (%v) → keeping deterministic answer", adapter.DisplayName(), err)
			continue
		}
		raw = answer.Text
		break
	}

	narration := sanitizeNarration(raw)
	if narration == "" {
		return deterministic
	}
	if !narrationUsesOnlyKnownNumbers(narration, allowedNumbers(deterministic)) {
		// The whole point of the lock: a reworded figure is a wrong figure.
		aiStage("warn", "narration mentioned a number that was not computed → discarded")
		return deterministic
	}

	aiStage("flow", "narration added over deterministic answer (numbers locked)")
	return narration + "\n\n" + deterministic
}
