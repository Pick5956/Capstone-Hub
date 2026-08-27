package service

import (
	"time"

	"Project-M/internal/entity"
)

// Operating calendar for the forecast: which days the shop is open.
//
// isOpen() answers in two layers, most authoritative first:
//  1. an explicit one-off rule for that exact date (open override, then closed),
//  2. an explicit weekly-closed rule for that weekday.
//
// Anything not marked is treated as OPEN. We deliberately do NOT guess closures
// from the sales history: a guess could only mislabel real zero-sales days. A day
// with no orders that is not marked closed is a genuine data point (open, sold
// nothing) — not a hidden holiday.
//
// Nothing writes these rules today: the AI settings screen that used to edit them
// was removed, and the table now stays empty, which makes isOpen() answer "open"
// for every day. It is kept as a reader because the restaurant's own open/closed
// switch is the natural source to feed it — that change is a new writer here, not
// a change to the forecast, which only ever calls isOpen().

type operatingCalendar struct {
	dateOpen     map[string]bool
	dateClosed   map[string]bool
	weeklyClosed map[time.Weekday]bool
}

func (c operatingCalendar) isOpen(d time.Time) bool {
	ds := d.Format("2006-01-02")
	if c.dateOpen[ds] {
		return true
	}
	if c.dateClosed[ds] {
		return false
	}
	return !c.weeklyClosed[d.Weekday()]
}

func buildOperatingCalendar(rules []entity.AIOperatingCalendarRule) operatingCalendar {
	cal := operatingCalendar{
		dateOpen:     map[string]bool{},
		dateClosed:   map[string]bool{},
		weeklyClosed: map[time.Weekday]bool{},
	}
	for _, r := range rules {
		switch r.RuleType {
		case "date_open":
			if r.Date != "" {
				cal.dateOpen[r.Date] = true
			}
		case "date_closed":
			if r.Date != "" {
				cal.dateClosed[r.Date] = true
			}
		case "weekly_closed":
			if r.Weekday != nil && *r.Weekday >= 0 && *r.Weekday <= 6 {
				cal.weeklyClosed[time.Weekday(*r.Weekday)] = true
			}
		}
	}
	return cal
}
