package service

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"Project-M/config"
	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const orderDBIntegrationFlag = "ORDER_DB_INTEGRATION_ENABLED"

var orderVoidTestSchemaPattern = regexp.MustCompile(`^order_void_test_[0-9]+$`)

type orderVoidDBScenario struct {
	db         *gorm.DB
	service    *OrderService
	restaurant entity.Restaurant
	user       entity.User
	menu       entity.MenuItem
}

func orderVoidIntegrationDBOrSkip(t *testing.T) *gorm.DB {
	t.Helper()
	if os.Getenv(orderDBIntegrationFlag) != "1" {
		t.Skip("set " + orderDBIntegrationFlag + "=1 to run PostgreSQL order transaction tests")
	}

	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	for _, key := range []string{"DB_HOST", "DB_USER", "DB_NAME"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Fatalf("%s is required for PostgreSQL order transaction tests", key)
		}
	}

	port := strings.TrimSpace(os.Getenv("DB_PORT"))
	if port == "" {
		port = "5432"
	}
	sslMode := strings.TrimSpace(os.Getenv("DB_SSLMODE"))
	if sslMode == "" {
		sslMode = "disable"
	}
	databaseURL := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD")),
		Host:   net.JoinHostPort(os.Getenv("DB_HOST"), port),
		Path:   "/" + os.Getenv("DB_NAME"),
	}
	query := databaseURL.Query()
	query.Set("sslmode", sslMode)
	databaseURL.RawQuery = query.Encode()

	baseDB, err := gorm.Open(postgres.Open(databaseURL.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("open PostgreSQL order integration database")
	}
	baseSQLDB, err := baseDB.DB()
	if err != nil {
		t.Fatal("access PostgreSQL order integration connection pool")
	}
	t.Cleanup(func() { _ = baseSQLDB.Close() })

	schemaName := fmt.Sprintf("order_void_test_%d", time.Now().UnixNano())
	if !orderVoidTestSchemaPattern.MatchString(schemaName) {
		t.Fatalf("unsafe temporary order test schema name %q", schemaName)
	}
	if err := baseDB.Exec(`CREATE SCHEMA "` + schemaName + `"`).Error; err != nil {
		t.Fatal("create isolated PostgreSQL order integration schema")
	}
	t.Cleanup(func() {
		if err := baseDB.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error; err != nil {
			t.Error("drop isolated PostgreSQL order integration schema")
		}
	})

	query.Set("search_path", schemaName)
	databaseURL.RawQuery = query.Encode()
	testDB, err := gorm.Open(postgres.Open(databaseURL.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("open isolated PostgreSQL order integration schema")
	}
	testSQLDB, err := testDB.DB()
	if err != nil {
		t.Fatal("access isolated PostgreSQL order integration connection pool")
	}
	testSQLDB.SetMaxOpenConns(8)
	t.Cleanup(func() { _ = testSQLDB.Close() })

	if err := testDB.AutoMigrate(config.SchemaModels()...); err != nil {
		t.Fatal("migrate isolated PostgreSQL order integration schema")
	}
	return testDB
}

func newOrderVoidDBScenario(t *testing.T, db *gorm.DB) *orderVoidDBScenario {
	t.Helper()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	scenario := &orderVoidDBScenario{db: db}
	scenario.user = entity.User{
		Email:        "order-void-" + suffix + "@example.invalid",
		AuthProvider: "local",
		FirstName:    "Order",
		LastName:     "Tester",
		Status:       "active",
	}
	mustCreateOrderVoidRow(t, db, &scenario.user)
	scenario.restaurant = entity.Restaurant{Name: "Order void " + suffix, OwnerID: scenario.user.ID}
	mustCreateOrderVoidRow(t, db, &scenario.restaurant)
	category := entity.Category{RestaurantID: scenario.restaurant.ID, Name: "Void tests", IsActive: true}
	mustCreateOrderVoidRow(t, db, &category)
	scenario.menu = entity.MenuItem{
		RestaurantID: scenario.restaurant.ID,
		CategoryID:   category.ID,
		Name:         "Void item",
		Price:        100,
		IsAvailable:  true,
	}
	mustCreateOrderVoidRow(t, db, &scenario.menu)
	scenario.service = ProvideOrderService(repository.NewOrderRepository(db))
	return scenario
}

func mustCreateOrderVoidRow(t *testing.T, db *gorm.DB, value any) {
	t.Helper()
	if err := db.Create(value).Error; err != nil {
		t.Fatalf("create order void integration row: %T", value)
	}
}

func (s *orderVoidDBScenario) orderWithItems(t *testing.T, orderType string, statuses ...string) (entity.Order, []entity.OrderItem) {
	t.Helper()
	now := repository.BangkokNow()
	order := entity.Order{
		RestaurantID:  s.restaurant.ID,
		OrderType:     orderType,
		OrderNumber:   fmt.Sprintf("VOID-%d", now.UnixNano()),
		OrderDate:     now.Format("2006-01-02"),
		StaffID:       s.user.ID,
		CustomerCount: 1,
		Status:        entity.OrderStatusCooking,
		Subtotal:      float64(len(statuses)) * s.menu.Price,
		TotalAmount:   float64(len(statuses)) * s.menu.Price,
		GrandTotal:    float64(len(statuses)) * s.menu.Price,
		PaymentStatus: entity.PaymentStatusUnpaid,
		OpenedAt:      now,
		Version:       1,
	}
	mustCreateOrderVoidRow(t, s.db, &order)

	items := make([]entity.OrderItem, 0, len(statuses))
	for index, status := range statuses {
		item := entity.OrderItem{
			OrderID:         order.ID,
			RestaurantID:    s.restaurant.ID,
			MenuID:          s.menu.ID,
			MenuName:        fmt.Sprintf("Void item %d", index+1),
			UnitPrice:       s.menu.Price,
			Quantity:        1,
			Subtotal:        s.menu.Price,
			FulfillmentType: orderType,
			Status:          status,
		}
		if status != entity.OrderItemStatusPending {
			item.SentAt = &now
			item.KitchenBatch = 1
		}
		mustCreateOrderVoidRow(t, s.db, &item)
		items = append(items, item)
	}
	return order, items
}

func TestWaiterVoidRechecksPendingItemsAfterConcurrentOrderMutation(t *testing.T) {
	db := orderVoidIntegrationDBOrSkip(t)
	scenario := newOrderVoidDBScenario(t, db)
	order, items := scenario.orderWithItems(t, entity.OrderTypeTakeaway, entity.OrderItemStatusCooking)

	concurrentTx := db.Begin()
	if concurrentTx.Error != nil {
		t.Fatal("begin concurrent add-item transaction")
	}
	lockedOrder, err := repository.NewOrderRepository(concurrentTx).FindOrderForUpdate(scenario.restaurant.ID, order.ID)
	if err != nil || lockedOrder.ID != order.ID {
		_ = concurrentTx.Rollback().Error
		t.Fatal("lock order before concurrent add-item mutation")
	}
	pending := entity.OrderItem{
		OrderID:         order.ID,
		RestaurantID:    scenario.restaurant.ID,
		MenuID:          scenario.menu.ID,
		MenuName:        "Concurrent pending item",
		UnitPrice:       scenario.menu.Price,
		Quantity:        1,
		Subtotal:        scenario.menu.Price,
		FulfillmentType: entity.OrderItemFulfillmentTakeaway,
		Status:          entity.OrderItemStatusPending,
	}
	if err := concurrentTx.Create(&pending).Error; err != nil {
		_ = concurrentTx.Rollback().Error
		t.Fatal("insert concurrent pending item")
	}

	result := make(chan error, 1)
	go func() {
		_, updateErr := scenario.service.UpdateItemStatus(
			scenario.restaurant.ID,
			scenario.user.ID,
			order.ID,
			items[0].ID,
			entity.OrderItemStatusCancelled,
			"customer changed order",
			OrderItemStatusActorFrontOfHouse,
		)
		result <- updateErr
	}()

	select {
	case err := <-result:
		_ = concurrentTx.Rollback().Error
		t.Fatalf("waiter void returned before the competing order transaction completed: %v", err)
	case <-time.After(150 * time.Millisecond):
	}
	if err := concurrentTx.Commit().Error; err != nil {
		t.Fatal("commit concurrent pending item")
	}

	select {
	case err := <-result:
		if !errors.Is(err, ErrOrderItemStatusForbidden) {
			t.Fatalf("waiter void error = %v, want authorization failure", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("waiter void did not resume after competing order transaction committed")
	}

	var target entity.OrderItem
	if err := db.First(&target, items[0].ID).Error; err != nil {
		t.Fatal("reload target order item")
	}
	if target.Status != entity.OrderItemStatusCooking {
		t.Fatalf("target status = %q, want cooking after rejected void", target.Status)
	}

	updated, err := scenario.service.UpdateItemStatus(
		scenario.restaurant.ID,
		scenario.user.ID,
		order.ID,
		items[0].ID,
		entity.OrderItemStatusCancelled,
		"manager-approved void",
		OrderItemStatusActorKitchenManager,
	)
	if err != nil {
		t.Fatalf("kitchen manager void with a pending item: %v", err)
	}
	if updated.Items[0].Status != entity.OrderItemStatusCancelled {
		t.Fatalf("manager void target status = %q, want cancelled", updated.Items[0].Status)
	}
}

func TestCancellingLastTakeawayItemClosesOrderTransactionally(t *testing.T) {
	db := orderVoidIntegrationDBOrSkip(t)
	scenario := newOrderVoidDBScenario(t, db)
	order, items := scenario.orderWithItems(t, entity.OrderTypeTakeaway, entity.OrderItemStatusCooking)

	updated, err := scenario.service.UpdateItemStatus(
		scenario.restaurant.ID,
		scenario.user.ID,
		order.ID,
		items[0].ID,
		entity.OrderItemStatusCancelled,
		"customer cancelled takeaway",
		OrderItemStatusActorFrontOfHouse,
	)
	if err != nil {
		t.Fatalf("cancel last takeaway item: %v", err)
	}
	if updated.Status != entity.OrderStatusCancelled || updated.ClosedAt == nil {
		t.Fatalf("takeaway order state = status %q closed_at %v, want cancelled with close time", updated.Status, updated.ClosedAt)
	}
	if updated.Subtotal != 0 || updated.TotalAmount != 0 || updated.GrandTotal != 0 {
		t.Fatalf("takeaway totals = %.2f/%.2f/%.2f, want zero", updated.Subtotal, updated.TotalAmount, updated.GrandTotal)
	}

	var logs int64
	if err := db.Model(&entity.OrderStatusLog{}).
		Where("order_id = ? AND to_status = ?", order.ID, entity.OrderStatusCancelled).
		Count(&logs).Error; err != nil {
		t.Fatal("count takeaway closure status logs")
	}
	if logs != 1 {
		t.Fatalf("takeaway cancellation status logs = %d, want 1", logs)
	}
}
