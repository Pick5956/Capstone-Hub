package service

import (
	"strings"
	"testing"
	"time"
)

func aiExpenseTestNow() time.Time {
	return time.Date(2026, 8, 27, 14, 0, 0, 0, bangkokLocation())
}

// Two fields cannot be guessed and one can. The ledger files every row under one
// of six categories, and putting rent under "utilities" is a wrong number in a
// report the owner reads later — so an unclear category is asked about, not
// picked. A missing date, on the other hand, has one safe reading: today.
func TestResolveExpenseCommand(t *testing.T) {
	now := aiExpenseTestNow()

	t.Run("a complete expense is ready to confirm", func(t *testing.T) {
		got := ResolveExpenseCommand(AIStockCommandDraft{
			Name: "ค่าไฟ", Kind: "expense", Quantity: 3200, Category: "utilities", Note: "ค่าไฟ",
		}, now)
		if got.Kind != AICommandOutcomeReady {
			t.Fatalf("outcome = %v (%s)", got.Kind, got.Question)
		}
		if got.Command.Category != "utilities" || got.Command.Quantity != 3200 {
			t.Errorf("command = %+v", got.Command)
		}
		if got.Command.Date != "2026-08-27" {
			t.Errorf("an expense with no date said should be today, got %q", got.Command.Date)
		}
	})

	t.Run("an explicit date is kept", func(t *testing.T) {
		got := ResolveExpenseCommand(AIStockCommandDraft{
			Name: "ค่าเช่า", Kind: "expense", Quantity: 12000, Category: "rent", Date: "2026-08-01",
		}, now)
		if got.Kind != AICommandOutcomeReady || got.Command.Date != "2026-08-01" {
			t.Fatalf("got %v date=%q", got.Kind, got.Command.Date)
		}
	})

	t.Run("an unknown category is asked about, never guessed", func(t *testing.T) {
		for _, category := range []string{"", "ค่าไฟ", "misc", "food_cost"} {
			got := ResolveExpenseCommand(AIStockCommandDraft{
				Name: "อะไรสักอย่าง", Kind: "expense", Quantity: 500, Category: category,
			}, now)
			if got.Kind != AICommandOutcomeAsk {
				t.Errorf("category %q: outcome = %v, want ask", category, got.Kind)
			}
			// The question has to list what the ledger will accept, or the owner is
			// guessing at the same closed set the model just failed to hit.
			if !strings.Contains(got.Question, "ค่าน้ำค่าไฟ") {
				t.Errorf("category %q: the question should offer the categories: %s", category, got.Question)
			}
		}
	})

	t.Run("a missing amount is asked about", func(t *testing.T) {
		got := ResolveExpenseCommand(AIStockCommandDraft{
			Name: "ค่าไฟ", Kind: "expense", Quantity: 0, Category: "utilities",
		}, now)
		if got.Kind != AICommandOutcomeAsk {
			t.Fatalf("outcome = %v, want ask", got.Kind)
		}
	})

	t.Run("a date that is not a date is asked about", func(t *testing.T) {
		got := ResolveExpenseCommand(AIStockCommandDraft{
			Name: "ค่าไฟ", Kind: "expense", Quantity: 100, Category: "utilities", Date: "เมื่อวาน",
		}, now)
		if got.Kind != AICommandOutcomeAsk {
			t.Fatalf("outcome = %v, want ask", got.Kind)
		}
	})
}

// The preview is the last thing between the owner and a row in the ledger, so it
// has to state all three things that were decided: how much, under what, and when.
func TestValidateCreateExpensePreview(t *testing.T) {
	payload, preview, err := validateCreateExpense(AIAdjustStockCommand{
		Kind: "expense", Quantity: 3200, Category: "utilities", Date: "2026-08-27", Note: "ค่าไฟเดือนสิงหา",
	})
	if err != nil {
		t.Fatalf("a valid expense should validate: %v", err)
	}
	if payload.Category != "utilities" || payload.Amount != 3200 || payload.Date != "2026-08-27" {
		t.Errorf("payload = %+v", payload)
	}
	if preview.Title != "ค่าไฟเดือนสิงหา" {
		t.Errorf("title = %q, want what the owner called it", preview.Title)
	}
	for _, want := range []string{"3200", "ค่าน้ำค่าไฟ", "2026-08-27"} {
		if !strings.Contains(preview.Change, want) {
			t.Errorf("preview is missing %q: %s", want, preview.Change)
		}
	}
	// A hand-entered expense is editable, unlike the one a restock writes for
	// itself — the owner has been warned about that one, so say the difference.
	if !strings.Contains(strings.Join(preview.SideEffects, " "), "แก้หรือลบทีหลังได้") {
		t.Errorf("side effects = %v", preview.SideEffects)
	}

	if _, _, err := validateCreateExpense(AIAdjustStockCommand{
		Kind: "expense", Quantity: 100, Category: "not_a_category", Date: "2026-08-27",
	}); err == nil {
		t.Error("an unreviewed category must not validate")
	}
	if _, _, err := validateCreateExpense(AIAdjustStockCommand{
		Kind: "expense", Quantity: 0, Category: "rent", Date: "2026-08-27",
	}); err == nil {
		t.Error("a zero amount must not validate")
	}
}
