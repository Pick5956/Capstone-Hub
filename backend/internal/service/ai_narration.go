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

// maxNarrationRunes bounds what the model may add. It was 180, which fits one
// sentence and nothing else, and one sentence over an unchanging block of Go
// template is what made every answer read the same. Two or three sentences is
// enough to say what the figures mean; more than that and the model starts
// restating the list that is printed directly underneath it.
// aiNumberLockEnabled reports whether a figure the model wrote is checked
// against the figures Go computed. It is on unless someone turns it off, and
// turning it off is a deliberate act with a visible log line, because the whole
// claim this assistant makes about its numbers rests on this one check.
func aiNumberLockEnabled() bool {
	return !strings.EqualFold(strings.TrimSpace(os.Getenv("AI_NUMBER_LOCK")), "off")
}

// warnNumberLockDisabled marks every answer that went out unverified, so an
// evening of experiments cannot quietly become the state of the demo.
func warnNumberLockDisabled() {
	aiStage("warn", "AI_NUMBER_LOCK=off — ตัวเลขในคำตอบนี้ไม่ได้ถูกตรวจสอบ")
}

const maxNarrationRunes = 420

const narrationPromptTemplate = `คุณคือผู้ช่วยร้านอาหาร กำลังจะพูดนำก่อนที่ระบบจะแสดงตัวเลขที่คำนวณมาแล้ว

คำถามของเจ้าของร้าน:
%s

ตัวเลขที่ระบบคำนวณมาแล้ว (ห้ามแก้ ห้ามคำนวณเพิ่ม):
%s
%s
เขียนภาษาไทย 2-3 ประโยค ที่ "อ่านตัวเลขให้ฟัง" ไม่ใช่แค่เกริ่นว่ากำลังจะแสดงข้อมูล
พูดให้ตรงกับคำถามที่ถูกถาม และชี้จุดที่น่าสนใจในตัวเลขชุดนี้ เช่นตัวไหนเด่น ตัวไหนน่าห่วง

กฎเหล็ก:
- ห้ามสร้างตัวเลขใหม่ ห้ามปัดเศษ ห้ามประมาณค่า ห้ามบวกลบเอง
  ถ้าจะพูดถึงตัวเลขต้องคัดลอกมาตรง ๆ จากข้อมูลข้างบนเท่านั้น
- เอ่ยตัวเลขได้ไม่เกิน 3 ตัว เลือกเฉพาะตัวที่ตอบคำถามหรือน่าห่วงที่สุด
  ระบบจะแสดงรายการเต็มต่อจากข้อความของคุณอยู่แล้ว การไล่ซ้ำทั้งรายการทำให้ผู้ใช้ต้องอ่านสองรอบ
- ข้อสังเกตเพิ่มเติมข้างบน (ถ้ามี) หยิบมาพูดเฉพาะข้อที่เกี่ยวกับคำถามนี้จริง ๆ ที่เหลือไม่ต้องพูดถึง
- ห้ามใส่หัวข้อ ห้ามใส่เครื่องหมาย - นำหน้า ห้ามใส่ markdown
- ห้ามขึ้นย่อหน้าใหม่ เขียนติดกันเป็นย่อหน้าเดียว`

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
func (s *AIService) narrateDeterministicAnswer(question, deterministic string, insights []AIInsight) string {
	if !narrationEnabled() || strings.TrimSpace(deterministic) == "" {
		return deterministic
	}

	observations := formatNarrationInsights(insights)

	// Compose mode hands the whole answer to the model. The rendered text stays
	// behind as the fact sheet it reads from and as the reference the number lock
	// checks against, and is shown only if nothing trustworthy came back.
	if aiAnswerComposeMode() {
		if composed := s.composeAnswer(question, deterministic, observations); composed != "" {
			aiStage("flow", "composed answer (numbers locked, template not shown)")
			return composed
		}
		aiStage("warn", "compose produced nothing usable -> showing the rendered answer")
		return deterministic
	}

	prompt := fmt.Sprintf(narrationPromptTemplate, question, deterministic, observations)
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
	// The observations were computed by the same deterministic code, so a figure
	// quoted from them is as trustworthy as one from the answer itself.
	if narrationRestatesTheList(narration, deterministic) {
		// Measured against gpt-oss-20b: told not to repeat the list, it repeated the
		// list anyway on half the questions, and the owner then read the same figures
		// twice - once in prose, once in the block printed directly underneath.
		aiStage("warn", "narration restated the whole list → discarded")
		return deterministic
	}
	if !aiNumberLockEnabled() {
		warnNumberLockDisabled()
	} else if !narrationUsesOnlyKnownNumbers(narration, allowedNumbers(deterministic+" "+observations)) {
		// The whole point of the lock: a reworded figure is a wrong figure.
		aiStage("warn", "narration mentioned a number that was not computed → discarded")
		return deterministic
	}

	aiStage("flow", "narration added over deterministic answer (numbers locked)")
	return narration + "\n\n" + deterministic
}

// formatNarrationInsights hands the model the derived facts Go already computed
// for the dashboard - a week-on-week move, an ingredient about to run out, a
// popular dish with a thin margin. Without them the model has only the figures
// it is about to introduce, so the best it can write is an introduction; with
// them it can say which figure matters and why. It stays optional: the prompt
// tells the model to use only what the question is actually about.
func formatNarrationInsights(insights []AIInsight) string {
	if len(insights) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\nข้อสังเกตที่ระบบคำนวณไว้แล้ว (หยิบมาใช้เฉพาะข้อที่เกี่ยวกับคำถาม):\n")
	for _, insight := range insights {
		fmt.Fprintf(&b, "- %s %s: %s\n", insight.Title, insight.Metric, insight.Detail)
	}
	return b.String()
}

// narrateLocalAnswer puts the deterministic intercepts on the same footing as
// the tool path. Nine of them - dated sales, day parts, comparisons, profit,
// coverage - answer straight from a range query and returned their Go template
// verbatim, so the questions people ask most often were the ones that read most
// like a form letter. They compute no snapshot, so there are no observations to
// offer; the figures in the answer are still the only ones the model may use.
func (s *AIService) narrateLocalAnswer(question string, response *AIAskResponse) *AIAskResponse {
	if response == nil || strings.TrimSpace(response.Answer) == "" {
		return response
	}
	response.Answer = s.narrateDeterministicAnswer(question, response.Answer, nil)
	return response
}

// maxNarrationEchoes is how many figures a reading may repeat from the block
// printed directly underneath it before it stops being a reading. Two or three
// name what matters; beyond that the model is reciting the table.
//
// Only echoes count. A figure that appears solely in the observations - a
// week-on-week fall, the days of stock left - is information the owner cannot
// read anywhere else on the screen, and the best narration measured was one that
// quoted three of them to explain why a healthy-looking total was not healthy.
// Counting every figure alike threw that answer away along with the recitals.
const maxNarrationEchoes = 3

func narrationRestatesTheList(narration, deterministic string) bool {
	printed := allowedNumbers(deterministic)
	echoes := 0
	for _, match := range numberToken.FindAllString(narration, -1) {
		if _, shown := printed[normalizeNumberToken(match)]; shown {
			echoes++
		}
	}
	return echoes > maxNarrationEchoes
}
