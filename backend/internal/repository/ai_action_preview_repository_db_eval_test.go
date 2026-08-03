//go:build ai_eval

package repository

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// actionPreviewScenarioDBOrSkip is deliberately double-gated because this
// scenario writes real rows. Every row is created inside one outer transaction
// that the test always rolls back; it never calls an AI provider.
func actionPreviewScenarioDBOrSkip(t *testing.T) *gorm.DB {
	t.Helper()
	if strings.TrimSpace(os.Getenv("AI_EVAL_ENABLED")) != "1" ||
		strings.TrimSpace(os.Getenv("AI_DB_SCENARIO_EVAL_ENABLED")) != "1" {
		t.Skip("set AI_EVAL_ENABLED=1 and AI_DB_SCENARIO_EVAL_ENABLED=1 to run the rollback-only PostgreSQL action scenario")
	}
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	for _, key := range []string{"DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Skipf("action scenario enabled, but %s is not configured", key)
		}
	}
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Bangkok",
		os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"), os.Getenv("DB_PORT"),
	)
	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open PostgreSQL action scenario: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("open PostgreSQL action scenario pool: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	return database
}

func TestPostgresAIActionPreviewConfirmReplayStaleExpiryAndCleanup(t *testing.T) {
	database := actionPreviewScenarioDBOrSkip(t)
	if !database.Migrator().HasTable(&entity.AIActionPreview{}) {
		t.Fatal("ai_action_previews is missing; run schema migration v9 before the scenario")
	}
	if !database.Migrator().HasIndex(&entity.AIActionPreview{}, "idx_ai_action_previews_completed_at") {
		t.Fatal("ai_action_previews completed_at retention index is missing")
	}
	for _, relationship := range []string{"Restaurant", "Owner", "Conversation", "Turn", "TargetMenuItem"} {
		if !database.Migrator().HasConstraint(&entity.AIActionPreview{}, relationship) {
			t.Fatalf("ai_action_previews relationship constraint %q is missing", relationship)
		}
	}

	tx := database.Begin()
	if tx.Error != nil {
		t.Fatalf("begin PostgreSQL action scenario: %v", tx.Error)
	}
	t.Cleanup(func() {
		if err := tx.Rollback().Error; err != nil && !strings.Contains(err.Error(), "already been committed or rolled back") {
			t.Errorf("rollback PostgreSQL action scenario: %v", err)
		}
	})

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	owner := entity.User{
		Email: "ai-action-owner-" + suffix + "@example.invalid", AuthProvider: "local",
		FirstName: "AI", LastName: "Owner", Status: "active",
	}
	otherUser := entity.User{
		Email: "ai-action-other-" + suffix + "@example.invalid", AuthProvider: "local",
		FirstName: "AI", LastName: "Other", Status: "active",
	}
	for _, value := range []interface{}{&owner, &otherUser} {
		if err := tx.Create(value).Error; err != nil {
			t.Fatalf("create PostgreSQL action scenario user: %v", err)
		}
	}
	restaurant := entity.Restaurant{Name: "[AI ACTION TEST] " + suffix, OwnerID: owner.ID}
	if err := tx.Omit("Owner").Create(&restaurant).Error; err != nil {
		t.Fatalf("create PostgreSQL action scenario restaurant: %v", err)
	}
	category := entity.Category{RestaurantID: restaurant.ID, Name: "AI Action " + suffix, IsActive: true}
	if err := tx.Omit("Restaurant").Create(&category).Error; err != nil {
		t.Fatalf("create PostgreSQL action scenario category: %v", err)
	}
	menu := entity.MenuItem{
		RestaurantID: restaurant.ID, CategoryID: category.ID, Name: "Pad Thai " + suffix,
		Price: 100, IsAvailable: true,
	}
	if err := tx.Omit("Restaurant", "Category", "Categories", "OptionGroups", "Ingredients").Create(&menu).Error; err != nil {
		t.Fatalf("create PostgreSQL action scenario menu: %v", err)
	}

	baseTime := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	repo := NewAIActionPreviewRepository(tx)
	repo.now = func() time.Time { return baseTime }
	preview, token, err := repo.CreateSetMenuAvailabilityPreview(CreateSetMenuAvailabilityPreviewParams{
		RestaurantID: restaurant.ID, OwnerUserID: owner.ID, TargetMenuItemID: menu.ID,
		DesiredAvailability: false,
	})
	if err != nil {
		t.Fatalf("create PostgreSQL action preview: %v", err)
	}
	if token == "" || strings.Contains(string(preview.ConfirmationTokenHash), token) {
		t.Fatal("PostgreSQL action preview did not keep a one-way token boundary")
	}
	if _, _, err := repo.ConfirmSetMenuAvailability(restaurant.ID, otherUser.ID, preview.ID, token); !errors.Is(err, ErrAIActionPreviewNotFound) {
		t.Fatalf("wrong owner confirmation error = %v", err)
	}
	if _, _, err := repo.ConfirmSetMenuAvailability(restaurant.ID, owner.ID, preview.ID, token+"-wrong"); !errors.Is(err, ErrAIActionPreviewInvalidToken) {
		t.Fatalf("wrong token confirmation error = %v", err)
	}

	executed, replayed, err := repo.ConfirmSetMenuAvailability(restaurant.ID, owner.ID, preview.ID, token)
	if err != nil || replayed || executed.Status != entity.AIActionPreviewStatusExecuted {
		t.Fatalf("first PostgreSQL confirmation = preview %+v replayed=%v err=%v", executed, replayed, err)
	}
	var refreshed entity.MenuItem
	if err := tx.First(&refreshed, menu.ID).Error; err != nil || refreshed.IsAvailable {
		t.Fatalf("confirmed menu availability = %v err=%v", refreshed.IsAvailable, err)
	}
	if _, replayed, err = repo.ConfirmSetMenuAvailability(restaurant.ID, owner.ID, preview.ID, token); err != nil || !replayed {
		t.Fatalf("PostgreSQL replay = %v err=%v", replayed, err)
	}
	var auditCount int64
	if err := tx.Model(&entity.RestaurantAuditLog{}).
		Where("restaurant_id = ? AND action = ? AND details::text LIKE ?", restaurant.ID, entity.AuditActionAISetMenuAvailability, "%"+preview.ID+"%").
		Count(&auditCount).Error; err != nil || auditCount != 1 {
		t.Fatalf("PostgreSQL action audit count = %d err=%v", auditCount, err)
	}

	repo.now = func() time.Time { return baseTime.Add(time.Minute) }
	stalePreview, staleToken, err := repo.CreateSetMenuAvailabilityPreview(CreateSetMenuAvailabilityPreviewParams{
		RestaurantID: restaurant.ID, OwnerUserID: owner.ID, TargetMenuItemID: menu.ID,
		DesiredAvailability: true,
	})
	if err != nil {
		t.Fatalf("create stale PostgreSQL action preview: %v", err)
	}
	if err := tx.Model(&entity.MenuItem{}).Where("id = ?", menu.ID).
		Updates(map[string]interface{}{"name": menu.Name + " changed", "updated_at": baseTime.Add(90 * time.Second)}).Error; err != nil {
		t.Fatalf("change PostgreSQL action target: %v", err)
	}
	repo.now = func() time.Time { return baseTime.Add(2 * time.Minute) }
	stale, _, err := repo.ConfirmSetMenuAvailability(restaurant.ID, owner.ID, stalePreview.ID, staleToken)
	if !errors.Is(err, ErrAIActionPreviewStale) || stale.Status != entity.AIActionPreviewStatusStale {
		t.Fatalf("stale PostgreSQL confirmation = preview %+v err=%v", stale, err)
	}

	repo.now = func() time.Time { return baseTime.Add(3 * time.Minute) }
	expiring, expiringToken, err := repo.CreateSetMenuAvailabilityPreview(CreateSetMenuAvailabilityPreviewParams{
		RestaurantID: restaurant.ID, OwnerUserID: owner.ID, TargetMenuItemID: menu.ID,
		DesiredAvailability: true,
	})
	if err != nil {
		t.Fatalf("create expiring PostgreSQL action preview: %v", err)
	}
	repo.now = func() time.Time { return baseTime.Add(9 * time.Minute) }
	expired, _, err := repo.ConfirmSetMenuAvailability(restaurant.ID, owner.ID, expiring.ID, expiringToken)
	if !errors.Is(err, ErrAIActionPreviewExpired) || expired.Status != entity.AIActionPreviewStatusExpired {
		t.Fatalf("expired PostgreSQL confirmation = preview %+v err=%v", expired, err)
	}

	repo.now = func() time.Time { return baseTime.Add(AIActionPreviewRetention + 24*time.Hour) }
	if _, err := repo.CleanupActionPreviews(20); err != nil {
		t.Fatalf("cleanup PostgreSQL action previews: %v", err)
	}
	var remaining int64
	if err := tx.Model(&entity.AIActionPreview{}).
		Where("id IN ?", []string{preview.ID, stalePreview.ID, expiring.ID}).
		Count(&remaining).Error; err != nil || remaining != 0 {
		t.Fatalf("retained old PostgreSQL action previews = %d err=%v", remaining, err)
	}
	if err := tx.Model(&entity.RestaurantAuditLog{}).
		Where("restaurant_id = ? AND action = ?", restaurant.ID, entity.AuditActionAISetMenuAvailability).
		Count(&auditCount).Error; err != nil || auditCount != 1 {
		t.Fatalf("permanent PostgreSQL action audit after cleanup = %d err=%v", auditCount, err)
	}
}
