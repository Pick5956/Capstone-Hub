package repository

import (
	"errors"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestExpenseDailyTotalsUseBangkokBucketsWithoutRowLimit(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewExpenseRepository(db)
	from := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.FixedZone("Asia/Bangkok", 7*60*60))

	if _, err := repo.TotalsByDay(7, ExpenseFilter{From: from, Until: from.AddDate(0, 1, 0)}); err != nil &&
		!errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("TotalsByDay() error = %v", err)
	}

	joined := strings.Join(capture.statements, "\n")
	for _, fragment := range []string{"at time zone 'asia/bangkok'", "'yyyy-mm-dd'", "sum(amount)", "count(*)"} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("daily expense aggregate missing %q:\n%s", fragment, joined)
		}
	}
	if strings.Contains(joined, "limit ") {
		t.Fatalf("daily expense aggregate must not inherit the ledger row cap:\n%s", joined)
	}
}
