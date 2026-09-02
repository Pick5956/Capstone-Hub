package repository

import (
	"errors"
	"strings"
	"testing"

	"Project-M/internal/entity"

	"gorm.io/gorm"
)

// The "lasts N days" figure must come from what the kitchen actually cooked
// (order_inventory_deductions), not from the manual movement log — the two
// disagree, and the assistant already quotes the deductions.
func TestAttachDaysLeftReadsConsumptionFromDeductions(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	items := []entity.Ingredient{{Stock: 3000}}
	if err := repo.AttachDaysLeft(7, items); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("AttachDaysLeft() error = %v", err)
	}

	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	for _, fragment := range []string{
		"from \"order_inventory_deductions\"",
		"sum(quantity)",
		"group by \"ingredient_id\"",
		"deleted_at is null",
		"created_at >=",
	} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("usage query missing %q:\n%s", fragment, joined)
		}
	}
	if strings.Contains(joined, "ingredient_transactions") {
		t.Fatalf("usage must not be read from the movement log:\n%s", joined)
	}
}

// One grouped query for the whole page, never one per ingredient — a 200-row
// inventory would otherwise fire 200 round trips to paint a progress bar.
func TestAttachDaysLeftUsesOneQueryForEveryIngredient(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	items := make([]entity.Ingredient, 40)
	for i := range items {
		items[i].Stock = 100
	}
	if err := repo.AttachDaysLeft(7, items); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("AttachDaysLeft() error = %v", err)
	}

	if len(capture.statements) != 1 {
		t.Fatalf("want exactly 1 query for 40 ingredients, got %d:\n%s",
			len(capture.statements), strings.Join(capture.statements, "\n"))
	}
}

// An ingredient nobody has cooked with has no rate to divide by. Leaving the
// figure nil is the honest answer; a 0 would render as "runs out today" and a
// full bar would claim a forecast that does not exist.
func TestAttachDaysLeftLeavesUnusedIngredientsUnset(t *testing.T) {
	db, _ := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	// The dry-run harness returns no usage rows, which is exactly the
	// "never consumed" case.
	items := []entity.Ingredient{{Stock: 5000}, {Stock: 0}}
	if err := repo.AttachDaysLeft(7, items); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("AttachDaysLeft() error = %v", err)
	}

	for index, item := range items {
		if item.DaysLeft != nil || item.DailyUse != nil {
			t.Fatalf("item %d: want both figures unset without usage, got DaysLeft=%v DailyUse=%v",
				index, item.DaysLeft, item.DailyUse)
		}
	}
}

// Nothing to attach must not cost a query.
func TestAttachDaysLeftSkipsTheQueryForAnEmptyList(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if err := repo.AttachDaysLeft(7, nil); err != nil {
		t.Fatalf("AttachDaysLeft() error = %v", err)
	}
	if len(capture.statements) != 0 {
		t.Fatalf("an empty list must issue no query, got:\n%s", strings.Join(capture.statements, "\n"))
	}
}
