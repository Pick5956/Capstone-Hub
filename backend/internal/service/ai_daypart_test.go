package service

import (
	"testing"
	"time"
)

func TestParseDayPartNamedSegments(t *testing.T) {
	cases := []struct {
		q     string
		label string
		start int
		end   int
	}{
		{"ยอดขายเที่ยงนี้เป็นไงบ้าง", "ช่วงเที่ยง", 11, 14},
		{"ยอดขายช่วงกลางวันเท่าไหร่", "ช่วงเที่ยง", 11, 14},
		{"ยอดขายตอนเช้าเป็นไง", "ช่วงเช้า", 6, 11},
		{"ยอดขายช่วงบ่ายเท่าไหร่", "ช่วงบ่าย", 14, 17},
		{"ยอดขายมื้อเย็นเท่าไหร่", "ช่วงเย็น", 17, 21},
		{"ยอดขายช่วงดึกเป็นไง", "ช่วงดึก", 21, 24},
		{"how were dinner sales", "ช่วงเย็น", 17, 21},
	}
	for _, c := range cases {
		got, ok := parseDayPart(c.q)
		if !ok {
			t.Errorf("%q: expected a day part", c.q)
			continue
		}
		if got.Label != c.label || got.StartHour != c.start || got.EndHour != c.end {
			t.Errorf("%q: got %+v, want {%s %d %d}", c.q, got, c.label, c.start, c.end)
		}
	}
}

// A comparison names two windows; parseDayParts must return both, in the order
// they appear, so "กลางวันหรือกลางคืน" can be answered as a real comparison
// instead of silently collapsing to the first one.
func TestParseDayPartsComparison(t *testing.T) {
	parts := parseDayParts("ขายดีตอนกลางวันหรือกลางคืน")
	if len(parts) != 2 {
		t.Fatalf("expected 2 day parts, got %d: %+v", len(parts), parts)
	}
	if parts[0].Label != "ช่วงเที่ยง" || parts[1].Label != "ช่วงค่ำ" {
		t.Fatalf("order/labels wrong: %+v", parts)
	}
}

// A single named period is not a comparison.
func TestParseDayPartsSingle(t *testing.T) {
	if parts := parseDayParts("ยอดขายช่วงเที่ยงเท่าไหร่"); len(parts) != 1 {
		t.Fatalf("expected 1 day part, got %d: %+v", len(parts), parts)
	}
}

// "เที่ยงคืน" contains "เที่ยง"; the overlap must not be double-counted as two
// periods, which would wrongly trigger comparison mode.
func TestParseDayPartsNoOverlapDoubleCount(t *testing.T) {
	parts := parseDayParts("ยอดขายช่วงเที่ยงคืน")
	if len(parts) != 1 {
		t.Fatalf("เที่ยงคืน should be one part, got %d: %+v", len(parts), parts)
	}
	if parts[0].StartHour != 21 {
		t.Fatalf("เที่ยงคืน should map to the late-night window, got %+v", parts[0])
	}
}

// "เที่ยงคืน" is midnight, not noon — the more specific word must win.
func TestParseDayPartMidnightBeatsNoon(t *testing.T) {
	got, ok := parseDayPart("ยอดขายช่วงเที่ยงคืน")
	if !ok || got.StartHour != 21 {
		t.Fatalf("เที่ยงคืน should map to the late-night window, got %+v ok=%v", got, ok)
	}
}

func TestParseDayPartExplicitHourRange(t *testing.T) {
	for _, q := range []string{"ยอดขายช่วง 11:00-14:00", "ยอดขาย 11-14 น.", "ยอดขายตั้งแต่ 11 ถึง 14"} {
		got, ok := parseDayPart(q)
		if !ok {
			t.Errorf("%q: expected an hour range", q)
			continue
		}
		if got.StartHour != 11 || got.EndHour != 14 {
			t.Errorf("%q: got %+v, want 11..14", q, got)
		}
	}
	// Nonsense ranges are ignored rather than guessed at.
	if _, ok := parseDayPart("ยอดขาย 25-30"); ok {
		t.Error("out-of-range hours must not parse")
	}
}

func TestIsDayPartSalesQuestion(t *testing.T) {
	yes := []string{"ยอดขายเที่ยงนี้เป็นไงบ้าง", "รายได้ช่วงเย็นเท่าไหร่", "ขายได้เท่าไหร่ตอนเช้า"}
	for _, q := range yes {
		if !isDayPartSalesQuestion(q) {
			t.Errorf("%q should be a day-part sales question", q)
		}
	}

	no := []string{
		"ช่วงเวลาไหนคนเยอะสุด",   // peak-periods tool owns this
		"เมนูไหนขายดีช่วงเที่ยง", // menu question
		"วัตถุดิบอะไรใกล้หมด",
		"สวัสดีครับ",
	}
	for _, q := range no {
		if isDayPartSalesQuestion(q) {
			t.Errorf("%q must not be routed to the day-part flow", q)
		}
	}
}

func TestDayScopeDefaultsAndVariants(t *testing.T) {
	ref := time.Date(2026, time.August, 2, 20, 0, 0, 0, bangkokLocation())
	today := time.Date(2026, time.August, 2, 0, 0, 0, 0, bangkokLocation())

	start, end, label := dayScope("ยอดขายช่วงเที่ยง", ref)
	if !start.Equal(today) || !end.Equal(today.AddDate(0, 0, 1)) || label != "วันนี้" {
		t.Fatalf("default scope wrong: %v..%v %q", start, end, label)
	}

	start, end, label = dayScope("ยอดขายช่วงเที่ยงเมื่อวาน", ref)
	if !start.Equal(today.AddDate(0, 0, -1)) || !end.Equal(today) || label != "เมื่อวาน" {
		t.Fatalf("yesterday scope wrong: %v..%v %q", start, end, label)
	}

	// A named month scopes the hour filter to that whole month.
	start, _, label = dayScope("ยอดขายช่วงเที่ยงเดือนกรกฎาคม", ref)
	if start.Month() != time.July || label != "เดือนกรกฎาคม 2569" {
		t.Fatalf("month scope wrong: start=%v label=%q", start, label)
	}
}

// The field bug: "ช่วงเที่ยงวันที่ 2 เดือนกรกฎาคม" was answered with the whole
// month's total. The day must win over the month it belongs to.
func TestDayScopeUsesSpecificDateOverMonth(t *testing.T) {
	ref := time.Date(2026, time.August, 2, 20, 0, 0, 0, bangkokLocation())
	start, end, label := dayScope("ยอดขายช่วงเที่ยงวันที่ 2 เดือนกรกฎาคม เป็นไง", ref)

	wantStart := time.Date(2026, time.July, 2, 0, 0, 0, 0, bangkokLocation())
	if !start.Equal(wantStart) {
		t.Fatalf("start = %v, want %v", start, wantStart)
	}
	if !end.Equal(wantStart.AddDate(0, 0, 1)) {
		t.Fatalf("end = %v, want a single day", end)
	}
	if label != "วันที่ 2 กรกฎาคม 2569" {
		t.Fatalf("label = %q", label)
	}
}

func TestExtractSpecificDateFormats(t *testing.T) {
	ref := time.Date(2026, time.August, 2, 12, 0, 0, 0, bangkokLocation())
	cases := map[string]string{
		"ยอดขายวันที่ 2 เดือนกรกฎาคม": "วันที่ 2 กรกฎาคม 2569",
		"ยอดขายวันที่ 15 ก.ค.":        "วันที่ 15 กรกฎาคม 2569",
		"ยอดขาย 9 มีนาคม":             "วันที่ 9 มีนาคม 2569",
		"ยอดขายวันที่ 2026-07-02":     "วันที่ 2 กรกฎาคม 2569",
		"ยอดขาย 2/7/2569":             "วันที่ 2 กรกฎาคม 2569",
		"sales on 2 march":            "วันที่ 2 มีนาคม 2569",
	}
	for q, want := range cases {
		got, ok := extractSpecificDate(q, ref)
		if !ok {
			t.Errorf("%q: expected a specific date", q)
			continue
		}
		if got.Label != want {
			t.Errorf("%q: label = %q, want %q", q, got.Label, want)
		}
	}

	// A bare day with no month means this month, unless that day is still ahead.
	got, ok := extractSpecificDate("ยอดขายวันที่ 1", ref)
	if !ok || got.Label != "วันที่ 1 สิงหาคม 2569" {
		t.Errorf("bare day-of-month wrong: %+v ok=%v", got, ok)
	}
	got, ok = extractSpecificDate("ยอดขายวันที่ 20", ref) // 20 Aug has not happened
	if !ok || got.Label != "วันที่ 20 กรกฎาคม 2569" {
		t.Errorf("future day should roll back a month: %+v ok=%v", got, ok)
	}

	// Impossible dates are rejected rather than silently shifted.
	if _, ok := extractSpecificDate("ยอดขายวันที่ 31 กุมภาพันธ์", ref); ok {
		t.Error("31 February must not parse")
	}
	// A month with no day stays a month question.
	if _, ok := extractSpecificDate("ยอดขายเดือนกรกฎาคม", ref); ok {
		t.Error("a month without a day is not a specific date")
	}
}

// A specific day must also work for a plain total (no day part).
func TestDatedSalesRequestUsesSpecificDate(t *testing.T) {
	ref := time.Date(2026, time.August, 2, 12, 0, 0, 0, bangkokLocation())
	req, ok := resolveDatedSalesRequest("ยอดขายวันที่ 2 กรกฎาคม เท่าไหร่", ref)
	if !ok || len(req.periods) != 1 {
		t.Fatalf("expected a single-day request: ok=%v %+v", ok, req)
	}
	if req.periods[0].Label != "วันที่ 2 กรกฎาคม 2569" {
		t.Fatalf("label = %q", req.periods[0].Label)
	}
	if req.periods[0].End.Sub(req.periods[0].Start) != 24*time.Hour {
		t.Fatalf("window should be exactly one day: %v..%v", req.periods[0].Start, req.periods[0].End)
	}
}

func TestDayPartHoursText(t *testing.T) {
	if got := (dayPart{StartHour: 11, EndHour: 14}).hoursText(); got != "11:00-13:59" {
		t.Fatalf("hoursText = %q, want 11:00-13:59 (end hour is exclusive)", got)
	}
}
