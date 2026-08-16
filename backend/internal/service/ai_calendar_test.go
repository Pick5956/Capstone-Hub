package service

import (
	"testing"
	"time"

	"Project-M/internal/entity"
)

func calIntPtr(i int) *int { return &i }

// nextWeekday returns the first date on/after from that falls on wd.
func nextWeekday(from time.Time, wd time.Weekday) time.Time {
	for from.Weekday() != wd {
		from = from.AddDate(0, 0, 1)
	}
	return from
}

// A weekday the shop never sells on is inferred closed; weekdays with sales are
// not — and a barely-seen weekday is left open (too little evidence).
func TestInferClosedWeekdays(t *testing.T) {
	loc := bangkokLocation()
	start := time.Date(2026, time.May, 1, 0, 0, 0, 0, loc)
	var pts []forecastDailyPoint
	for i := 0; i < 84; i++ { // 12 weeks, ascending
		d := start.AddDate(0, 0, i)
		if d.Weekday() == time.Monday {
			continue // closed Mondays → no sales record at all
		}
		pts = append(pts, forecastDailyPoint{date: d, rev: 8000})
	}
	closed := inferClosedWeekdays(pts)
	if !closed[time.Monday] {
		t.Fatal("Monday (never any sales) should be inferred closed")
	}
	if closed[time.Saturday] || closed[time.Tuesday] {
		t.Fatal("weekdays that do sell must not be inferred closed")
	}
}

// A slow-but-open weekday (present most weeks, just low sales) must stay open —
// the test is a ratio of days-present, not sales size.
func TestInferKeepsSlowWeekdayOpen(t *testing.T) {
	loc := bangkokLocation()
	start := time.Date(2026, time.May, 1, 0, 0, 0, 0, loc)
	var pts []forecastDailyPoint
	for i := 0; i < 84; i++ {
		d := start.AddDate(0, 0, i)
		rev := 8000.0
		if d.Weekday() == time.Tuesday {
			rev = 300 // open, tiny sales
		}
		pts = append(pts, forecastDailyPoint{date: d, rev: rev})
	}
	if inferClosedWeekdays(pts)[time.Tuesday] {
		t.Fatal("a low-but-present weekday must not be flagged closed")
	}
}

// isOpen resolves layers in order: one-off date rule, then weekly rule.
func TestOperatingCalendarLayers(t *testing.T) {
	loc := bangkokLocation()
	mon := nextWeekday(time.Date(2026, time.August, 17, 0, 0, 0, 0, loc), time.Monday)
	tue := mon.AddDate(0, 0, 1)

	rules := []entity.AIOperatingCalendarRule{
		{RuleType: "weekly_closed", Weekday: calIntPtr(int(time.Monday))},
		{RuleType: "date_open", Date: mon.Format("2006-01-02")}, // this Monday is open (one-off)
		{RuleType: "date_closed", Date: tue.Format("2006-01-02")},
	}
	cal := buildOperatingCalendar(rules, nil)

	if !cal.isOpen(mon) {
		t.Fatal("date_open override must beat the weekly_closed Monday rule")
	}
	if cal.isOpen(mon.AddDate(0, 0, 7)) {
		t.Fatal("a normal Monday should be closed by the weekly rule")
	}
	if cal.isOpen(tue) {
		t.Fatal("date_closed must close that specific date")
	}
}

// With no explicit rules, isOpen falls back to inference.
func TestOperatingCalendarFallsBackToInference(t *testing.T) {
	loc := bangkokLocation()
	start := time.Date(2026, time.May, 1, 0, 0, 0, 0, loc)
	var pts []forecastDailyPoint
	for i := 0; i < 84; i++ {
		d := start.AddDate(0, 0, i)
		if d.Weekday() == time.Monday {
			continue
		}
		pts = append(pts, forecastDailyPoint{date: d, rev: 8000})
	}
	cal := buildOperatingCalendar(nil, pts) // no explicit rules → inference
	mon := nextWeekday(time.Date(2026, time.August, 17, 0, 0, 0, 0, loc), time.Monday)
	if cal.isOpen(mon) {
		t.Fatal("with no rules, an inferred-closed Monday should be closed")
	}
}
