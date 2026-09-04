package service

import (
	"strings"
	"testing"
	"time"
)

// The model may say which range was meant; Go decides whether that answer is
// usable. Anything outside the possible is dropped rather than repaired, because
// a confidently wrong window is worse than asking again.
func TestParseAIModelPeriodReply(t *testing.T) {
	reply, ok := parseAIModelPeriodReply(`{"periods":[{"year":2026,"month":3},{"year":2026,"month":4}],"comparison":true}`)
	if !ok || len(reply.Periods) != 2 || !reply.Comparison {
		t.Fatalf("plain object = %+v ok=%v", reply, ok)
	}
	if reply.Periods[0].Month != 3 || reply.Periods[1].Month != 4 {
		t.Errorf("months lost: %+v", reply.Periods)
	}

	fenced, ok := parseAIModelPeriodReply("```json\n{\"periods\":[{\"year\":2026,\"month\":7}],\"comparison\":false}\n```")
	if !ok || len(fenced.Periods) != 1 || fenced.Periods[0].Month != 7 {
		t.Fatalf("fenced object = %+v ok=%v", fenced, ok)
	}

	dated, ok := parseAIModelPeriodReply(`{"periods":[{"start":"2026-08-26","end":"2026-08-26"}],"comparison":false}`)
	if !ok || len(dated.Periods) != 1 || dated.Periods[0].Start != "2026-08-26" {
		t.Fatalf("dated object = %+v ok=%v", dated, ok)
	}

	empty, ok := parseAIModelPeriodReply(`{"periods":[],"comparison":false}`)
	if !ok || len(empty.Periods) != 0 {
		t.Fatalf("empty periods = %+v ok=%v", empty, ok)
	}

	if _, ok := parseAIModelPeriodReply("ยอดขายเดือนนี้ 12,000 บาท"); ok {
		t.Error("prose must not parse as a period reply")
	}
	if _, ok := parseAIModelPeriodReply("{broken"); ok {
		t.Error("malformed JSON must not parse")
	}
}

func aiTestNow(t *testing.T) time.Time {
	t.Helper()
	// Thursday 27 August 2026, the day the day-level windows were designed against.
	return time.Date(2026, 8, 27, 14, 30, 0, 0, bangkokLocation())
}

// A month arrives as year+month and Go builds the boundaries, so the last day of
// the month is never the model's sum to get wrong.
func TestAIPeriodFromModelMonth(t *testing.T) {
	now := aiTestNow(t)
	period, ok := aiPeriodFromModel(aiModelPeriod{Year: 2026, Month: 2}, now)
	if !ok {
		t.Fatal("a real month must be accepted")
	}
	if got := period.Start.Format("2006-01-02"); got != "2026-02-01" {
		t.Errorf("start = %s, want 2026-02-01", got)
	}
	// End is exclusive: February 2026 has 28 days.
	if got := period.End.Format("2006-01-02"); got != "2026-03-01" {
		t.Errorf("end = %s, want 2026-03-01", got)
	}

	for _, bad := range []aiModelPeriod{
		{Year: 2026, Month: 0},
		{Year: 2026, Month: 13},
		{Year: 1999, Month: 5},
		{Year: 2099, Month: 5},
	} {
		if _, ok := aiPeriodFromModel(bad, now); ok {
			t.Errorf("impossible month %+v must be dropped", bad)
		}
	}
}

func stubWindowReader(req datedSalesRequest, ok bool) salesWindowReader {
	return func(string, []AIConversationMessage, time.Time) (datedSalesRequest, bool) { return req, ok }
}

// The model reads first. The word list used to, and it grabbed "20 ส.ค." as one
// day out of a sentence naming two five-day spans — a real figure for a window
// nobody asked about — while the model was never consulted.
func TestResolveSalesWindowLetsTheModelReadFirst(t *testing.T) {
	now := time.Date(2026, time.September, 4, 15, 0, 0, 0, bangkokLocation())
	question := "เทียบยอดขายช่วง 20 ส.ค. - 24 ส.ค. กับ 25 ส.ค. - 29 ส.ค."
	loc := bangkokLocation()
	spans := datedSalesRequest{comparison: true, periods: []AIPeriod{
		{Label: "20–24 สิงหาคม 2569", Start: time.Date(2026, 8, 20, 0, 0, 0, 0, loc), End: time.Date(2026, 8, 25, 0, 0, 0, 0, loc)},
		{Label: "25–29 สิงหาคม 2569", Start: time.Date(2026, 8, 25, 0, 0, 0, 0, loc), End: time.Date(2026, 8, 30, 0, 0, 0, 0, loc)},
	}}
	req, ok := resolveSalesWindow(question, nil, now, stubWindowReader(spans, true))
	if !ok || !req.comparison || len(req.periods) != 2 || req.periods[0].Label != "20–24 สิงหาคม 2569" {
		t.Fatalf("the model's two spans should win: %+v", req)
	}
	// The word list on its own reads the same sentence as a single day — the
	// bug this ordering exists to stop.
	word, _ := resolveDatedSalesRequest(question, now)
	if len(word.periods) != 1 || word.comparison {
		t.Fatalf("expected the word list to misread this as one day (that is the point): %+v", word)
	}
}

// A date that does not exist is a question, not a reading. It is checked
// before the model gets the sentence, or a model would round it to a real day.
func TestResolveSalesWindowChecksTheCalendarBeforeReading(t *testing.T) {
	now := time.Date(2026, time.September, 4, 15, 0, 0, 0, bangkokLocation())
	called := false
	reader := func(string, []AIConversationMessage, time.Time) (datedSalesRequest, bool) {
		called = true
		return datedSalesRequest{}, false
	}
	req, ok := resolveSalesWindow("ยอดขายวันที่ 31 กุมภาพันธ์", nil, now, reader)
	if !ok || req.clarify == "" {
		t.Fatalf("an impossible date must come back as a question: %+v", req)
	}
	if called {
		t.Fatal("the model must not be asked to read a date that does not exist")
	}
}

// Asked to compare, read one side: that is not a total to report. It falls
// through to the word list, which asks which other side was meant.
func TestResolveSalesWindowHandsBackAHalfReadComparison(t *testing.T) {
	now := time.Date(2026, time.September, 4, 15, 0, 0, 0, bangkokLocation())
	oneSide := datedSalesRequest{comparison: true, periods: []AIPeriod{{Label: "เดือนกรกฎาคม 2569"}}}
	req, ok := resolveSalesWindow("เทียบยอดขายเดือนกรกฎาคมกับ", nil, now, stubWindowReader(oneSide, true))
	if !ok || req.clarify == "" {
		t.Fatalf("a half-read comparison should end as a question: %+v", req)
	}
}

// With the model unreachable, the month word list still answers what it can.
func TestResolveSalesWindowFallsBackToTheWordList(t *testing.T) {
	now := time.Date(2026, time.September, 4, 15, 0, 0, 0, bangkokLocation())
	req, ok := resolveSalesWindow("ยอดขายเดือนกรกฎาคม", nil, now, stubWindowReader(datedSalesRequest{}, false))
	if !ok || len(req.periods) != 1 || req.periods[0].Label != "เดือนกรกฎาคม 2569" {
		t.Fatalf("the word list should still read a named month: %+v", req)
	}
	req, ok = resolveSalesWindow("ยอดขายเดือนกรกฎาคม", nil, now, nil)
	if !ok || len(req.periods) != 1 {
		t.Fatalf("no reader at all should still read a named month: %+v", req)
	}
}

// Month against the same month last year has an example now; without one the
// model paired a month with a whole year.
func TestPeriodPromptPairsAMonthWithItselfLastYear(t *testing.T) {
	if !strings.Contains(aiPeriodPrompt, `"เทียบยอดขายเดือนกรกฎาคมกับปีที่แล้ว" → {"periods":[{"year":2026,"month":7},{"year":2025,"month":7}],"comparison":true}`) {
		t.Error("period prompt lost the month-vs-last-year example")
	}
}

// "ยอดขายสามวันที่ผ่านมา" is today and the two days before it — the owner's
// own definition. The prompt used to stop at yesterday, which disagreed with
// the trend tool and with what people mean by "ล่าสุด"; a running window says
// for itself that it is not over, so nothing is gained by cutting today off.
func TestPeriodPromptCountsTodayAsTheFirstDayBack(t *testing.T) {
	for _, want := range []string{
		"นับวันนี้เป็นวันแรก",
		`"3 วันที่ผ่านมาขายได้เท่าไหร่" → {"periods":[{"start":"2026-08-25","end":"2026-08-27"}]`,
		`"เทียบ 7 วันล่าสุดกับ 7 วันก่อนหน้า" → {"periods":[{"start":"2026-08-21","end":"2026-08-27"},{"start":"2026-08-14","end":"2026-08-20"}]`,
	} {
		if !strings.Contains(aiPeriodPrompt, want) {
			t.Errorf("period prompt missing %q", want)
		}
	}
	if strings.Contains(aiPeriodPrompt, "ไม่รวมวันนี้") {
		t.Error("the prompt still tells the model to cut today off")
	}
}

// Day-level windows are the whole point of the rewrite: before it, "เมื่อวาน"
// reached no resolver at all and the owner got today's figure instead.
func TestAIPeriodFromModelRange(t *testing.T) {
	now := aiTestNow(t)

	cases := []struct {
		name      string
		candidate aiModelPeriod
		wantStart string
		wantEnd   string // exclusive
		wantLabel string
	}{
		{"yesterday", aiModelPeriod{Start: "2026-08-26", End: "2026-08-26"}, "2026-08-26", "2026-08-27", "เมื่อวาน"},
		{"today", aiModelPeriod{Start: "2026-08-27", End: "2026-08-27"}, "2026-08-27", "2026-08-28", "วันนี้"},
		{"a named day", aiModelPeriod{Start: "2026-04-13", End: "2026-04-13"}, "2026-04-13", "2026-04-14", "วันที่ 13 เมษายน 2569"},
		{"last three days", aiModelPeriod{Start: "2026-08-24", End: "2026-08-26"}, "2026-08-24", "2026-08-27", "24–26 สิงหาคม 2569"},
		{"last week", aiModelPeriod{Start: "2026-08-17", End: "2026-08-23"}, "2026-08-17", "2026-08-24", "17–23 สิงหาคม 2569"},
		{"across months", aiModelPeriod{Start: "2026-07-28", End: "2026-08-03"}, "2026-07-28", "2026-08-04", "28 กรกฎาคม 2569 – 3 สิงหาคม 2569"},
		{"a whole month sent as dates", aiModelPeriod{Start: "2026-07-01", End: "2026-07-31"}, "2026-07-01", "2026-08-01", "เดือนกรกฎาคม 2569"},
		{"backwards dates are straightened", aiModelPeriod{Start: "2026-08-26", End: "2026-08-24"}, "2026-08-24", "2026-08-27", "24–26 สิงหาคม 2569"},
		{"one side only is one day", aiModelPeriod{Start: "2026-08-26"}, "2026-08-26", "2026-08-27", "เมื่อวาน"},
	}
	for _, tc := range cases {
		period, ok := aiPeriodFromModel(tc.candidate, now)
		if !ok {
			t.Errorf("%s: must be accepted", tc.name)
			continue
		}
		if got := period.Start.Format("2006-01-02"); got != tc.wantStart {
			t.Errorf("%s: start = %s, want %s", tc.name, got, tc.wantStart)
		}
		if got := period.End.Format("2006-01-02"); got != tc.wantEnd {
			t.Errorf("%s: end = %s, want %s", tc.name, got, tc.wantEnd)
		}
		if period.Label != tc.wantLabel {
			t.Errorf("%s: label = %q, want %q", tc.name, period.Label, tc.wantLabel)
		}
	}

	for _, bad := range []aiModelPeriod{
		{Start: "2026-02-30", End: "2026-02-30"}, // no such day
		{Start: "26-08-2026", End: "26-08-2026"}, // not ISO
		{Start: "1926-08-26", End: "1926-08-26"}, // a misheard year
		{Start: "2020-01-01", End: "2026-08-26"}, // a report, not a question
		{Start: "ไม่รู้", End: "ไม่รู้"},
	} {
		if _, ok := aiPeriodFromModel(bad, now); ok {
			t.Errorf("unusable range %+v must be dropped", bad)
		}
	}
}

// The label is derived from the dates, never taken from the model, so it cannot
// say "เมื่อวาน" over a window that is not yesterday.
func TestAIRangeLabelIgnoresWhatTheModelCalledIt(t *testing.T) {
	now := aiTestNow(t)
	period, ok := aiPeriodFromModel(aiModelPeriod{Start: "2026-08-20", End: "2026-08-20"}, now)
	if !ok {
		t.Fatal("a real day must be accepted")
	}
	if period.Label == "เมื่อวาน" || period.Label == "วันนี้" {
		t.Errorf("a day that is neither today nor yesterday was labelled %q", period.Label)
	}
}
