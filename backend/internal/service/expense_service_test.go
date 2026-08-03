package service

import (
	"math"
	"testing"

	"Project-M/internal/repository"
)

// The ledger feeds money totals, so anything that survives validation gets
// summed forever. These are the inputs that pass a naive `amount <= 0` guard.
func TestExpenseValidateRejectsUnsummableAmounts(t *testing.T) {
	svc := ProvideExpenseService(nil)
	tests := []struct {
		name string
		req  ExpenseRequest
	}{
		{"nan", ExpenseRequest{Category: "rent", Amount: math.NaN()}},
		{"positive infinity", ExpenseRequest{Category: "rent", Amount: math.Inf(1)}},
		{"negative infinity", ExpenseRequest{Category: "rent", Amount: math.Inf(-1)}},
		{"zero", ExpenseRequest{Category: "rent", Amount: 0}},
		{"negative", ExpenseRequest{Category: "rent", Amount: -5}},
		{"rounds down to zero", ExpenseRequest{Category: "rent", Amount: 0.004}},
		{"above cap", ExpenseRequest{Category: "rent", Amount: maxExpenseAmount + 1}},
		{"unknown category", ExpenseRequest{Category: "marketing", Amount: 100}},
		{"empty category", ExpenseRequest{Category: "", Amount: 100}},
		{"bad date", ExpenseRequest{Category: "rent", Amount: 100, SpentAt: "03/08/2026"}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, _, _, _, err := svc.validate(&test.req); err == nil {
				t.Fatalf("validate(%+v) unexpectedly succeeded", test.req)
			}
		})
	}
}

func TestExpenseValidateAcceptsAndNormalises(t *testing.T) {
	svc := ProvideExpenseService(nil)
	category, amount, spentAt, note, err := svc.validate(&ExpenseRequest{
		Category: " rent ",
		Amount:   1234.567,
		SpentAt:  "2026-08-03",
		Note:     "  August rent  ",
	})
	if err != nil {
		t.Fatalf("validate() error = %v", err)
	}
	if category != "rent" {
		t.Fatalf("category = %q, want %q", category, "rent")
	}
	if amount != 1234.57 {
		t.Fatalf("amount = %v, want 1234.57", amount)
	}
	if note != "August rent" {
		t.Fatalf("note = %q, want %q", note, "August rent")
	}
	// Stored at Bangkok midnight so a late-night entry keeps the owner's date.
	if spentAt.Year() != 2026 || spentAt.Month() != 8 || spentAt.Day() != 3 || spentAt.Hour() != 0 {
		t.Fatalf("spentAt = %v, want 2026-08-03 00:00 Bangkok", spentAt)
	}
}

// An empty date must mean "today in Bangkok", not the zero time — a zero time
// would silently file the entry in year 1 and vanish from every report.
func TestExpenseBlankDateBecomesToday(t *testing.T) {
	parsed, err := parseExpenseDate("  ")
	if err != nil {
		t.Fatalf("parseExpenseDate() error = %v", err)
	}
	today := repository.BangkokNow()
	if parsed.Year() != today.Year() || parsed.Month() != today.Month() || parsed.Day() != today.Day() {
		t.Fatalf("parseExpenseDate(\"\") = %v, want %v", parsed, today)
	}
}
