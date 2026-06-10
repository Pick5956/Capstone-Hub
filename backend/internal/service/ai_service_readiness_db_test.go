//go:build ai_eval

package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func readinessScenarioDBOrSkip(t *testing.T) *gorm.DB {
	t.Helper()
	if os.Getenv("AI_DB_SCENARIO_EVAL_ENABLED") != "1" {
		t.Skip("set AI_DB_SCENARIO_EVAL_ENABLED=1 to run rollback-only readiness scenarios")
	}

	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	for _, key := range []string{"DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Skipf("scenario evaluation enabled, but %s is not configured", key)
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
		t.Fatalf("open scenario database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("open scenario database pool: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	return db
}

type readinessScenario struct {
	db         *gorm.DB
	service    *AIService
	restaurant entity.Restaurant
	user       entity.User
	table      entity.RestaurantTable
	category   entity.Category
	ingredient entity.Ingredient
	orderSeq   int
}

func newReadinessScenario(t *testing.T, db *gorm.DB, name string) *readinessScenario {
	t.Helper()
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin %s scenario transaction: %v", name, tx.Error)
	}
	t.Cleanup(func() {
		if err := tx.Rollback().Error; err != nil && !strings.Contains(err.Error(), "already been committed or rolled back") {
			t.Errorf("rollback %s scenario: %v", name, err)
		}
	})

	scenario := &readinessScenario{db: tx, service: ProvideAIService(repository.NewAIRepository(tx))}
	suffix := fmt.Sprintf("%s-%d", strings.ReplaceAll(name, " ", "-"), time.Now().UnixNano())
	scenario.user = entity.User{
		Email:        fmt.Sprintf("ai-scenario-%s@example.invalid", suffix),
		AuthProvider: "local",
		FirstName:    "AI",
		LastName:     "Scenario",
		Status:       "active",
	}
	mustCreate(t, tx, &scenario.user)
	scenario.restaurant = entity.Restaurant{Name: "[AI TEST] " + name, OwnerID: scenario.user.ID}
	mustCreate(t, tx, &scenario.restaurant)
	scenario.table = entity.RestaurantTable{
		RestaurantID:  scenario.restaurant.ID,
		TableNumber:   "T1",
		DisplayLabel:  "T1",
		Status:        entity.TableStatusFree,
		CustomerToken: "ai-scenario-" + suffix,
	}
	mustCreate(t, tx, &scenario.table)
	scenario.category = entity.Category{RestaurantID: scenario.restaurant.ID, Name: "Scenario Menu", IsActive: true}
	mustCreate(t, tx, &scenario.category)
	scenario.ingredient = entity.Ingredient{
		RestaurantID: scenario.restaurant.ID,
		Name:         "Scenario Ingredient",
		Unit:         "g",
		BaseUnit:     "g",
		Stock:        1000,
		MinStock:     100,
		CostPerUnit:  1,
		YieldPercent: 100,
		StorageType:  "room_temp",
	}
	mustCreate(t, tx, &scenario.ingredient)
	return scenario
}

func mustCreate(t *testing.T, db *gorm.DB, value any) {
	t.Helper()
	if err := db.Create(value).Error; err != nil {
		t.Fatalf("create scenario row: %v", err)
	}
}

func (s *readinessScenario) menu(t *testing.T, name string, withRecipe bool) entity.MenuItem {
	t.Helper()
	menu := entity.MenuItem{
		RestaurantID: s.restaurant.ID,
		CategoryID:   s.category.ID,
		Name:         name,
		Price:        100,
		IsAvailable:  true,
	}
	mustCreate(t, s.db, &menu)
	if withRecipe {
		mustCreate(t, s.db, &entity.MenuItemIngredient{
			RestaurantID: s.restaurant.ID,
			MenuItemID:   menu.ID,
			IngredientID: s.ingredient.ID,
			Quantity:     10,
			Unit:         "g",
		})
	}
	return menu
}

func (s *readinessScenario) soldItem(t *testing.T, menu entity.MenuItem, status string, withDeduction bool) {
	t.Helper()
	s.orderSeq++
	now := repository.BangkokNow().Add(-time.Duration(s.orderSeq) * time.Minute)
	tableID := s.table.ID
	order := entity.Order{
		RestaurantID:  s.restaurant.ID,
		TableID:       &tableID,
		OrderType:     entity.OrderTypeDineIn,
		OrderNumber:   fmt.Sprintf("SC-%03d", s.orderSeq),
		OrderDate:     now.Format("2006-01-02"),
		StaffID:       s.user.ID,
		CustomerCount: 1,
		Status:        entity.OrderStatusServed,
		Subtotal:      menu.Price,
		TotalAmount:   menu.Price,
		GrandTotal:    menu.Price,
		PaymentStatus: "paid",
		OpenedAt:      now,
		Version:       1,
	}
	mustCreate(t, s.db, &order)
	item := entity.OrderItem{
		OrderID:      order.ID,
		RestaurantID: s.restaurant.ID,
		MenuID:       menu.ID,
		MenuName:     menu.Name,
		UnitPrice:    menu.Price,
		Quantity:     1,
		Subtotal:     menu.Price,
		Status:       status,
	}
	mustCreate(t, s.db, &item)
	if withDeduction {
		mustCreate(t, s.db, &entity.OrderInventoryDeduction{
			RestaurantID: s.restaurant.ID,
			OrderID:      order.ID,
			OrderItemID:  item.ID,
			MenuItemID:   menu.ID,
			IngredientID: s.ingredient.ID,
			Quantity:     10,
			CostSnapshot: 10,
			CreatedByID:  s.user.ID,
		})
	}
}

func TestDatabaseReadinessScenariosRollbackAfterEvaluation(t *testing.T) {
	db := readinessScenarioDBOrSkip(t)

	t.Run("empty restaurant blocks analysis", func(t *testing.T) {
		scenario := newReadinessScenario(t, db, "Empty Restaurant")
		snapshot, err := scenario.service.buildSnapshot(scenario.restaurant.ID)
		if err != nil {
			t.Fatalf("build empty snapshot: %v", err)
		}
		if snapshot.AnalysisReadiness.HasSales || snapshot.AnalysisReadiness.CanAnalyzeMargin {
			t.Fatalf("empty scenario readiness = %+v, want no analysis", snapshot.AnalysisReadiness)
		}
	})

	t.Run("served sale without deduction blocks margin", func(t *testing.T) {
		scenario := newReadinessScenario(t, db, "Missing Costs")
		menu := scenario.menu(t, "Uncosted Menu", true)
		scenario.soldItem(t, menu, entity.OrderItemStatusServed, false)

		snapshot, err := scenario.service.buildSnapshot(scenario.restaurant.ID)
		if err != nil {
			t.Fatalf("build missing-cost snapshot: %v", err)
		}
		if !snapshot.AnalysisReadiness.CanAnalyzeRevenue || snapshot.AnalysisReadiness.CanAnalyzeMargin {
			t.Fatalf("missing-cost readiness = %+v, want revenue only", snapshot.AnalysisReadiness)
		}
		if snapshot.AnalysisReadiness.MarginCostCoveragePercent != 0 {
			t.Fatalf("missing-cost coverage = %.2f, want 0", snapshot.AnalysisReadiness.MarginCostCoveragePercent)
		}
	})

	t.Run("partial recipes and costs block business recommendation", func(t *testing.T) {
		scenario := newReadinessScenario(t, db, "Partial Setup")
		completeMenu := scenario.menu(t, "Complete Menu", true)
		incompleteMenu := scenario.menu(t, "Incomplete Menu", false)
		scenario.soldItem(t, completeMenu, entity.OrderItemStatusServed, true)
		scenario.soldItem(t, incompleteMenu, entity.OrderItemStatusServed, false)

		snapshot, err := scenario.service.buildSnapshot(scenario.restaurant.ID)
		if err != nil {
			t.Fatalf("build partial snapshot: %v", err)
		}
		if snapshot.AnalysisReadiness.MarginCostCoveragePercent != 50 || snapshot.AnalysisReadiness.MenuRecipeCoveragePercent != 50 {
			t.Fatalf("partial coverage = %.2f/%.2f, want 50/50", snapshot.AnalysisReadiness.MarginCostCoveragePercent, snapshot.AnalysisReadiness.MenuRecipeCoveragePercent)
		}
		answer, guarded := localAnalyticalGuardrailAnswer("ควรขึ้นราคาเมนูนี้ไหม", snapshot)
		if !guarded || !strings.Contains(answer, "50%") {
			t.Fatalf("partial scenario guardrail answer = %q, guarded=%t", answer, guarded)
		}
	})

	t.Run("complete data permits margin analysis", func(t *testing.T) {
		scenario := newReadinessScenario(t, db, "Ready Dataset")
		menu := scenario.menu(t, "Ready Menu", true)
		scenario.soldItem(t, menu, entity.OrderItemStatusServed, true)

		snapshot, err := scenario.service.buildSnapshot(scenario.restaurant.ID)
		if err != nil {
			t.Fatalf("build ready snapshot: %v", err)
		}
		if !snapshot.AnalysisReadiness.CanAnalyzeMargin || !snapshot.AnalysisReadiness.CanRecommendActions {
			t.Fatalf("ready scenario readiness = %+v, want full readiness", snapshot.AnalysisReadiness)
		}
		if len(snapshot.LowMarginMenus) != 1 || snapshot.LowMarginMenus[0].MenuName != "Ready Menu" {
			t.Fatalf("ready scenario low margin menus = %+v, want the seeded menu", snapshot.LowMarginMenus)
		}
	})
}
