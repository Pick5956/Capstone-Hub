//go:build ai_eval

package repository

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// The bill queries run against a real PostgreSQL, read-only.
//
// They are here because the failure they guard is invisible to a unit test: the
// first version of BillsByNumbers embedded a struct carrying a []AIBillLine, and
// GORM refused every query with "define a valid foreign key for relations"
// before touching the database. Everything compiled, every unit test passed, and
// the tool failed on the first live question.
//
// Read-only by construction: SELECT only, no transaction, no writes. Still gated
// behind the same flag as the other database evals so a normal `go test ./...`
// never needs a database.
func billQueryDBOrSkip(t *testing.T) *gorm.DB {
	t.Helper()
	if strings.TrimSpace(os.Getenv("AI_DB_SCENARIO_EVAL_ENABLED")) != "1" {
		t.Skip("set AI_DB_SCENARIO_EVAL_ENABLED=1 to run the read-only bill queries against PostgreSQL")
	}
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	for _, key := range []string{"DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Skipf("bill query eval enabled, but %s is not configured", key)
		}
	}
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Bangkok",
		os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"), os.Getenv("DB_PORT"),
	)
	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open PostgreSQL for the bill queries: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("open PostgreSQL pool: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	return database
}

func TestRecentBillsAndBillsByNumbersRunAgainstPostgres(t *testing.T) {
	repo := NewAIRepository(billQueryDBOrSkip(t))

	recent, err := repo.RecentBills(1, 5)
	if err != nil {
		t.Fatalf("RecentBills: %v", err)
	}
	if len(recent) == 0 {
		t.Skip("restaurant 1 has no bills to read")
	}
	if recent[0].OrderNumber == "" {
		t.Errorf("a bill came back without its number: %+v", recent[0])
	}
	// The list is what "บิลล่าสุด" is answered from, so it cannot carry a bill
	// that has not happened yet — the demo data seeds a whole day at once.
	now := BangkokNow()
	for _, bill := range recent {
		if bill.OpenedAt.After(now) {
			t.Errorf("bill %s is opened in the future (%s): the recent list is not bounded to now",
				bill.OrderNumber, bill.OpenedAt)
		}
	}
	for i := 1; i < len(recent); i++ {
		if recent[i].OpenedAt.After(recent[i-1].OpenedAt) {
			t.Errorf("recent bills are not newest first: %s then %s", recent[i-1].OrderNumber, recent[i].OrderNumber)
		}
	}

	full, err := repo.BillsByNumbers(1, []string{recent[0].OrderNumber})
	if err != nil {
		t.Fatalf("BillsByNumbers: %v", err)
	}
	if len(full) != 1 {
		t.Fatalf("looking up one bill returned %d", len(full))
	}
	if full[0].OrderNumber != recent[0].OrderNumber {
		t.Errorf("looked up %s, got %s", recent[0].OrderNumber, full[0].OrderNumber)
	}
	// A bill nobody ordered from is possible; a bill whose lines do not add up to
	// its own subtotal is a query reading the wrong rows.
	var sum float64
	for _, line := range full[0].Lines {
		if line.Status == "cancelled" {
			continue
		}
		sum += line.Subtotal
	}
	if len(full[0].Lines) > 0 && sum != full[0].Subtotal {
		t.Errorf("bill %s: lines total %.2f but the bill's subtotal is %.2f",
			full[0].OrderNumber, sum, full[0].Subtotal)
	}

	if bills, err := repo.BillsByNumbers(1, []string{"ไม่มีเลขบิลนี้"}); err != nil {
		t.Errorf("looking up a number the shop never issued should be empty, not an error: %v", err)
	} else if len(bills) != 0 {
		t.Errorf("a number the shop never issued matched %d bill(s)", len(bills))
	}
}
