package service

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"Project-M/internal/repository"
)

// Time-of-day sales.
//
// Until now the smallest slice the assistant understood was a whole day, so
// "ยอดขายเที่ยงนี้เป็นไงบ้าง" silently became "ยอดขายวันนี้". A restaurant owner
// thinks in service periods, so a question can now name one (เช้า/เที่ยง/บ่าย/
// เย็น/ค่ำ) or give explicit hours ("11:00-14:00"), combined with any day scope.

// dayPart is an hour window [StartHour, EndHour) in Bangkok time.
type dayPart struct {
	Label     string
	StartHour int
	EndHour   int
}

func (d dayPart) hoursText() string {
	return fmt.Sprintf("%02d:00-%02d:59", d.StartHour, d.EndHour-1)
}

// namedDayParts is ordered: the first match wins, so longer/more specific words
// are checked before the ones they contain (เที่ยงคืน before เที่ยง).
var namedDayParts = []struct {
	keywords []string
	part     dayPart
}{
	{[]string{"เที่ยงคืน", "ดึก", "midnight", "late night"}, dayPart{"ช่วงดึก", 21, 24}},
	{[]string{"เช้า", "morning", "breakfast"}, dayPart{"ช่วงเช้า", 6, 11}},
	{[]string{"เที่ยง", "กลางวัน", "มื้อกลางวัน", "lunch", "noon"}, dayPart{"ช่วงเที่ยง", 11, 14}},
	{[]string{"บ่าย", "afternoon"}, dayPart{"ช่วงบ่าย", 14, 17}},
	{[]string{"เย็น", "มื้อเย็น", "evening", "dinner"}, dayPart{"ช่วงเย็น", 17, 21}},
	{[]string{"ค่ำ", "กลางคืน", "night"}, dayPart{"ช่วงค่ำ", 19, 23}},
}

var reHourRange = regexp.MustCompile(`(\d{1,2})(?::\d{2})?\s*(?:-|–|ถึง|to)\s*(\d{1,2})(?::\d{2})?\s*(?:น\.?)?`)

// parseDayPart finds an explicit hour range first (most precise), then a named
// service period.
func parseDayPart(question string) (dayPart, bool) {
	n := strings.ToLower(strings.TrimSpace(question))

	if m := reHourRange.FindStringSubmatch(n); m != nil {
		start, err1 := strconv.Atoi(m[1])
		end, err2 := strconv.Atoi(m[2])
		if err1 == nil && err2 == nil && start >= 0 && start < 24 && end > start && end <= 24 {
			return dayPart{Label: fmt.Sprintf("ช่วง %02d:00-%02d:59", start, end-1), StartHour: start, EndHour: end}, true
		}
	}

	for _, candidate := range namedDayParts {
		if containsAny(n, candidate.keywords...) {
			return candidate.part, true
		}
	}
	return dayPart{}, false
}

// dayScope resolves which day(s) the question is about. Defaults to today, which
// is what a bare "ช่วงเที่ยงขายได้เท่าไหร่" means.
func dayScope(question string, ref time.Time) (start, end time.Time, label string) {
	loc := ref.Location()
	today := time.Date(ref.Year(), ref.Month(), ref.Day(), 0, 0, 0, 0, loc)
	n := strings.ToLower(strings.TrimSpace(question))

	// A specific date is the most precise scope, so it is checked before months.
	if day, ok := extractSpecificDate(question, ref); ok {
		return day.Start, day.End, day.Label
	}
	if periods := extractPeriods(question, ref); len(periods) > 0 {
		return periods[0].Start, periods[0].End, periods[0].Label
	}
	switch {
	case containsAny(n, "เมื่อวาน", "yesterday"):
		y := today.AddDate(0, 0, -1)
		return y, today, "เมื่อวาน"
	case containsAny(n, "สัปดาห์", "อาทิตย์", "7 วัน", "week"):
		return today.AddDate(0, 0, -6), today.AddDate(0, 0, 1), "7 วันล่าสุด"
	default:
		return today, today.AddDate(0, 0, 1), "วันนี้"
	}
}

// answerDayPartSalesQuery handles "<sales> + <time of day>" questions.
func (s *AIService) answerDayPartSalesQuery(restaurantID uint, question string) (*AIAskResponse, bool, error) {
	if s.repo == nil || !isDayPartSalesQuestion(question) {
		return nil, false, nil
	}
	part, ok := parseDayPart(question)
	if !ok {
		return nil, false, nil
	}

	start, end, scopeLabel := dayScope(question, repository.BangkokNow())
	data, err := s.repo.SalesForHourRange(restaurantID, start, end, part.StartHour, part.EndHour)
	if err != nil {
		return nil, false, err
	}

	// State the hours used, so "เที่ยง" is never ambiguous to the reader.
	header := fmt.Sprintf("ยอดขาย%s %s (%s)", scopeLabel, part.Label, part.hoursText())
	answer := fmt.Sprintf("%s ยังไม่มีออเดอร์ที่ปิดบิลครับ", header)
	if data.Orders > 0 {
		answer = fmt.Sprintf("%s คือ %s บาท จาก %d ออเดอร์ครับ", header, formatMoney(data.Revenue), data.Orders)
		if data.Days > 1 {
			answer += fmt.Sprintf("\n\n(รวม %d วันที่มีการขายในช่วงเวลานี้)", data.Days)
		}
	}

	return &AIAskResponse{
		Answer:   answer,
		Intent:   AIIntentAnalysis,
		Task:     AITaskRetrieveFact,
		Tool:     AIToolGetSalesForPeriod,
		Model:    "local-daypart-sales",
		Snapshot: AISnapshot{},
	}, true, nil
}

// isDayPartSalesQuestion keeps this flow to sales totals. Menu or ingredient
// questions that happen to mention a time of day stay with their own tools, and
// "ช่วงเวลาไหนคนเยอะ" (which hour is busiest) belongs to the peak-periods tool.
func isDayPartSalesQuestion(question string) bool {
	n := strings.ToLower(strings.TrimSpace(question))
	if containsAny(n, "เมนู", "menu", "จาน", "dish", "วัตถุดิบ", "ingredient") {
		return false
	}
	if containsAny(n, "ช่วงไหน", "ช่วงเวลาไหน", "วันไหน", "กี่โมง", "เวลาไหน", "peak", "busiest") {
		return false
	}
	return containsAny(n, "ยอดขาย", "ยอด", "รายได้", "ขายได้", "ขายดี", "ออเดอร์", "sales", "revenue")
}
