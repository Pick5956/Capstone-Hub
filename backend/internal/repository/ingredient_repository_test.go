package repository

import (
	"errors"
	"strings"
	"testing"

	"gorm.io/gorm"
)

// A filtered, paged read must resolve search, status and paging in SQL — never
// ship the whole table for the browser to filter.
func TestIngredientListFilteredBuildsFilteredPagedQuery(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if _, _, err := repo.ListFiltered(7, IngredientListQuery{
		Search: "shrimp",
		Status: "low",
		Sort:   "name",
		Limit:  50,
		Offset: 100,
	}); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListFiltered() error = %v", err)
	}

	joined := strings.Join(capture.statements, "\n")
	for _, fragment := range []string{
		"count(*)", // total is counted for page controls
		"name ilike '%shrimp%'",
		"stock > 0 and min_stock > 0 and stock <= min_stock", // "low" status filter
		"order by name asc",
		"limit 50",
		"offset 100",
	} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("filtered/paged query missing %q:\n%s", fragment, joined)
		}
	}
	// The count query (first statement) must not inherit the page window, or the
	// reported total would only ever be one page.
	if count := capture.statements[0]; strings.Contains(count, "limit ") || strings.Contains(count, "offset ") {
		t.Fatalf("count query must not carry limit/offset:\n%s", count)
	}
}

// A zero limit is the historical "return everything" read — no LIMIT clause.
func TestIngredientListFilteredWithoutLimitReturnsEverything(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if _, _, err := repo.ListFiltered(7, IngredientListQuery{}); err != nil &&
		!errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListFiltered() error = %v", err)
	}

	if joined := strings.Join(capture.statements, "\n"); strings.Contains(joined, "limit ") {
		t.Fatalf("a no-limit read must return all rows without LIMIT:\n%s", joined)
	}
}

// Priority sort ranks out-of-stock first, then low, then ok.
func TestIngredientListFilteredPriorityOrder(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewIngredientRepository(db)

	if _, _, err := repo.ListFiltered(7, IngredientListQuery{Sort: "priority"}); err != nil &&
		!errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListFiltered() error = %v", err)
	}

	if joined := strings.Join(capture.statements, "\n"); !strings.Contains(joined, "case when stock = 0 then 0") {
		t.Fatalf("priority sort must rank out-of-stock first:\n%s", joined)
	}
}
