package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"Project-M/internal/repository"
)

// Two-entity comparisons ("เทียบ A กับ B", "A หรือ B อันไหนดีกว่า").
//
// A comparison names two things of the same kind and asks which wins. The single
// -metric tools cannot express that, so before them the router looked at one
// entity and dropped the other ("ต้มยำกุ้งกับชาไทยอันไหนขายดีกว่า" just listed the
// top sellers). Day-of-time comparison lives in ai_daypart.go; this file adds the
// other two members of the class: weekdays and menus. Every number comes from the
// database, so the verdict is defensible, not guessed.

// hasCompareCue is a light gate. The real signal is finding two entities of the
// same kind, but a cue word keeps a single-entity question ("ต้มยำกุ้งขายดีไหม")
// from being read as a comparison.
func hasCompareCue(question string) bool {
	return containsAny(question,
		"เทียบ", "กับ", "หรือ", "ระหว่าง", "อันไหน", "ตัวไหน", "เทียบกับ",
		" vs ", "vs.", "versus", "กว่า", "มากกว่า", "ดีกว่า")
}

// ---- weekday comparison -------------------------------------------------

var weekdayKeywords = []struct {
	dow  int
	keys []string
}{
	{1, []string{"จันทร์", "monday"}},
	{2, []string{"อังคาร", "tuesday"}},
	{3, []string{"พุธ", "wednesday"}},
	{4, []string{"พฤหัสบดี", "พฤหัส", "thursday"}},
	{5, []string{"ศุกร์", "friday"}},
	{6, []string{"เสาร์", "saturday"}},
	{0, []string{"วันอาทิตย์", "อาทิตย์", "sunday"}},
}

// weekdaysNamedIn returns the distinct weekdays named, in order of appearance.
// "อาทิตย์" is skipped when it means "week" (อาทิตย์นี้/ที่แล้ว/หน้า) rather than
// Sunday, so "เทียบอาทิตย์นี้กับอาทิตย์ที่แล้ว" is not misread as one weekday.
func weekdaysNamedIn(question string) []int {
	n := strings.ToLower(question)
	type hit struct{ at, dow int }
	var hits []hit
	seen := map[int]bool{}
	for _, wk := range weekdayKeywords {
		for _, k := range wk.keys {
			at := strings.Index(n, k)
			if at < 0 || seen[wk.dow] {
				continue
			}
			if k == "อาทิตย์" {
				rest := n[at+len("อาทิตย์"):]
				if strings.HasPrefix(rest, "นี้") || strings.HasPrefix(rest, "ที่แล้ว") ||
					strings.HasPrefix(rest, "หน้า") || strings.HasPrefix(rest, "ก่อน") {
					continue // "this/last/next week", not Sunday
				}
			}
			seen[wk.dow] = true
			hits = append(hits, hit{at, wk.dow})
			break
		}
	}
	if len(hits) == 0 {
		return nil
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].at < hits[j].at })
	out := make([]int, len(hits))
	for i, h := range hits {
		out[i] = h.dow
	}
	return out
}

func (s *AIService) answerWeekdayComparison(restaurantID uint, question string) (*AIAskResponse, bool, error) {
	if s.repo == nil {
		return nil, false, nil
	}
	days := weekdaysNamedIn(question)
	if len(days) < 2 || !hasCompareCue(strings.ToLower(question)) {
		return nil, false, nil
	}

	// 90 days gives ~13 samples of each weekday — steadier than a 30-day window
	// that holds only ~4.
	since := repository.BangkokNow().AddDate(0, 0, -90)
	rows, err := s.repo.PeakSalesByWeekday(restaurantID, since)
	if err != nil {
		return nil, false, err
	}
	byDow := map[int]repository.AIPeriodSummary{}
	for _, r := range rows {
		byDow[r.Period] = r
	}

	var b strings.Builder
	b.WriteString("เทียบยอดขายรายวัน (ยอดรวม 90 วันล่าสุด)ครับ:")
	best, bestRev, allZero := -1, -1.0, true
	for _, d := range days {
		r := byDow[d]
		if r.Orders > 0 {
			allZero = false
		}
		if r.Revenue > bestRev {
			bestRev, best = r.Revenue, d
		}
		b.WriteString(fmt.Sprintf("\n- %s: %s บาท จาก %d ออเดอร์",
			thaiWeekdayName(d), formatMoney(r.Revenue), r.Orders))
	}
	if allZero {
		b.WriteString("\n\nยังไม่มีออเดอร์ในช่วง 90 วันล่าสุดครับ")
	} else if best >= 0 {
		b.WriteString(fmt.Sprintf("\n\n%sขายดีกว่าครับ", thaiWeekdayName(best)))
	}

	return &AIAskResponse{
		Answer:   b.String(),
		Intent:   AIIntentAnalysis,
		Task:     AITaskRetrieveFact,
		Model:    "local-weekday-compare",
		Snapshot: AISnapshot{},
	}, true, nil
}

// ---- menu comparison ----------------------------------------------------

// answerMenuComparison compares two menus a question names ("ต้มยำกุ้งกับชาไทย
// อันไหนขายดีกว่า"). Menu names have no word boundaries in Thai, so a menu is
// matched when it shares a run of at least five characters with the question,
// which tolerates a partial name ("ต้มยำกุ้ง" for "ต้มยำกุ้งน้ำข้น").
func (s *AIService) answerMenuComparison(restaurantID uint, question string) (*AIAskResponse, bool, error) {
	if s.repo == nil {
		return nil, false, nil
	}
	n := strings.ToLower(strings.TrimSpace(question))
	if !hasCompareCue(n) {
		return nil, false, nil
	}

	now := repository.BangkokNow()
	loc := now.Location()
	end := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1)
	start := end.AddDate(0, 0, -30)
	rows, err := s.repo.MenuMetricsForRange(restaurantID, start, end)
	if err != nil {
		return nil, false, err
	}

	type cand struct {
		row     repository.AIMenuMarginSummary
		overlap int
	}
	var cands []cand
	for _, m := range rows {
		if ov := longestCommonRun(n, strings.ToLower(m.MenuName)); ov >= 5 {
			cands = append(cands, cand{m, ov})
		}
	}
	if len(cands) < 2 {
		return nil, false, nil
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].overlap > cands[j].overlap })
	a, c := cands[0].row, cands[1].row
	if a.MenuName == c.MenuName {
		return nil, false, nil
	}

	metric, unit, va, vc := menuCompareMetric(n, a, c)
	answer := fmt.Sprintf("เทียบ%s (30 วันล่าสุด)ครับ:\n- %s: %s\n- %s: %s",
		metric, a.MenuName, formatMetric(va, unit), c.MenuName, formatMetric(vc, unit))
	verdict := func(name string) string {
		if metric == "ยอดขาย" {
			return fmt.Sprintf("%s ขายดีกว่าครับ", name)
		}
		return fmt.Sprintf("%s %sมากกว่าครับ", name, metric) // "X กำไร/รายได้ มากกว่า"
	}
	switch {
	case va == vc:
		answer += "\n\nสองเมนูนี้เท่ากันพอดีครับ"
	case va > vc:
		answer += "\n\n" + verdict(a.MenuName)
	default:
		answer += "\n\n" + verdict(c.MenuName)
	}

	return &AIAskResponse{
		Answer:   answer,
		Intent:   AIIntentAnalysis,
		Task:     AITaskRetrieveFact,
		Model:    "local-menu-compare",
		Snapshot: AISnapshot{},
	}, true, nil
}

// menuCompareMetric picks the axis the question asks about, defaulting to units
// sold ("ขายดี").
func menuCompareMetric(n string, a, c repository.AIMenuMarginSummary) (metric, unit string, va, vc float64) {
	switch {
	case containsAny(n, "กำไร", "profit"):
		return "กำไร", "บาท", a.Profit, c.Profit
	case containsAny(n, "รายได้", "ยอดขาย", "ยอด", "revenue", "sales"):
		return "รายได้", "บาท", a.Revenue, c.Revenue
	default:
		return "ยอดขาย", "จาน", float64(a.Quantity), float64(c.Quantity)
	}
}

func formatMetric(v float64, unit string) string {
	if unit == "จาน" {
		return fmt.Sprintf("%d จาน", int64(v))
	}
	return fmt.Sprintf("%s %s", formatMoney(v), unit)
}

// longestCommonRun is the length (in runes) of the longest run of characters
// shared by a and b — used to match a partial menu name against the question.
func longestCommonRun(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	if len(ra) == 0 || len(rb) == 0 {
		return 0
	}
	prev := make([]int, len(rb)+1)
	best := 0
	for i := 1; i <= len(ra); i++ {
		cur := make([]int, len(rb)+1)
		for j := 1; j <= len(rb); j++ {
			if ra[i-1] == rb[j-1] {
				cur[j] = prev[j-1] + 1
				if cur[j] > best {
					best = cur[j]
				}
			}
		}
		prev = cur
	}
	return best
}
