package repository

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"

	"gorm.io/gorm"
)

func TestAIActionConfirmationTokenIsRandomOpaqueAndOnlyHashIsStored(t *testing.T) {
	source := bytes.NewReader(bytes.Repeat([]byte{0x5a}, aiActionConfirmationTokenBytes))
	token, storedHash, err := generateAIActionConfirmationToken(source)
	if err != nil {
		t.Fatalf("generateAIActionConfirmationToken() error = %v", err)
	}
	if len(token) != 43 {
		t.Fatalf("base64url token length = %d, want 43", len(token))
	}
	if len(storedHash) != sha256.Size {
		t.Fatalf("stored hash length = %d, want %d", len(storedHash), sha256.Size)
	}
	presentedHash, err := hashPresentedAIActionToken(token)
	if err != nil {
		t.Fatalf("hashPresentedAIActionToken() error = %v", err)
	}
	if !aiActionConfirmationTokenMatches(storedHash, presentedHash) {
		t.Fatal("valid confirmation token did not match its SHA-256 hash")
	}
	wrongHash, _ := hashPresentedAIActionToken(token + "x")
	if aiActionConfirmationTokenMatches(storedHash, wrongHash) {
		t.Fatal("wrong confirmation token matched")
	}
	if bytes.Contains(storedHash, []byte(token)) {
		t.Fatal("stored hash contains the plaintext token")
	}
}

func TestBuildSetMenuAvailabilityPreviewSnapshotsCurrentStateAndFixedTTL(t *testing.T) {
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	menuUpdatedAt := now.Add(-time.Minute)
	menuItem := &entity.MenuItem{
		RestaurantID: 7,
		Name:         "ต้มยำกุ้ง",
		IsAvailable:  true,
	}
	menuItem.ID = 41
	menuItem.UpdatedAt = menuUpdatedAt
	hash := bytes.Repeat([]byte{0x2a}, sha256.Size)
	conversationID := "conversation-1"
	turnID := "turn-1"

	preview := buildSetMenuAvailabilityPreview(
		"preview-1", 7, 11, &conversationID, &turnID, menuItem, false, hash, now,
	)
	if preview.ActionType != entity.AIActionTypeSetMenuAvailability || preview.Status != entity.AIActionPreviewStatusPending {
		t.Fatalf("preview action/status = %q/%q", preview.ActionType, preview.Status)
	}
	if preview.TargetMenuItemID != 41 || preview.TargetMenuItemName != "ต้มยำกุ้ง" {
		t.Fatalf("preview target = %d %q", preview.TargetMenuItemID, preview.TargetMenuItemName)
	}
	if !preview.ExpectedAvailability || preview.DesiredAvailability {
		t.Fatalf("availability snapshot = expected %t desired %t", preview.ExpectedAvailability, preview.DesiredAvailability)
	}
	if !preview.ExpectedTargetUpdatedAt.Equal(menuUpdatedAt) {
		t.Fatalf("expected updated_at = %s, want %s", preview.ExpectedTargetUpdatedAt, menuUpdatedAt)
	}
	if !preview.ExpiresAt.Equal(now.Add(1*time.Minute)) || AIActionPreviewTTL != 1*time.Minute {
		t.Fatalf("preview expiry = %s, want fixed one-minute TTL", preview.ExpiresAt)
	}
	if &preview.ConfirmationTokenHash[0] == &hash[0] {
		t.Fatal("preview retained caller-owned hash slice")
	}
}

func TestSetMenuAvailabilityPreviewRejectsNoOp(t *testing.T) {
	for _, availability := range []bool{false, true} {
		if err := validateSetMenuAvailabilityChange(availability, availability); !errors.Is(err, ErrAIActionPreviewNoChange) {
			t.Fatalf("same availability %t error = %v, want ErrAIActionPreviewNoChange", availability, err)
		}
		if err := validateSetMenuAvailabilityChange(availability, !availability); err != nil {
			t.Fatalf("real availability change %t -> %t error = %v", availability, !availability, err)
		}
	}
}

func TestAIActionContextIDsRequireValidConversationBeforeTurn(t *testing.T) {
	if _, _, err := normalizeAIActionContextIDs("", "turn-1"); err == nil {
		t.Fatal("turn without conversation was accepted")
	}
	if _, _, err := normalizeAIActionContextIDs("conversation/1", ""); err == nil {
		t.Fatal("invalid conversation id was accepted")
	}
	conversationID, turnID, err := normalizeAIActionContextIDs(" conversation-1 ", " turn-1 ")
	if err != nil {
		t.Fatalf("normalizeAIActionContextIDs() error = %v", err)
	}
	if conversationID == nil || *conversationID != "conversation-1" || turnID == nil || *turnID != "turn-1" {
		t.Fatalf("normalized context ids = %v/%v", conversationID, turnID)
	}
}

func TestAIActionResultJSONIsObjectAndBounded(t *testing.T) {
	if got, err := marshalAIActionResultJSON(map[string]interface{}{"ok": true}); err != nil || got != `{"ok":true}` {
		t.Fatalf("compact result = %q, %v", got, err)
	}
	if _, err := marshalAIActionResultJSON([]string{"not", "an", "object"}); err == nil {
		t.Fatal("array result was accepted")
	}
	if _, err := marshalAIActionResultJSON(map[string]interface{}{"value": strings.Repeat("a", AIActionPreviewResultMaxBytes)}); err == nil {
		t.Fatal("oversized result was accepted")
	}
}

func TestAIActionPreviewCleanupIsBoundedAndKeepsPermanentAuditSeparate(t *testing.T) {
	if AIActionPreviewRetention != 30*24*time.Hour || maxAIActionPreviewCleanupBatch != 500 {
		t.Fatalf("unexpected cleanup policy: retention=%s batch=%d", AIActionPreviewRetention, maxAIActionPreviewCleanupBatch)
	}
	db, capture := dryRunAIConversationRepositoryDB(t)
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	_, err := cleanupAIActionPreviews(db, now, 25)
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("CleanupActionPreviews() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements,
		"update ai_action_previews", "confirmation_window_expired", "limit", "for update skip locked",
		"delete from ai_action_previews", "completed_at",
	)
	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	if strings.Contains(joined, "restaurant_audit_logs") {
		t.Fatal("preview cleanup must not delete permanent audit records")
	}
}

func TestAIActionPreviewQueriesUseOwnerTenantScopeAndRowLocks(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)

	capture.statements = nil
	err := lockAIActionOwnerScope(db, 7, 11)
	if err != nil && !errors.Is(err, ErrAIActionPreviewNotFound) && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("lockAIActionOwnerScope() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements, "restaurants", "owner_id", "for share")

	capture.statements = nil
	_, err = lockAIActionPreview(db, 7, 11, "preview-1")
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("lockAIActionPreview() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id", "for update")

	capture.statements = nil
	_, err = lockAIActionMenuItem(db, 7, 41)
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("lockAIActionMenuItem() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements, "restaurant_id", "for update")

	capture.statements = nil
	repo := NewAIActionPreviewRepository(db)
	_, err = repo.FindPreview(7, 11, "preview-1")
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) && !errors.Is(err, ErrAIActionPreviewNotFound) {
		t.Fatalf("FindPreview() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements, "restaurants", "owner_id", "restaurant_id", "owner_user_id")
}

func TestMenuAvailabilityWriteIsNarrowAndOptimisticallyScoped(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	preview := &entity.AIActionPreview{
		RestaurantID:            7,
		TargetMenuItemID:        41,
		ExpectedAvailability:    true,
		DesiredAvailability:     false,
		ExpectedTargetUpdatedAt: now.Add(-time.Minute),
	}

	_, err := updateAIActionMenuAvailability(db, preview, now)
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("updateAIActionMenuAvailability() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements, "restaurant_id", "is_available", "updated_at")
	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	for _, forbidden := range []string{"category_id", "price", "image_url", "description", "display_order", "name="} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("narrow availability update unexpectedly writes %q:\n%s", forbidden, joined)
		}
	}
}

func TestFinalizeAIActionPreviewRequiresPendingOwnerScopedRow(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	preview := &entity.AIActionPreview{ID: "preview-1", RestaurantID: 7, OwnerUserID: 11}

	err := finalizeAIActionPreview(db, preview, entity.AIActionPreviewStatusExecuted, map[string]interface{}{"ok": true}, now)
	if err != nil && !errors.Is(err, ErrAIActionPreviewInvalidState) && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("finalizeAIActionPreview() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id", "status", "pending")
}

func requireAIActionSQLFragments(t *testing.T, statements []string, fragments ...string) {
	t.Helper()
	joined := strings.ToLower(strings.Join(statements, "\n"))
	for _, fragment := range fragments {
		if !strings.Contains(joined, strings.ToLower(fragment)) {
			t.Fatalf("generated AI action SQL does not contain %q:\n%s", fragment, joined)
		}
	}
}
