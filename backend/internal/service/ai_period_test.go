package service

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

// refJuly is a fixed reference "now" (mid-July 2026, Bangkok) so month
// resolution is deterministic regardless of when the tests run.
func refJuly(t *testing.T) time.Time {
	t.Helper()
	return time.Date(2026, time.July, 15, 12, 0, 0, 0, bangkokLocation())
}

func TestExtractPeriodsNamedThaiMonth(t *testing.T) {
	periods := extractPeriods("ยอดขายเดือนมีนาคมเท่าไหร่", refJuly(t))
	if len(periods) != 1 {
		t.Fatalf("want 1 period, got %d: %+v", len(periods), periods)
	}
	p := periods[0]
	if p.Label != "เดือนมีนาคม 2569" {
		t.Fatalf("label = %q", p.Label)
	}
	if !p.Start.Equal(time.Date(2026, time.March, 1, 0, 0, 0, 0, bangkokLocation())) {
		t.Fatalf("start = %v", p.Start)
	}
	if !p.End.Equal(time.Date(2026, time.April, 1, 0, 0, 0, 0, bangkokLocation())) {
		t.Fatalf("end = %v", p.End)
	}
}

func TestExtractPeriodsRelativeMonths(t *testing.T) {
	this := extractPeriods("ยอดขายเดือนนี้เท่าไหร่", refJuly(t))
	if len(this) != 1 || this[0].Label != "เดือนกรกฎาคม 2569" {
		t.Fatalf("this month wrong: %+v", this)
	}
	prev := extractPeriods("เดือนก่อนขายได้เท่าไหร่", refJuly(t))
	if len(prev) != 1 || prev[0].Label != "เดือนมิถุนายน 2569" {
		t.Fatalf("last month wrong: %+v", prev)
	}
}

// A month later than the reference month means the most recent past occurrence,
// i.e. last year, because that window is the one that has data.
func TestExtractPeriodsFutureMonthRollsToLastYear(t *testing.T) {
	periods := extractPeriods("ยอดขายเดือนธันวาคม", refJuly(t))
	if len(periods) != 1 || periods[0].Label != "เดือนธันวาคม 2568" {
		t.Fatalf("december should resolve to last year: %+v", periods)
	}
}

func TestExtractPeriodsEnglishMonthWordBoundary(t *testing.T) {
	// "decrease" must NOT be read as December.
	if got := extractPeriods("should we decrease the price", refJuly(t)); len(got) != 0 {
		t.Fatalf("decrease should not match a month: %+v", got)
	}
	got := extractPeriods("how much did we sell in March", refJuly(t))
	if len(got) != 1 || got[0].Label != "เดือนมีนาคม 2569" {
		t.Fatalf("english march wrong: %+v", got)
	}
}

func TestExtractPeriodsComparisonKeepsTextOrder(t *testing.T) {
	periods := extractPeriods("เทียบยอดเดือนนี้กับเดือนก่อน", refJuly(t))
	if len(periods) != 2 {
		t.Fatalf("want 2 periods, got %d: %+v", len(periods), periods)
	}
	if periods[0].Label != "เดือนกรกฎาคม 2569" || periods[1].Label != "เดือนมิถุนายน 2569" {
		t.Fatalf("comparison order wrong: %+v", periods)
	}
}

func TestResolveDatedSalesRequestSingle(t *testing.T) {
	req, ok := resolveDatedSalesRequest("ยอดขายเดือนมีนาคมเท่าไหร่", refJuly(t))
	if !ok || req.comparison || len(req.periods) != 1 {
		t.Fatalf("single dated sales wrong: ok=%v %+v", ok, req)
	}
}

func TestResolveDatedSalesRequestComparison(t *testing.T) {
	req, ok := resolveDatedSalesRequest("เทียบยอดเดือนนี้กับเดือนก่อน", refJuly(t))
	if !ok || !req.comparison || len(req.periods) != 2 {
		t.Fatalf("comparison request wrong: ok=%v %+v", ok, req)
	}
}

// A comparison naming only one month is paired with the month before it.
func TestResolveDatedSalesRequestComparisonSinglePeriodPairsPrevious(t *testing.T) {
	req, ok := resolveDatedSalesRequest("เทียบยอดขายเดือนมีนาคมหน่อย", refJuly(t))
	if !ok || !req.comparison || len(req.periods) != 2 {
		t.Fatalf("single-period comparison wrong: ok=%v %+v", ok, req)
	}
	if req.periods[0].Label != "เดือนมีนาคม 2569" || req.periods[1].Label != "เดือนกุมภาพันธ์ 2569" {
		t.Fatalf("pairing wrong: %+v", req.periods)
	}
}

// A year written after a month name is honored rather than defaulted to the
// reference year: "กรกฎาคม 68" must resolve to 2568, not the current 2569.
func TestExtractPeriodsHonorsYearAfterMonth(t *testing.T) {
	cases := []struct {
		q    string
		want string
	}{
		{"ยอดขายเดือนกรกฎาคม 68", "เดือนกรกฎาคม 2568"},
		{"ยอดขายเดือนกรกฎาคม 2568", "เดือนกรกฎาคม 2568"},
		{"ยอดขายกรกฎาคม 69", "เดือนกรกฎาคม 2569"},
		{"sales in july 2025", "เดือนกรกฎาคม 2568"},
	}
	for _, c := range cases {
		periods := extractPeriods(c.q, refJuly(t))
		if len(periods) != 1 || periods[0].Label != c.want {
			t.Fatalf("%q => %+v, want single %q", c.q, periods, c.want)
		}
	}
}

// A bare day after a month ("2 กรกฎาคม" reversed as "กรกฎาคม 2") must not be
// swallowed as a year; the month keeps its resolved year.
func TestExtractPeriodsDoesNotReadDayAsYear(t *testing.T) {
	periods := extractPeriods("ยอดขายมีนาคม 12", refJuly(t))
	if len(periods) != 1 || periods[0].Label != "เดือนมีนาคม 2569" {
		t.Fatalf("day-after-month mistaken for year: %+v", periods)
	}
}

// The reported bug: "เทียบ...เดือนกรกฎาคม 69 กับ ปี 68" must compare the same
// month across the two years, not July 2569 against June 2569.
func TestResolveDatedSalesRequestYearOverYear(t *testing.T) {
	req, ok := resolveDatedSalesRequest("เทียบยอดขายเดือนกรกฎาคม 69 กับ ปี 68 ให้หน่อย", refJuly(t))
	if !ok || !req.comparison || len(req.periods) != 2 {
		t.Fatalf("year-over-year comparison wrong: ok=%v %+v", ok, req)
	}
	if req.periods[0].Label != "เดือนกรกฎาคม 2569" || req.periods[1].Label != "เดือนกรกฎาคม 2568" {
		t.Fatalf("year-over-year pairing wrong: %+v", req.periods)
	}
}

// "เทียบเดือนนี้กับปีที่แล้ว" compares this month against the same month a year ago.
func TestResolveDatedSalesRequestRelativeYearOverYear(t *testing.T) {
	req, ok := resolveDatedSalesRequest("เทียบยอดขายเดือนนี้กับปีที่แล้ว", refJuly(t))
	if !ok || !req.comparison || len(req.periods) != 2 {
		t.Fatalf("relative year-over-year wrong: ok=%v %+v", ok, req)
	}
	if req.periods[0].Label != "เดือนกรกฎาคม 2569" || req.periods[1].Label != "เดือนกรกฎาคม 2568" {
		t.Fatalf("relative year-over-year pairing wrong: %+v", req.periods)
	}
}

// A comparison whose second operand cannot be parsed asks for clarification
// instead of silently substituting the previous month.
func TestResolveDatedSalesRequestUnparseableSecondOperandAsksToClarify(t *testing.T) {
	req, ok := resolveDatedSalesRequest("เทียบยอดขายเดือนกรกฎาคม 69 กับ ตอนนั้น", refJuly(t))
	if !ok {
		t.Fatal("comparison with an unparseable operand should still be claimed (to clarify)")
	}
	if req.clarify == "" || len(req.periods) != 0 {
		t.Fatalf("expected a clarification, got %+v", req)
	}
}

// A store summary that names a day resolves that single day; an unscoped summary
// does not, so it keeps the rolling-window overview.
func TestSummaryDayScope(t *testing.T) {
	if _, ok := summaryDayScope("สรุปสถานการณ์ร้าน", refJuly(t)); ok {
		t.Fatal("an unscoped summary must not resolve a day")
	}
	today, ok := summaryDayScope("สรุปร้านวันนี้", refJuly(t))
	if !ok || today.Label != "วันนี้" {
		t.Fatalf("today scope wrong: ok=%v %+v", ok, today)
	}
	if today.End.Sub(today.Start) != 24*time.Hour {
		t.Fatalf("today window is not exactly one day: %v..%v", today.Start, today.End)
	}
	y, ok := summaryDayScope("สรุปเมื่อวานให้หน่อย", refJuly(t))
	if !ok || y.Label != "เมื่อวาน" {
		t.Fatalf("yesterday scope wrong: ok=%v %+v", ok, y)
	}
	named, ok := summaryDayScope("สรุปร้านวันที่ 2 กรกฎาคม", refJuly(t))
	if !ok || named.Label != "วันที่ 2 กรกฎาคม 2569" {
		t.Fatalf("named-date scope wrong: ok=%v %+v", ok, named)
	}
}

// A day that does not exist for its month must be flagged, not answered as the
// whole month ("31 กุมภาพันธ์" used to return all of February).
func TestResolveDatedSalesRequestRejectsImpossibleDate(t *testing.T) {
	for _, q := range []string{
		"ยอดขายวันที่ 31 กุมภาพันธ์",
		"ยอดขาย 31 กุมภาพันธ์",
		"ยอดขายวันที่ 31 เมษายน",
	} {
		req, ok := resolveDatedSalesRequest(q, refJuly(t))
		if !ok || req.clarify == "" || len(req.periods) != 0 {
			t.Fatalf("%q should ask to clarify an impossible date, got ok=%v %+v", q, ok, req)
		}
	}
	// A valid day must still resolve to that single day.
	req, ok := resolveDatedSalesRequest("ยอดขายวันที่ 28 กุมภาพันธ์", refJuly(t))
	if !ok || req.clarify != "" || len(req.periods) != 1 {
		t.Fatalf("valid date must resolve to one day, got ok=%v %+v", ok, req)
	}
}

func TestResolveDatedSalesRequestExcludesMenuAndAverage(t *testing.T) {
	for _, q := range []string{
		"เมนูไหนขายดีเดือนมีนาคม",
		"ลูกค้าจ่ายเฉลี่ยต่อบิลเดือนนี้",
		"วัตถุดิบอะไรใช้เยอะเดือนมีนาคม",
	} {
		if _, ok := resolveDatedSalesRequest(q, refJuly(t)); ok {
			t.Fatalf("%q should not be claimed by dated-sales flow", q)
		}
	}
}

// A named month without a sales/revenue word is left to the normal flow.
func TestResolveDatedSalesRequestRequiresSalesWordForSingle(t *testing.T) {
	if _, ok := resolveDatedSalesRequest("เดือนมีนาคมเป็นยังไงบ้าง", refJuly(t)); ok {
		t.Fatal("bare month without a sales word should not be claimed")
	}
}

func TestResolveDatedSalesRequestNoPeriod(t *testing.T) {
	if _, ok := resolveDatedSalesRequest("ยอดขายรวมเท่าไหร่", refJuly(t)); ok {
		t.Fatal("a sales question with no named period should fall through to the snapshot flow")
	}
}

func TestFormatDatedSalesAnswer(t *testing.T) {
	p := monthPeriod(2026, time.March, bangkokLocation())
	got := formatDatedSalesAnswer(p, repository.AISalesRange{Orders: 42, Revenue: 12345.5, Days: 20})
	for _, want := range []string{"เดือนมีนาคม 2569", "12,345.50 บาท", "42 ออเดอร์", "20 วัน"} {
		if !strings.Contains(got, want) {
			t.Fatalf("answer missing %q: %s", want, got)
		}
	}
	empty := formatDatedSalesAnswer(p, repository.AISalesRange{})
	if !strings.Contains(empty, "ยังไม่มีออเดอร์") {
		t.Fatalf("empty answer wrong: %s", empty)
	}
}

func TestFormatDatedSalesComparison(t *testing.T) {
	a := monthPeriod(2026, time.July, bangkokLocation())
	b := monthPeriod(2026, time.June, bangkokLocation())
	got := formatDatedSalesComparison(a,
		repository.AISalesRange{Orders: 50, Revenue: 12000},
		b,
		repository.AISalesRange{Orders: 40, Revenue: 10000},
	)
	for _, want := range []string{"เดือนกรกฎาคม 2569", "เดือนมิถุนายน 2569", "12,000.00 บาท", "10,000.00 บาท", "+20.0%", "เพิ่มขึ้น"} {
		if !strings.Contains(got, want) {
			t.Fatalf("comparison missing %q: %s", want, got)
		}
	}
	// No prior revenue -> percentage change is not claimed.
	noPrior := formatDatedSalesComparison(a,
		repository.AISalesRange{Orders: 5, Revenue: 500},
		b,
		repository.AISalesRange{},
	)
	if strings.Contains(noPrior, "%") {
		t.Fatalf("no-prior comparison must not show a percentage: %s", noPrior)
	}
}

// TestRouterTemplatesRenderCleanly guards against unescaped '%' in the classifier
// templates: they are consumed by fmt.Sprintf, so a literal '%' (e.g. "10%")
// must be written as "%%" or the rendered prompt gets fmt error markers.
func TestRouterTemplatesRenderCleanly(t *testing.T) {
	for name, tmpl := range map[string]string{
		"full": routerClassifierTemplate,
	} {
		rendered := fmt.Sprintf(tmpl, "ปรับราคาทุกเมนูขึ้น 10%")
		if strings.Contains(rendered, "%!") {
			t.Fatalf("%s template rendered with a fmt error marker: %s", name, rendered)
		}
		if !strings.Contains(rendered, "ปรับราคาทุกเมนูขึ้น 10%") {
			t.Fatalf("%s template did not include the question", name)
		}
		// The escaped literal should survive as a single percent sign.
		if !strings.Contains(rendered, "raise all prices by 10%") {
			t.Fatalf("%s template lost its literal percent example", name)
		}
	}
}

// refWednesday is a fixed "now" on a Wednesday, so a week that runs Monday to
// Sunday is half over and this week and the last seven days are visibly
// different windows.
func refWednesday(t *testing.T) time.Time {
	t.Helper()
	return time.Date(2026, time.July, 15, 12, 0, 0, 0, bangkokLocation()) // Wed
}

func bkk(t *testing.T, year int, month time.Month, day int) time.Time {
	t.Helper()
	return time.Date(year, month, day, 0, 0, 0, 0, bangkokLocation())
}

// A window measured in days is not a calendar month, and the month scanners
// could not see one. "ในช่วง 7 วัน เมนูไหนขายดี" therefore resolved to no window
// at all, and the menu tools answered from their fixed 30-day snapshot: real
// figures for a period nobody asked about.
func TestExtractPeriodsCountdownDays(t *testing.T) {
	for _, tc := range []struct {
		question string
		label    string
		start    time.Time
	}{
		{"ในช่วง 7 วัน เมนูไหนขายดี", "7 วันล่าสุด", bkk(t, 2026, time.July, 9)},
		{"7 วันล่าสุด เมนูไหนขายดี", "7 วันล่าสุด", bkk(t, 2026, time.July, 9)},
		{"3 วันที่ผ่านมาขายได้เท่าไหร่", "3 วันล่าสุด", bkk(t, 2026, time.July, 13)},
		{"ยอดขาย 14 วันย้อนหลัง", "14 วันล่าสุด", bkk(t, 2026, time.July, 2)},
	} {
		periods := extractPeriods(tc.question, refWednesday(t))
		if len(periods) != 1 {
			t.Fatalf("%q: want 1 period, got %d: %+v", tc.question, len(periods), periods)
		}
		if periods[0].Label != tc.label {
			t.Errorf("%q: label = %q, want %q", tc.question, periods[0].Label, tc.label)
		}
		if !periods[0].Start.Equal(tc.start) {
			t.Errorf("%q: start = %v, want %v", tc.question, periods[0].Start, tc.start)
		}
		// Today counts as one of the days, so the window ends tomorrow.
		if want := bkk(t, 2026, time.July, 16); !periods[0].End.Equal(want) {
			t.Errorf("%q: end = %v, want %v", tc.question, periods[0].End, want)
		}
	}
}

// A count of days only becomes a window when the sentence says which direction
// it runs. Without that guard "อีก 7 วันข้างหน้า" — the forecast tool's question
// — would be answered with the seven days that already happened.
func TestExtractPeriodsIgnoresDaysWithoutDirection(t *testing.T) {
	for _, question := range []string{
		"อีก 7 วันข้างหน้าจะขายได้เท่าไหร่",
		"คาดการณ์ยอดขาย 7 วันถัดไป",
		"ร้านเปิดมา 7 วันแล้วนะ",
		"สั่งของ 5 วันต่อครั้ง",
	} {
		if periods := extractPeriods(question, refWednesday(t)); len(periods) != 0 {
			t.Errorf("%q: want no period, got %+v", question, periods)
		}
	}
}

// Last week is Monday to Sunday, not the seven days ending today. The older
// day-part scope collapsed both onto "7 วันล่าสุด"; asked on a Wednesday those
// two windows share only three days.
func TestExtractPeriodsCalendarWeeks(t *testing.T) {
	periods := extractPeriods("สัปดาห์ที่แล้วเมนูไหนขายดี", refWednesday(t))
	if len(periods) != 1 || periods[0].Label != "สัปดาห์ที่แล้ว" {
		t.Fatalf("last week: got %+v", periods)
	}
	if !periods[0].Start.Equal(bkk(t, 2026, time.July, 6)) || !periods[0].End.Equal(bkk(t, 2026, time.July, 13)) {
		t.Fatalf("last week = %v → %v", periods[0].Start, periods[0].End)
	}

	periods = extractPeriods("สัปดาห์นี้ขายได้เท่าไหร่", refWednesday(t))
	if len(periods) != 1 || periods[0].Label != "สัปดาห์นี้" {
		t.Fatalf("this week: got %+v", periods)
	}
	// Monday to today only: the rest of the week has not happened, and counting
	// it would report days of zero sales as though the week were going badly.
	if !periods[0].Start.Equal(bkk(t, 2026, time.July, 13)) || !periods[0].End.Equal(bkk(t, 2026, time.July, 16)) {
		t.Fatalf("this week = %v → %v", periods[0].Start, periods[0].End)
	}
}

// "อาทิตย์" on its own is the weekday Sunday. Only นี้ / ที่แล้ว / ก่อน turn it
// into a week, or "ยอดขายวันอาทิตย์" would silently become a seven-day total.
func TestExtractPeriodsSundayIsNotAWeek(t *testing.T) {
	if periods := extractPeriods("ยอดขายวันอาทิตย์เป็นยังไง", refWednesday(t)); len(periods) != 0 {
		t.Fatalf("want no period, got %+v", periods)
	}
}

// A week and a month named together are two windows, not one. They are
// de-duplicated by different keys on purpose: keyed by month alone, a week in
// July would have cancelled out "เดือนกรกฎาคม".
func TestExtractPeriodsWeekAndMonthCoexist(t *testing.T) {
	periods := extractPeriods("ยอดขายเดือนกรกฎาคมกับสัปดาห์นี้", refWednesday(t))
	if len(periods) != 2 {
		t.Fatalf("want 2 periods, got %d: %+v", len(periods), periods)
	}
	if periods[0].Label != "เดือนกรกฎาคม 2569" || periods[1].Label != "สัปดาห์นี้" {
		t.Fatalf("labels = %q, %q", periods[0].Label, periods[1].Label)
	}
}

// Both weeks named in one sentence are both windows. Returning only the first
// turned "เทียบสัปดาห์นี้กับสัปดาห์ที่แล้ว" into a one-window comparison, and the
// assistant asked the owner to spell out the dates of two weeks it had just
// been given.
func TestExtractPeriodsReadsBothWeeksForAComparison(t *testing.T) {
	periods := extractPeriods("เทียบยอดขายสัปดาห์นี้กับสัปดาห์ที่แล้ว", refWednesday(t))
	if len(periods) != 2 {
		t.Fatalf("want 2 periods, got %d: %+v", len(periods), periods)
	}
	if periods[0].Label != "สัปดาห์นี้" || periods[1].Label != "สัปดาห์ที่แล้ว" {
		t.Fatalf("labels = %q, %q (text order)", periods[0].Label, periods[1].Label)
	}
	req, ok := resolveDatedSalesRequest("เทียบยอดขายสัปดาห์นี้กับสัปดาห์ที่แล้ว", refWednesday(t))
	if !ok || !req.comparison || len(req.periods) != 2 || req.clarify != "" {
		t.Fatalf("should be a two-window comparison with nothing to clarify: %+v ok=%v", req, ok)
	}
}
