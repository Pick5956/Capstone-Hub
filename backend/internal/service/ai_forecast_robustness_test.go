package service

import (
	"testing"
	"time"

	"Project-M/internal/repository"
)

// failIfPanic turns a panic into a test failure, so "does not crash" is an
// assertion, not a hope.
func failIfPanic(t *testing.T) {
	if r := recover(); r != nil {
		t.Fatalf("panicked on bad data: %v", r)
	}
}

// The forecast engine must survive deliberately broken input — degrading to an
// empty or bounded result, never a crash. Each sub-test feeds garbage.
func TestForecastDegradesGracefully(t *testing.T) {
	loc := bangkokLocation()
	anchor := time.Date(2026, time.August, 15, 0, 0, 0, 0, loc)

	t.Run("empty series", func(t *testing.T) {
		defer failIfPanic(t)
		r := buildForecast(nil, operatingCalendar{}, anchor, 7, 28)
		if len(r.Forecast) != 0 || r.BacktestN != 0 {
			t.Fatalf("empty input should produce nothing, got fc=%d n=%d", len(r.Forecast), r.BacktestN)
		}
	})

	t.Run("malformed dates are dropped, not fatal", func(t *testing.T) {
		defer failIfPanic(t)
		rows := []repository.AISalesSummary{
			{OrderDate: "not-a-date", Revenue: 5000},
			{OrderDate: "2026-13-45", Revenue: 5000}, // impossible date
			{OrderDate: "2026-07-20", Revenue: 8000}, // the one good row
			{OrderDate: "", Revenue: 5000},
		}
		pts := forecastPointsFromRows(rows)
		if len(pts) != 1 {
			t.Fatalf("only one row is a valid date, got %d points", len(pts))
		}
	})

	t.Run("all-zero revenue: no divide-by-zero", func(t *testing.T) {
		defer failIfPanic(t)
		pts := make([]forecastDailyPoint, 0, 60)
		for i := 60; i >= 1; i-- {
			pts = append(pts, forecastDailyPoint{date: anchor.AddDate(0, 0, -i), rev: 0})
		}
		r := buildForecast(pts, operatingCalendar{}, anchor, 7, 28)
		// Zero revenue cannot be forecast, and MAPE (÷actual) must not explode.
		if r.BacktestN != 0 {
			t.Fatalf("all-zero data cannot be backtested, got N=%d", r.BacktestN)
		}
		if len(r.Forecast) != 0 {
			t.Fatalf("all-zero data should yield no forecast, got %d", len(r.Forecast))
		}
	})

	t.Run("negative revenue (corruption) does not crash", func(t *testing.T) {
		defer failIfPanic(t)
		pts := make([]forecastDailyPoint, 0, 60)
		for i := 60; i >= 1; i-- {
			pts = append(pts, forecastDailyPoint{date: anchor.AddDate(0, 0, -i), rev: -1234})
		}
		_ = buildForecast(pts, operatingCalendar{}, anchor, 7, 28) // just must not panic
	})

	t.Run("single data point", func(t *testing.T) {
		defer failIfPanic(t)
		pts := []forecastDailyPoint{{date: anchor.AddDate(0, 0, -1), rev: 9000}}
		_ = buildForecast(pts, operatingCalendar{}, anchor, 7, 28)
	})

	t.Run("one huge outlier does not crash and stays finite", func(t *testing.T) {
		defer failIfPanic(t)
		pts := make([]forecastDailyPoint, 0, 84)
		for i := 84; i >= 1; i-- {
			rev := 10000.0
			if i == 3 { // a single absurd spike
				rev = 50_000_000
			}
			pts = append(pts, forecastDailyPoint{date: anchor.AddDate(0, 0, -i), rev: rev})
		}
		r := buildForecast(pts, operatingCalendar{}, anchor, 7, 28)
		for _, f := range r.Forecast {
			if f.Predicted < 0 || f.Predicted > 1e12 || f.Lower > f.Upper {
				t.Fatalf("outlier produced an insane/invalid point: %+v", f)
			}
		}
		// Honest note: the outlier DOES skew the number upward (no outlier handling
		// yet) — but it neither crashes nor produces garbage bounds.
	})

	t.Run("forecastDay with no matching weekday falls back safely", func(t *testing.T) {
		defer failIfPanic(t)
		// Only Mondays have data; ask for a far-future Saturday.
		pts := make([]forecastDailyPoint, 0, 12)
		d := time.Date(2026, time.June, 1, 0, 0, 0, 0, loc) // a Monday
		for i := 0; i < 12; i++ {
			pts = append(pts, forecastDailyPoint{date: d.AddDate(0, 0, i*7), rev: 7000})
		}
		_, _ = forecastDay(pts, anchor) // must not panic regardless of ok
	})
}
