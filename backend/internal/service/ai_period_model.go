package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

)

// Reading the time range the owner meant.
//
// The keyword parser next door knows the month names someone thought to list.
// People type "มีน่า", "เมษาปีที่แล้ว", "ช่วงสงกรานต์" — reading that is a
// judgement, and the model makes it far better than a word list ever will. So
// the model is asked what range was meant, and Go decides whether the answer is
// usable: a real month, a real year, inside the data the shop actually has.
//
// The split matters: the model may say WHICH range; only Go says WHAT the sales
// in it were. And when neither can tell, the assistant asks — it must never let
// an unresolved range become "there is no data".

type aiModelPeriod struct {
	Year  int `json:"year"`
	Month int `json:"month"`
}

type aiModelPeriodReply struct {
	Periods    []aiModelPeriod `json:"periods"`
	Comparison bool            `json:"comparison"`
}

const aiPeriodPrompt = `คุณคือตัวอ่าน "ช่วงเวลา" ของผู้ช่วยร้านอาหาร อ่านข้อความแล้วตอบเป็น JSON เท่านั้น

รูปแบบ: {"periods":[{"year":ค.ศ.,"month":1-12}],"comparison":true/false}

กฎ:
- year เป็น ค.ศ. เสมอ (ถ้าผู้ใช้พูด พ.ศ. เช่น 2569 ให้ลบ 543 = 2026 · ถ้าพูด "69" ให้เข้าใจว่า พ.ศ. 2569)
- ถ้าผู้ใช้พูดถึงเดือนแบบไม่เต็มยศ (มีน่า มีนา เมษา กุมภา) ให้เข้าใจว่าหมายถึงเดือนนั้น
- ถ้าพูดว่า "เดือนนี้" "เดือนที่แล้ว" ให้คำนวณจากวันที่ปัจจุบันที่ให้ไว้
- ถ้าพูดว่า "เทียบเดือนต่อเดือน" โดยไม่ระบุเดือน ให้ใช้ เดือนนี้ กับ เดือนที่แล้ว และ comparison=true
- comparison=true เมื่อผู้ใช้ขอเปรียบเทียบ
- ถ้าอ่านไม่ออกว่าหมายถึงช่วงไหน ให้ตอบ {"periods":[],"comparison":false}
- ห้ามเดาเดือนที่ผู้ใช้ไม่ได้พูดถึง

ตัวอย่าง (สมมติวันนี้คือ 2026-08-27)
ข้อความ: "เดือนมีน่ากับเมษา 69" → {"periods":[{"year":2026,"month":3},{"year":2026,"month":4}],"comparison":true}
ข้อความ: "ขอดูกราฟเทียบยอดขายเดือนต่อเดือน" → {"periods":[{"year":2026,"month":8},{"year":2026,"month":7}],"comparison":true}
ข้อความ: "ยอดขายกรกฎาคม" → {"periods":[{"year":2026,"month":7}],"comparison":false}
ข้อความ: "ยอดขายวันนี้" → {"periods":[],"comparison":false}
ข้อความ: "เมนูอะไรขายดี" → {"periods":[],"comparison":false}

`

// resolveDatedSalesWithModel asks the model which months were meant when the
// deterministic parser found none, then validates every value here.
func (s *AIService) resolveDatedSalesWithModel(question string, history []AIConversationMessage, now time.Time) (datedSalesRequest, bool) {
	if strings.TrimSpace(question) == "" {
		return datedSalesRequest{}, false
	}
	prompt := fmt.Sprintf("%s(วันนี้คือ %s)\n%sข้อความ: %s",
		aiPeriodPrompt, now.Format("2006-01-02"), aiRecentTurnsForExtraction(history), strings.TrimSpace(question))

	text, _, err := s.askSecondRoundWithOptions(prompt, aiProviderCompleteOptions{ReasoningEffort: "low"})
	if err != nil {
		return datedSalesRequest{}, false
	}
	reply, ok := parseAIModelPeriodReply(text)
	if !ok || len(reply.Periods) == 0 {
		return datedSalesRequest{}, false
	}

	loc := bangkokLocation()
	periods := make([]AIPeriod, 0, len(reply.Periods))
	for _, candidate := range reply.Periods {
		// A month the model invented out of range is dropped, not clamped: a wrong
		// month answered confidently is worse than asking again.
		if candidate.Month < 1 || candidate.Month > 12 {
			continue
		}
		if candidate.Year < 2000 || candidate.Year > now.Year()+1 {
			continue
		}
		periods = append(periods, monthPeriod(candidate.Year, time.Month(candidate.Month), loc))
		if len(periods) == 2 {
			break
		}
	}
	if len(periods) == 0 {
		return datedSalesRequest{}, false
	}
	if reply.Comparison && len(periods) >= 2 {
		return datedSalesRequest{comparison: true, periods: periods[:2]}, true
	}
	return datedSalesRequest{periods: periods[:1]}, true
}

func parseAIModelPeriodReply(raw string) (aiModelPeriodReply, bool) {
	text := strings.TrimSpace(raw)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(strings.TrimSpace(text), "```")
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return aiModelPeriodReply{}, false
	}
	var reply aiModelPeriodReply
	if err := json.Unmarshal([]byte(text[start:end+1]), &reply); err != nil {
		return aiModelPeriodReply{}, false
	}
	return reply, true
}

// aiSalesCoverageNote reports the range of days the shop actually has data for,
// so an answer about an empty month can say "the records start in August" rather
// than the bare "no data" that reads as "you sold nothing".
func (s *AIService) aiSalesCoverageNote(restaurantID uint) string {
	if s.repo == nil {
		return ""
	}
	coverage, err := s.repo.SalesCoverage(restaurantID)
	if err != nil || strings.TrimSpace(coverage.FirstDate) == "" {
		return ""
	}
	return fmt.Sprintf("data_coverage=%s..%s", coverage.FirstDate, coverage.LastDate)
}
