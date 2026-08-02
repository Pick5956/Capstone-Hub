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

func TestDayPartHoursText(t *testing.T) {
	if got := (dayPart{StartHour: 11, EndHour: 14}).hoursText(); got != "11:00-13:59" {
		t.Fatalf("hoursText = %q, want 11:00-13:59 (end hour is exclusive)", got)
	}
}
