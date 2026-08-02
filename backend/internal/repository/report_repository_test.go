package repository

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type statementCapture struct {
	statements []string
}

func (capture *statementCapture) LogMode(logger.LogLevel) logger.Interface { return capture }
func (capture *statementCapture) Info(context.Context, string, ...interface{}) {
}
func (capture *statementCapture) Warn(context.Context, string, ...interface{}) {
}
func (capture *statementCapture) Error(context.Context, string, ...interface{}) {
}
func (capture *statementCapture) Trace(_ context.Context, _ time.Time, fc func() (string, int64), _ error) {
	statement, _ := fc()
	capture.statements = append(capture.statements, strings.ToLower(statement))
}

func dryRunRepositoryDB(t *testing.T) (*gorm.DB, *statementCapture) {
	t.Helper()
	capture := &statementCapture{}
	db, err := gorm.Open(
		postgres.New(postgres.Config{
			DSN:                  "host=localhost user=test dbname=test sslmode=disable",
			PreferSimpleProtocol: true,
		}),
		&gorm.Config{
			DryRun:               true,
			DisableAutomaticPing: true,
			Logger:               capture,
		},
	)
	if err != nil {
		t.Fatalf("open dry-run database: %v", err)
	}
	return db, capture
}

func requirePaidCompletedCohort(t *testing.T, statements []string) {
	t.Helper()
	joined := strings.Join(statements, "\n")
	for _, fragment := range []string{"status = 'completed'", "payment_status = 'paid'"} {
		if !strings.Contains(joined, fragment) {
			t.Fatalf("generated SQL does not constrain revenue cohort by %q:\n%s", fragment, joined)
		}
	}
}

func TestReportRevenueQueriesUseOnlyPaidCompletedOrders(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewReportRepository(db)
	since := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.FixedZone("Asia/Bangkok", 7*60*60))

	if _, err := repo.SalesByDay(7, since); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("SalesByDay() error = %v", err)
	}
	if _, err := repo.MenuMargins(7, since); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("MenuMargins() error = %v", err)
	}
	requirePaidCompletedCohort(t, capture.statements)
}

func TestAIRevenueQueriesUseOnlyPaidCompletedOrders(t *testing.T) {
	db, capture := dryRunRepositoryDB(t)
	repo := NewAIRepository(db)
	since := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.FixedZone("Asia/Bangkok", 7*60*60))

	if _, err := repo.RecentSalesSummary(7, since); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("RecentSalesSummary() error = %v", err)
	}
	if _, err := repo.TopMenuItems(7, since); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("TopMenuItems() error = %v", err)
	}
	requirePaidCompletedCohort(t, capture.statements)
}
