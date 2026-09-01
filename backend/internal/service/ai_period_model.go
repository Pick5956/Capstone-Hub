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
// People type "มีน่า", "เมษาปีที่แล้ว", "เมื่อวาน", "สัปดาห์ที่แล้ว", "ช่วงสงกรานต์" —
// reading that is a judgement, and the model makes it far better than a word
// list ever will. So the model is asked what range was meant, and Go decides
// whether the answer is usable: real dates, in order, inside a sane span.
//
// The split matters: the model may say WHICH range; only Go says WHAT the sales
// in it were, and only Go writes the label the owner reads. A label taken from
// the model could say "เมื่อวาน" over the wrong dates; a label derived from the
// dates themselves cannot.
//
// Two shapes are accepted, and the reason is arithmetic. For a whole month the
// model sends year+month and Go builds the boundaries, because "the last day of
// February" is exactly the kind of sum a model gets wrong occasionally. For a
// day or a span it sends explicit dates, because only it can read "สัปดาห์ที่แล้ว".

type aiModelPeriod struct {
	Year  int    `json:"year"`
	Month int    `json:"month"`
	Start string `json:"start"` // "YYYY-MM-DD", inclusive
	End   string `json:"end"`   // "YYYY-MM-DD", inclusive
}

type aiModelPeriodReply struct {
	Periods    []aiModelPeriod `json:"periods"`
	Comparison bool            `json:"comparison"`
}

const aiPeriodPrompt = `คุณคือตัวอ่าน "ช่วงเวลา" ของผู้ช่วยร้านอาหาร อ่านข้อความแล้วตอบเป็น JSON เท่านั้น

รูปแบบ: {"periods":[...],"comparison":true/false}

แต่ละสมาชิกใน periods เลือกได้ 2 แบบ
- เดือนเต็ม: {"year":ค.ศ.,"month":1-12}
- ช่วงวัน:  {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}  (นับรวมวันสุดท้ายด้วย)

กฎ:
- year เป็น ค.ศ. เสมอ (ถ้าผู้ใช้พูด พ.ศ. เช่น 2569 ให้ลบ 543 = 2026 · ถ้าพูด "69" ให้เข้าใจว่า พ.ศ. 2569)
- ถ้าหมายถึง "ทั้งเดือน" ให้ใช้แบบเดือนเสมอ ห้ามคำนวณวันแรก-วันสุดท้ายของเดือนเอง
- ถ้าหมายถึงวันเดียว ให้ใช้แบบช่วงวันโดยให้ start เท่ากับ end
- ช่วงย้อนหลังให้นับถึง "เมื่อวาน" ไม่รวมวันนี้ เว้นแต่ผู้ใช้พูดว่ารวมวันนี้
  เช่น "3 วันที่ผ่านมา" คือ 3 วันก่อนหน้าวันนี้
- "สัปดาห์ที่แล้ว" คือ จันทร์ถึงอาทิตย์ของสัปดาห์ก่อนหน้า
- ถ้าผู้ใช้พูดถึงเดือนแบบไม่เต็มยศ (มีน่า มีนา เมษา กุมภา) ให้เข้าใจว่าหมายถึงเดือนนั้น
- ถ้าพูดว่า "เทียบเดือนต่อเดือน" โดยไม่ระบุเดือน ให้ใช้ เดือนนี้ กับ เดือนที่แล้ว และ comparison=true
- comparison=true เมื่อผู้ใช้ขอเปรียบเทียบ
- ถ้าอ่านไม่ออกว่าหมายถึงช่วงไหน ให้ตอบ {"periods":[],"comparison":false}
- ห้ามเดาช่วงเวลาที่ผู้ใช้ไม่ได้พูดถึง

ตัวอย่าง (สมมติวันนี้คือ 2026-08-27 ซึ่งเป็นวันพฤหัสบดี)
ข้อความ: "เดือนมีน่ากับเมษา 69" → {"periods":[{"year":2026,"month":3},{"year":2026,"month":4}],"comparison":true}
ข้อความ: "ขอดูกราฟเทียบยอดขายเดือนต่อเดือน" → {"periods":[{"year":2026,"month":8},{"year":2026,"month":7}],"comparison":true}
ข้อความ: "ยอดขายกรกฎาคม" → {"periods":[{"year":2026,"month":7}],"comparison":false}
ข้อความ: "เมื่อวานขายได้เท่าไหร่" → {"periods":[{"start":"2026-08-26","end":"2026-08-26"}],"comparison":false}
ข้อความ: "ยอดขายวันนี้" → {"periods":[{"start":"2026-08-27","end":"2026-08-27"}],"comparison":false}
ข้อความ: "3 วันที่ผ่านมาขายได้เท่าไหร่" → {"periods":[{"start":"2026-08-24","end":"2026-08-26"}],"comparison":false}
ข้อความ: "สัปดาห์ที่แล้วเป็นไงบ้าง" → {"periods":[{"start":"2026-08-17","end":"2026-08-23"}],"comparison":false}
ข้อความ: "ตั้งแต่ต้นเดือนถึงวันนี้" → {"periods":[{"start":"2026-08-01","end":"2026-08-27"}],"comparison":false}
ข้อความ: "ช่วง 20 ถึง 24 สิงหา ขายได้รวมเท่าไหร่" → {"periods":[{"start":"2026-08-20","end":"2026-08-24"}],"comparison":false}
ข้อความ: "วันที่ 1-15 กรกฎาคม" → {"periods":[{"start":"2026-07-01","end":"2026-07-15"}],"comparison":false}
ข้อความ: "ยอดขายปีนี้" → {"periods":[{"start":"2026-01-01","end":"2026-08-27"}],"comparison":false}
ข้อความ: "เมนูอะไรขายดี" → {"periods":[],"comparison":false}

`

// aiPeriodMaxSpanDays caps how wide a single window may be. A few years of daily
// sales is a report, not a question, and a runaway span is the shape a misread
// date takes ("2026-08-26" heard as "1926-08-26").
const aiPeriodMaxSpanDays = 400

// resolveDatedSalesWithModel asks the model which range was meant when the
// deterministic parser found none, then validates every value here.
func (s *AIService) resolveDatedSalesWithModel(question string, history []AIConversationMessage, now time.Time) (datedSalesRequest, bool) {
	if strings.TrimSpace(question) == "" {
		return datedSalesRequest{}, false
	}
	prompt := fmt.Sprintf("%s(วันนี้คือ %s ซึ่งเป็น%s)\n%sข้อความ: %s",
		aiPeriodPrompt, now.Format("2006-01-02"), thaiWeekdayName(int(now.Weekday())),
		aiRecentTurnsForExtraction(history), strings.TrimSpace(question))

	text, _, err := s.askSecondRoundWithOptions(prompt, aiProviderCompleteOptions{ReasoningEffort: "low", Model: aiSupportModel()})
	if err != nil {
		return datedSalesRequest{}, false
	}
	reply, ok := parseAIModelPeriodReply(text)
	if !ok || len(reply.Periods) == 0 {
		return datedSalesRequest{}, false
	}

	periods := make([]AIPeriod, 0, len(reply.Periods))
	for _, candidate := range reply.Periods {
		// A window the model got wrong is dropped, not repaired: a wrong range
		// answered confidently is worse than asking again.
		period, ok := aiPeriodFromModel(candidate, now)
		if !ok {
			continue
		}
		periods = append(periods, period)
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

// aiPeriodFromModel turns one validated candidate into a window. Explicit dates
// win over year+month when both are present, because a model that sent dates was
// answering about days.
func aiPeriodFromModel(candidate aiModelPeriod, now time.Time) (AIPeriod, bool) {
	loc := bangkokLocation()
	if strings.TrimSpace(candidate.Start) != "" || strings.TrimSpace(candidate.End) != "" {
		return aiRangePeriodFromModel(candidate.Start, candidate.End, now, loc)
	}
	if candidate.Month < 1 || candidate.Month > 12 {
		return AIPeriod{}, false
	}
	if !aiPlausibleYear(candidate.Year, now) {
		return AIPeriod{}, false
	}
	return monthPeriod(candidate.Year, time.Month(candidate.Month), loc), true
}

func aiPlausibleYear(year int, now time.Time) bool {
	return year >= 2000 && year <= now.Year()+1
}

// aiRangePeriodFromModel validates a pair of ISO dates and builds the window,
// labelling it from the dates alone.
func aiRangePeriodFromModel(startText, endText string, now time.Time, loc *time.Location) (AIPeriod, bool) {
	// A single date sent as one side only still describes one day.
	if strings.TrimSpace(startText) == "" {
		startText = endText
	}
	if strings.TrimSpace(endText) == "" {
		endText = startText
	}
	start, ok := aiParseISODate(startText, loc)
	if !ok {
		return AIPeriod{}, false
	}
	end, ok := aiParseISODate(endText, loc)
	if !ok {
		return AIPeriod{}, false
	}
	if end.Before(start) {
		start, end = end, start
	}
	if !aiPlausibleYear(start.Year(), now) || !aiPlausibleYear(end.Year(), now) {
		return AIPeriod{}, false
	}
	if end.Sub(start) > time.Duration(aiPeriodMaxSpanDays)*24*time.Hour {
		return AIPeriod{}, false
	}
	return AIPeriod{
		Label: aiRangeLabel(start, end, now),
		Start: start,
		// End is exclusive everywhere in this package; the model's end is the last
		// day the owner meant to include.
		End: end.AddDate(0, 0, 1),
	}, true
}

func aiParseISODate(text string, loc *time.Location) (time.Time, bool) {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(text))
	if err != nil {
		return time.Time{}, false
	}
	if !validCalendarDate(parsed.Year(), int(parsed.Month()), parsed.Day()) {
		return time.Time{}, false
	}
	return time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, loc), true
}

// aiRangeLabel names a window from its dates, never from what the model called
// it. "เมื่อวาน" here is a fact about the dates, so it cannot contradict them.
func aiRangeLabel(start, end, now time.Time) string {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, start.Location())
	if start.Equal(end) {
		switch {
		case start.Equal(today):
			return "วันนี้"
		case start.Equal(today.AddDate(0, 0, -1)):
			return "เมื่อวาน"
		}
		return fmt.Sprintf("วันที่ %d %s %d", start.Day(), thaiMonthName(int(start.Month())), start.Year()+543)
	}
	// A span that covers a whole calendar month is that month, and reads better
	// said that way.
	if start.Day() == 1 && end.AddDate(0, 0, 1).Day() == 1 && start.Month() == end.Month() && start.Year() == end.Year() {
		return fmt.Sprintf("เดือน%s %d", thaiMonthName(int(start.Month())), start.Year()+543)
	}
	if start.Year() == end.Year() && start.Month() == end.Month() {
		return fmt.Sprintf("%d–%d %s %d", start.Day(), end.Day(), thaiMonthName(int(start.Month())), start.Year()+543)
	}
	return fmt.Sprintf("%d %s %d – %d %s %d",
		start.Day(), thaiMonthName(int(start.Month())), start.Year()+543,
		end.Day(), thaiMonthName(int(end.Month())), end.Year()+543)
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
