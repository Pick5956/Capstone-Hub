//go:build ai_eval

package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"Project-M/internal/repository"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type dbSnapshotExpectation struct {
	RestaurantID            uint     `json:"restaurant_id"`
	MinimumTotalIngredients int      `json:"minimum_total_ingredients"`
	MinimumLowItems         int      `json:"minimum_low_items"`
	RequiredStockRisks      []string `json:"required_stock_risks"`
	LowestMarginMenu        string   `json:"lowest_margin_menu"`
	LowestMarginMax         float64  `json:"lowest_margin_max"`
}

func dbEvaluationServiceOrSkip(t *testing.T) (*AIService, dbSnapshotExpectation) {
	t.Helper()
	if os.Getenv("AI_DB_EVAL_ENABLED") != "1" {
		t.Skip("set AI_DB_EVAL_ENABLED=1 to run read-only database snapshot evaluation")
	}

	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	raw, err := os.ReadFile(filepath.Join("testdata", "ai_db_snapshot_expectations.json"))
	if err != nil {
		t.Fatalf("read database expectation fixture: %v", err)
	}
	var expected dbSnapshotExpectation
	if err := json.Unmarshal(raw, &expected); err != nil {
		t.Fatalf("decode database expectation fixture: %v", err)
	}
	if configuredID := strings.TrimSpace(os.Getenv("AI_EVAL_RESTAURANT_ID")); configuredID != "" {
		id, err := strconv.ParseUint(configuredID, 10, 32)
		if err != nil {
			t.Fatalf("parse AI_EVAL_RESTAURANT_ID: %v", err)
		}
		expected.RestaurantID = uint(id)
	}

	for _, key := range []string{"DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Skipf("database evaluation enabled, but %s is not configured", key)
		}
	}
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Bangkok",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open evaluation database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("open database pool: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	return ProvideAIService(repository.NewAIRepository(db)), expected
}

func TestDatabaseBackedSnapshotMatchesPreparedDemo(t *testing.T) {
	svc, expected := dbEvaluationServiceOrSkip(t)
	snapshot, err := svc.buildSnapshot(expected.RestaurantID)
	if err != nil {
		t.Fatalf("build database-backed snapshot: %v", err)
	}

	if snapshot.InventorySummary.TotalItems < expected.MinimumTotalIngredients {
		t.Fatalf("snapshot total ingredients = %d, want at least %d", snapshot.InventorySummary.TotalItems, expected.MinimumTotalIngredients)
	}
	if snapshot.InventorySummary.LowItems < expected.MinimumLowItems {
		t.Fatalf("snapshot low stock count = %d, want at least %d", snapshot.InventorySummary.LowItems, expected.MinimumLowItems)
	}

	risks := make(map[string]AIStockRisk, len(snapshot.StockRisks))
	for _, item := range snapshot.StockRisks {
		risks[item.Name] = item
	}
	for _, name := range expected.RequiredStockRisks {
		item, ok := risks[name]
		if !ok {
			t.Fatalf("snapshot is missing required stock risk %q", name)
		}
		if strings.TrimSpace(item.Category) == "" {
			t.Fatalf("stock risk %q is missing its ingredient category", name)
		}
	}

	if len(snapshot.LowMarginMenus) == 0 {
		t.Fatal("snapshot low_margin_menus is empty")
	}
	lowest := snapshot.LowMarginMenus[0]
	if lowest.MenuName != expected.LowestMarginMenu {
		t.Fatalf("lowest margin menu = %q, want %q", lowest.MenuName, expected.LowestMarginMenu)
	}
	if lowest.Margin > expected.LowestMarginMax {
		t.Fatalf("lowest margin for %q = %.2f, want no more than %.2f", lowest.MenuName, lowest.Margin, expected.LowestMarginMax)
	}
	if !snapshot.AnalysisReadiness.CanAnalyzeRevenue || !snapshot.AnalysisReadiness.CanAnalyzeMargin || !snapshot.AnalysisReadiness.CanRecommendActions {
		t.Fatalf("prepared demo readiness = %+v, want complete analytical readiness", snapshot.AnalysisReadiness)
	}
	if snapshot.AnalysisReadiness.MarginCostCoveragePercent != 100 || snapshot.AnalysisReadiness.MenuRecipeCoveragePercent != 100 {
		t.Fatalf("prepared demo coverage = %.2f/%.2f, want 100/100", snapshot.AnalysisReadiness.MarginCostCoveragePercent, snapshot.AnalysisReadiness.MenuRecipeCoveragePercent)
	}
}

func TestLiveAnalyticalResponseUsesDatabaseSnapshot(t *testing.T) {
	if os.Getenv("AI_EVAL_ENABLED") != "1" {
		t.Skip("set AI_EVAL_ENABLED=1 together with AI_DB_EVAL_ENABLED=1 to evaluate a live analytical answer")
	}
	svc, expected := dbEvaluationServiceOrSkip(t)
	if len(svc.getGroqKeys()) == 0 && len(svc.getGeminiKeys()) == 0 {
		t.Skip("live analytical evaluation enabled, but no GROQ/GEMINI API key is configured")
	}

	response, err := svc.AskOperations(expected.RestaurantID, &AIAskRequest{
		Question: "เมนูไหนมี Margin ต่ำที่สุดจากข้อมูลที่มี และควรตรวจสอบอะไรเป็นอันดับแรก",
	})
	if err != nil {
		t.Fatalf("AskOperations analytical flow: %v", err)
	}
	if response.Intent != AIIntentAnalysis {
		t.Fatalf("analytical response intent = %q, want %q", response.Intent, AIIntentAnalysis)
	}
	if !strings.Contains(response.Answer, expected.LowestMarginMenu) {
		t.Fatalf("analytical answer does not mention lowest margin menu %q: %s", expected.LowestMarginMenu, response.Answer)
	}
	if len(response.Snapshot.LowMarginMenus) == 0 || response.Snapshot.LowMarginMenus[0].MenuName != expected.LowestMarginMenu {
		t.Fatalf("analytical response snapshot does not expose lowest margin menu %q", expected.LowestMarginMenu)
	}
}
