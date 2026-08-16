package service

import (
	"errors"
	"fmt"
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

// ---- settings API (read/replace the explicit calendar) --------------------

// AICalendarView is the shape the settings screen reads and writes: which
// weekdays are closed, plus one-off date overrides.
type AICalendarView struct {
	ClosedWeekdays []int                 `json:"closed_weekdays"`
	Exceptions     []AICalendarException `json:"exceptions"`
}

type AICalendarException struct {
	Date string `json:"date"` // "YYYY-MM-DD"
	Kind string `json:"kind"` // "closed" | "open"
}

// OperatingCalendarForOwner returns the restaurant's explicit calendar rules.
func (s *AIService) OperatingCalendarForOwner(restaurantID uint) (AICalendarView, error) {
	view := AICalendarView{ClosedWeekdays: []int{}, Exceptions: []AICalendarException{}}
	if s.repo == nil {
		return view, nil
	}
	rules, err := s.repo.OperatingCalendarRules(restaurantID)
	if err != nil {
		return view, err
	}
	for _, r := range rules {
		switch r.RuleType {
		case "weekly_closed":
			if r.Weekday != nil {
				view.ClosedWeekdays = append(view.ClosedWeekdays, *r.Weekday)
			}
		case "date_closed":
			view.Exceptions = append(view.Exceptions, AICalendarException{Date: r.Date, Kind: "closed"})
		case "date_open":
			view.Exceptions = append(view.Exceptions, AICalendarException{Date: r.Date, Kind: "open"})
		}
	}
	return view, nil
}

// SetOperatingCalendar validates the submitted calendar and replaces the stored
// rules with it. Replace (not merge) keeps the settings form the single authority
// over what it shows.
func (s *AIService) SetOperatingCalendar(restaurantID uint, view AICalendarView) error {
	if s.repo == nil {
		return errors.New("calendar store is unavailable")
	}
	rules := make([]entity.AIOperatingCalendarRule, 0, len(view.ClosedWeekdays)+len(view.Exceptions))

	seen := map[int]bool{}
	for _, wd := range view.ClosedWeekdays {
		if wd < 0 || wd > 6 {
			return fmt.Errorf("วันในสัปดาห์ต้องอยู่ระหว่าง 0-6 (ได้ %d)", wd)
		}
		if seen[wd] {
			continue
		}
		seen[wd] = true
		w := wd
		rules = append(rules, entity.AIOperatingCalendarRule{RestaurantID: restaurantID, RuleType: "weekly_closed", Weekday: &w})
	}

	for _, ex := range view.Exceptions {
		if _, err := time.Parse("2006-01-02", ex.Date); err != nil {
			return fmt.Errorf("รูปแบบวันที่ไม่ถูกต้อง: %q (ต้องเป็น YYYY-MM-DD)", ex.Date)
		}
		ruleType := "date_closed"
		switch ex.Kind {
		case "closed":
			ruleType = "date_closed"
		case "open":
			ruleType = "date_open"
		default:
			return fmt.Errorf("kind ต้องเป็น closed หรือ open (ได้ %q)", ex.Kind)
		}
		rules = append(rules, entity.AIOperatingCalendarRule{RestaurantID: restaurantID, RuleType: ruleType, Date: ex.Date})
	}

	return s.repo.ReplaceOperatingCalendar(restaurantID, rules)
}
