package repository

import (
	"errors"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
)

// The whole-inventory history has to join the names in SQL. The log stores only
// ingredient_id and created_by_id, so without these joins the view — and the CSV
// built from it — would be a wall of numbers.
func TestListTransactionsFilteredJoinsReadableNames(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if _, _, err := repo.ListTransactionsFiltered(7, IngredientTransactionQuery{Limit: 50}); err != nil &&
		!errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListTransactionsFiltered() error = %v", err)
	}

	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	for _, fragment := range []string{
		"left join ingredients on ingredients.id = ingredient_transactions.ingredient_id",
		"left join ingredient_categories on ingredient_categories.id = ingredients.category_id",
		"left join users on users.id = ingredient_transactions.created_by_id",
		"as ingredient_name",
		"as created_by_name",
	} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("history query missing %q:\n%s", fragment, joined)
		}
	}
}

// Reads go through Table/Scan rather than the model, so GORM adds no soft-delete
// condition of its own. A voided movement reappearing in the history (and in the
// exported CSV) would be a silent audit lie.
func TestListTransactionsFilteredExcludesSoftDeletedRows(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if _, _, err := repo.ListTransactionsFiltered(7, IngredientTransactionQuery{}); err != nil &&
		!errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListTransactionsFiltered() error = %v", err)
	}

	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	if !strings.Contains(joined, "ingredient_transactions.deleted_at is null") {
		t.Fatalf("history query must exclude soft-deleted rows:\n%s", joined)
	}
}

func TestListTransactionsFilteredAppliesEveryFilter(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	bangkok := time.FixedZone("Asia/Bangkok", 7*60*60)
	from := time.Date(2026, 8, 19, 0, 0, 0, 0, bangkok)

	if _, _, err := repo.ListTransactionsFiltered(7, IngredientTransactionQuery{
		IngredientID: 4,
		CategoryID:   2,
		Type:         "in",
		Search:       "pork",
		From:         from,
		To:           from.AddDate(0, 0, 14),
		Limit:        50,
		Offset:       100,
	}); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListTransactionsFiltered() error = %v", err)
	}

	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	for _, fragment := range []string{
		"count(*)",
		"ingredient_transactions.ingredient_id = 4",
		"ingredients.category_id = 2",
		"ingredient_transactions.type = 'in'",
		"ingredients.name ilike '%pork%'",
		"ingredient_transactions.created_at >=",
		"ingredient_transactions.created_at <",
		"limit 50",
		"offset 100",
	} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("history query missing %q:\n%s", fragment, joined)
		}
	}
	// The total drives the page controls, so it must describe the whole filtered
	// set rather than the single page being read.
	if count := strings.ToLower(capture.statements[0]); strings.Contains(count, "limit ") || strings.Contains(count, "offset ") {
		t.Fatalf("count query must not carry limit/offset:\n%s", count)
	}
}

// An unknown type string must widen to "all types" rather than reaching SQL,
// where it would silently return an empty history.
func TestListTransactionsFilteredIgnoresUnknownType(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if _, _, err := repo.ListTransactionsFiltered(7, IngredientTransactionQuery{Type: "drop table"}); err != nil &&
		!errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListTransactionsFiltered() error = %v", err)
	}

	if joined := strings.ToLower(strings.Join(capture.statements, "\n")); strings.Contains(joined, "ingredient_transactions.type =") {
		t.Fatalf("an unrecognised type must not reach SQL:\n%s", joined)
	}
}

// Two movements written in the same instant must not be able to swap places
// between pages, or paging through the history would drop or repeat rows.
func TestListTransactionsFilteredOrdersNewestFirstWithStableTieBreak(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if _, _, err := repo.ListTransactionsFiltered(7, IngredientTransactionQuery{Limit: 50}); err != nil &&
		!errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListTransactionsFiltered() error = %v", err)
	}

	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	if !strings.Contains(joined, "order by ingredient_transactions.created_at desc,ingredient_transactions.id desc") &&
		!strings.Contains(joined, "order by ingredient_transactions.created_at desc, ingredient_transactions.id desc") {
		t.Fatalf("history must be newest first with the id as tie-break:\n%s", joined)
	}
}
