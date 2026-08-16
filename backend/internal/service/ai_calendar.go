package service

import (
	"time"

	"Project-M/internal/entity"
)

// Operating calendar for the forecast: which days the shop is open.
//
// isOpen() answers in three layers, most authoritative first:
//  1. an explicit one-off rule for that exact date (open override, then closed),
//  2. an explicit weekly-closed rule for that weekday,
//  3. otherwise a guess from the sales history.
//
// So a shop that has configured its schedule is trusted outright; a shop that has
// not is served a best-effort inference until it does. The forecast only ever
// calls isOpen(), so the source can later move to the restaurant settings without
// touching the forecast.

const (
	inferMinOccurrences = 8    // need this many of a weekday before judging it
	inferClosedRatio    = 0.15 // sold on ≤15% of them → treat the weekday as closed
)

type operatingCalendar struct {
	dateOpen          map[string]bool
	dateClosed        map[string]bool
	weeklyClosed      map[time.Weekday]bool
	hasExplicitWeekly bool
	inferredClosed    map[time.Weekday]bool
}

func (c operatingCalendar) isOpen(d time.Time) bool {
	ds := d.Format("2006-01-02")
	if c.dateOpen[ds] {
		return true
	}
	if c.dateClosed[ds] {
		return false
	}
	// An explicit weekly config replaces the guess entirely; without one, guess.
	if c.hasExplicitWeekly {
		return !c.weeklyClosed[d.Weekday()]
	}
	return !c.inferredClosed[d.Weekday()]
}

func buildOperatingCalendar(rules []entity.AIOperatingCalendarRule, points []forecastDailyPoint) operatingCalendar {
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
				cal.hasExplicitWeekly = true
			}
		}
	}
	if !cal.hasExplicitWeekly {
		cal.inferredClosed = inferClosedWeekdays(points)
	}
	return cal
}

// inferClosedWeekdays guesses which weekdays the shop is closed, using a RATIO
// (days sold ÷ days that weekday occurred), not mere absence, so a one-week data
// gap is not mistaken for a closure. It refuses to judge a weekday with too few
// occurrences, and only ever flags "closed" — an unsure weekday stays open, since
// wrongly predicting zero for an open day is worse than the reverse.
func inferClosedWeekdays(points []forecastDailyPoint) map[time.Weekday]bool {
	if len(points) == 0 {
		return nil
	}
	first := points[0].date
	last := points[len(points)-1].date

	total := map[time.Weekday]int{}
	for d := first; !d.After(last); d = d.AddDate(0, 0, 1) {
		total[d.Weekday()]++
	}
	withSales := map[time.Weekday]int{}
	for _, p := range points {
		if p.rev > 0 {
			withSales[p.date.Weekday()]++
		}
	}

	closed := map[time.Weekday]bool{}
	for wd := time.Sunday; wd <= time.Saturday; wd++ {
		if total[wd] < inferMinOccurrences {
			continue // not enough evidence — leave it open
		}
		if float64(withSales[wd])/float64(total[wd]) <= inferClosedRatio {
			closed[wd] = true
		}
	}
	return closed
}
