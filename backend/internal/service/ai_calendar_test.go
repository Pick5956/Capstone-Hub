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
	cal := buildOperatingCalendar(rules)

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

// With no rules set, every day is open. The calendar trusts the settings modal
// outright and never guesses a closure from the sales history — an unmarked day
// is open by design, even one that historically sold nothing.
func TestOperatingCalendarDefaultsOpen(t *testing.T) {
	cal := buildOperatingCalendar(nil)
	loc := bangkokLocation()
	d := time.Date(2026, time.August, 17, 0, 0, 0, 0, loc) // a Monday
	for i := 0; i < 7; i++ {                               // a full week, nothing marked
		day := d.AddDate(0, 0, i)
		if !cal.isOpen(day) {
			t.Fatalf("with no rules, %s must be open", day.Weekday())
		}
	}
}
