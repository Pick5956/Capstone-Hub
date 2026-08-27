package repository

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	// One minute: long enough to read a one-line confirm bar and press it, short
	// enough that the countdown ring visibly moves and a forgotten command clears
	// itself quickly rather than lingering as a live write.
	AIActionPreviewTTL                 = 1 * time.Minute
	AIActionPreviewRetention           = 30 * 24 * time.Hour
	AIActionPreviewResultMaxBytes      = 16 * 1024
	aiActionPreviewIDBytes             = 16
	aiActionConfirmationTokenBytes     = 32
	maxAIActionConfirmationTokenLength = 256
	maxAIActionPreviewCleanupBatch     = 500
)

var (
	ErrAIActionPreviewNotFound        = errors.New("AI action preview was not found")
	ErrAIActionPreviewInvalidToken    = errors.New("AI action confirmation token is invalid")
	ErrAIActionPreviewNoChange        = errors.New("AI action would not change menu availability")
	ErrAIActionPreviewExpired         = errors.New("AI action preview has expired")
	ErrAIActionPreviewStale           = errors.New("AI action preview is stale")
	ErrAIActionPreviewCancelled       = errors.New("AI action preview was cancelled")
	ErrAIActionPreviewAlreadyExecuted = errors.New("AI action preview was already executed")
	ErrAIActionPreviewInvalidState    = errors.New("AI action preview has an invalid state")
)

// CreateSetMenuAvailabilityPreviewParams contains only trusted actor/tenant
// scope plus the requested outcome. Current menu state and its update timestamp
// are always read by the repository under a row lock.
type CreateSetMenuAvailabilityPreviewParams struct {
	RestaurantID        uint
	OwnerUserID         uint
	ConversationID      string
	TurnID              string
	TargetMenuItemID    uint
	DesiredAvailability bool
}

type AIActionPreviewRepository struct {
	db     *gorm.DB
	now    func() time.Time
	random io.Reader
}

func NewAIActionPreviewRepository(db *gorm.DB) *AIActionPreviewRepository {
	return &AIActionPreviewRepository{db: db, now: time.Now, random: rand.Reader}
}

// CleanupActionPreviews materializes expired pending records and removes old
// terminal preview rows in bounded batches. The permanent restaurant audit log
// is retained; deleting preview rows after the retention window also releases
// their menu foreign keys.
func (r *AIActionPreviewRepository) CleanupActionPreviews(limit int) (int64, error) {
	if r == nil || r.db == nil {
		return 0, errors.New("AI action preview repository is not connected")
	}
	if limit <= 0 || limit > maxAIActionPreviewCleanupBatch {
		limit = maxAIActionPreviewCleanupBatch
	}
	now := r.currentTime()
	var affected int64
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var err error
		affected, err = cleanupAIActionPreviews(tx, now, limit)
		return err
	})
	return affected, err
}

func cleanupAIActionPreviews(tx *gorm.DB, now time.Time, limit int) (int64, error) {
	cutoff := now.Add(-AIActionPreviewRetention)
	var affected int64
	expired := tx.Exec(`
			UPDATE ai_action_previews
			SET status = ?, result_json = ?::jsonb, completed_at = ?, updated_at = ?
			WHERE id IN (
				SELECT id FROM ai_action_previews
				WHERE status = ? AND expires_at <= ?
				ORDER BY expires_at ASC
				LIMIT ? FOR UPDATE SKIP LOCKED
			)`,
		entity.AIActionPreviewStatusExpired,
		`{"reason":"confirmation_window_expired"}`,
		now,
		now,
		entity.AIActionPreviewStatusPending,
		now,
		limit,
	)
	if expired.Error != nil {
		return 0, expired.Error
	}
	affected += expired.RowsAffected
	remaining := int64(limit) - affected
	if remaining <= 0 {
		return affected, nil
	}

	purged := tx.Exec(`
			DELETE FROM ai_action_previews
			WHERE id IN (
				SELECT id FROM ai_action_previews
				WHERE status IN (?, ?, ?, ?) AND completed_at < ?
				ORDER BY completed_at ASC
				LIMIT ? FOR UPDATE SKIP LOCKED
			)`,
		entity.AIActionPreviewStatusExecuted,
		entity.AIActionPreviewStatusExpired,
		entity.AIActionPreviewStatusStale,
		entity.AIActionPreviewStatusCancelled,
		cutoff,
		remaining,
	)
	if purged.Error != nil {
		return affected, purged.Error
	}
	affected += purged.RowsAffected
	return affected, nil
}

// CreateSetMenuAvailabilityPreview creates a five-minute preview and returns
// its one-time plaintext confirmation token. Only the SHA-256 token digest is
// persisted. Callers must return the token to the authenticated owner without
// logging it.
func (r *AIActionPreviewRepository) CreateSetMenuAvailabilityPreview(params CreateSetMenuAvailabilityPreviewParams) (*entity.AIActionPreview, string, error) {
	if r == nil || r.db == nil {
		return nil, "", errors.New("AI action preview repository is not connected")
	}
	if params.RestaurantID == 0 || params.OwnerUserID == 0 {
		return nil, "", errors.New("AI action preview restaurant and owner are required")
	}
	if params.TargetMenuItemID == 0 {
		return nil, "", errors.New("AI action preview target menu item is required")
	}

	conversationID, turnID, err := normalizeAIActionContextIDs(params.ConversationID, params.TurnID)
	if err != nil {
		return nil, "", err
	}
	previewID, err := generateAIActionOpaqueID(r.random)
	if err != nil {
		return nil, "", err
	}
	confirmationToken, confirmationTokenHash, err := generateAIActionConfirmationToken(r.random)
	if err != nil {
		return nil, "", err
	}

	now := r.currentTime()
	preview := &entity.AIActionPreview{}
	err = r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockAIActionOwnerScope(tx, params.RestaurantID, params.OwnerUserID); err != nil {
			return err
		}
		if err := validateAIActionContextScope(tx, params.RestaurantID, params.OwnerUserID, conversationID, turnID, now); err != nil {
			return err
		}

		menuItem, err := lockAIActionMenuItem(tx, params.RestaurantID, params.TargetMenuItemID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAIActionPreviewNotFound
			}
			return err
		}
		if menuItem.UpdatedAt.IsZero() {
			return errors.New("AI action preview target has no concurrency timestamp")
		}
		if err := validateSetMenuAvailabilityChange(menuItem.IsAvailable, params.DesiredAvailability); err != nil {
			return err
		}

		preview = buildSetMenuAvailabilityPreview(
			previewID,
			params.RestaurantID,
			params.OwnerUserID,
			conversationID,
			turnID,
			menuItem,
			params.DesiredAvailability,
			confirmationTokenHash,
			now,
		)
		return tx.Omit("Restaurant", "Owner", "Conversation", "Turn", "TargetMenuItem").Create(preview).Error
	})
	if err != nil {
		return nil, "", err
	}
	return preview, confirmationToken, nil
}

// ConfirmSetMenuAvailability verifies owner/tenant scope and token before
// inspecting any terminal state. It deliberately does not read feature flags;
// the service must reject the operation before invoking this write repository
// when AI actions are disabled.
//
// replayed is true only when the same valid token confirms an already executed
// preview. In that case the stored result is returned and the menu/audit rows
// are not written again.
func (r *AIActionPreviewRepository) ConfirmSetMenuAvailability(restaurantID, ownerUserID uint, previewID, confirmationToken string) (preview *entity.AIActionPreview, replayed bool, err error) {
	if r == nil || r.db == nil {
		return nil, false, errors.New("AI action preview repository is not connected")
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return nil, false, errors.New("AI action preview restaurant and owner are required")
	}
	previewID, err = normalizeAIActionOpaqueID(previewID)
	if err != nil {
		return nil, false, err
	}
	presentedHash, err := hashPresentedAIActionToken(confirmationToken)
	if err != nil {
		return nil, false, ErrAIActionPreviewInvalidToken
	}

	var outcomeErr error
	err = r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockAIActionOwnerScope(tx, restaurantID, ownerUserID); err != nil {
			return err
		}
		lockedPreview, err := lockAIActionPreview(tx, restaurantID, ownerUserID, previewID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAIActionPreviewNotFound
			}
			return err
		}
		if !aiActionConfirmationTokenMatches(lockedPreview.ConfirmationTokenHash, presentedHash) {
			return ErrAIActionPreviewInvalidToken
		}

		preview = lockedPreview
		switch lockedPreview.Status {
		case entity.AIActionPreviewStatusExecuted:
			replayed = true
			return nil
		case entity.AIActionPreviewStatusExpired:
			outcomeErr = ErrAIActionPreviewExpired
			return nil
		case entity.AIActionPreviewStatusStale:
			outcomeErr = ErrAIActionPreviewStale
			return nil
		case entity.AIActionPreviewStatusCancelled:
			outcomeErr = ErrAIActionPreviewCancelled
			return nil
		case entity.AIActionPreviewStatusPending:
			// Continue below.
		default:
			return ErrAIActionPreviewInvalidState
		}

		now := r.currentTime()
		if !now.Before(lockedPreview.ExpiresAt) {
			if err := finalizeAIActionPreview(tx, lockedPreview, entity.AIActionPreviewStatusExpired, map[string]interface{}{
				"reason": "confirmation_window_expired",
			}, now); err != nil {
				return err
			}
			preview = lockedPreview
			outcomeErr = ErrAIActionPreviewExpired
			return nil
		}

		menuItem, err := lockAIActionMenuItem(tx, restaurantID, lockedPreview.TargetMenuItemID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if finalizeErr := finalizeStaleAIActionPreview(tx, lockedPreview, "target_missing", now); finalizeErr != nil {
					return finalizeErr
				}
				preview = lockedPreview
				outcomeErr = ErrAIActionPreviewStale
				return nil
			}
			return err
		}
		if menuItem.IsAvailable != lockedPreview.ExpectedAvailability || !menuItem.UpdatedAt.Equal(lockedPreview.ExpectedTargetUpdatedAt) {
			if err := finalizeStaleAIActionPreview(tx, lockedPreview, "target_changed_after_preview", now); err != nil {
				return err
			}
			preview = lockedPreview
			outcomeErr = ErrAIActionPreviewStale
			return nil
		}

		if menuItem.IsAvailable != lockedPreview.DesiredAvailability {
			// Only the intended business field and its concurrency timestamp are
			// updated. No caller-provided MenuItem struct can overwrite other data.
			updated, err := updateAIActionMenuAvailability(tx, lockedPreview, now)
			if err != nil {
				return err
			}
			if !updated {
				if err := finalizeStaleAIActionPreview(tx, lockedPreview, "target_changed_during_confirmation", now); err != nil {
					return err
				}
				preview = lockedPreview
				outcomeErr = ErrAIActionPreviewStale
				return nil
			}
		}

		result := map[string]interface{}{
			"action_type":           entity.AIActionTypeSetMenuAvailability,
			"target_menu_item_id":   lockedPreview.TargetMenuItemID,
			"target_menu_item_name": lockedPreview.TargetMenuItemName,
			"previous_availability": lockedPreview.ExpectedAvailability,
			"is_available":          lockedPreview.DesiredAvailability,
			"executed_at":           now.Format(time.RFC3339Nano),
		}
		if err := finalizeAIActionPreview(tx, lockedPreview, entity.AIActionPreviewStatusExecuted, result, now); err != nil {
			return err
		}
		if err := createAIActionAuditLog(tx, lockedPreview, now); err != nil {
			return err
		}
		preview = lockedPreview
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return preview, replayed, outcomeErr
}

// FindPreview returns a preview only inside the authenticated owner and
// restaurant scope. It does not return or reconstruct a confirmation token.
func (r *AIActionPreviewRepository) FindPreview(restaurantID, ownerUserID uint, previewID string) (*entity.AIActionPreview, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("AI action preview repository is not connected")
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return nil, errors.New("AI action preview restaurant and owner are required")
	}
	id, err := normalizeAIActionOpaqueID(previewID)
	if err != nil {
		return nil, err
	}
	var preview entity.AIActionPreview
	if err := r.db.
		Joins("JOIN restaurants ON restaurants.id = ai_action_previews.restaurant_id AND restaurants.owner_id = ? AND restaurants.deleted_at IS NULL", ownerUserID).
		Where("ai_action_previews.id = ? AND ai_action_previews.restaurant_id = ? AND ai_action_previews.owner_user_id = ?", id, restaurantID, ownerUserID).
		First(&preview).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAIActionPreviewNotFound
		}
		return nil, err
	}
	return &preview, nil
}

// CancelPreview makes an unconfirmed preview permanently unusable. Executed
// previews cannot be rewritten as cancelled.
func (r *AIActionPreviewRepository) CancelPreview(restaurantID, ownerUserID uint, previewID string) (preview *entity.AIActionPreview, err error) {
	if r == nil || r.db == nil {
		return nil, errors.New("AI action preview repository is not connected")
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return nil, errors.New("AI action preview restaurant and owner are required")
	}
	id, err := normalizeAIActionOpaqueID(previewID)
	if err != nil {
		return nil, err
	}

	var outcomeErr error
	err = r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockAIActionOwnerScope(tx, restaurantID, ownerUserID); err != nil {
			return err
		}
		lockedPreview, err := lockAIActionPreview(tx, restaurantID, ownerUserID, id)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAIActionPreviewNotFound
			}
			return err
		}
		preview = lockedPreview
		switch lockedPreview.Status {
		case entity.AIActionPreviewStatusPending:
			now := r.currentTime()
			return finalizeAIActionPreview(tx, lockedPreview, entity.AIActionPreviewStatusCancelled, map[string]interface{}{
				"reason": "cancelled_by_owner",
			}, now)
		case entity.AIActionPreviewStatusCancelled:
			outcomeErr = ErrAIActionPreviewCancelled
			return nil
		case entity.AIActionPreviewStatusExecuted:
			outcomeErr = ErrAIActionPreviewAlreadyExecuted
			return nil
		case entity.AIActionPreviewStatusExpired:
			outcomeErr = ErrAIActionPreviewExpired
			return nil
		case entity.AIActionPreviewStatusStale:
			outcomeErr = ErrAIActionPreviewStale
			return nil
		default:
			return ErrAIActionPreviewInvalidState
		}
	})
	if err != nil {
		return nil, err
	}
	return preview, outcomeErr
}

func lockAIActionOwnerScope(db *gorm.DB, restaurantID, ownerUserID uint) error {
	var restaurant entity.Restaurant
	if err := db.
		Clauses(clause.Locking{Strength: "SHARE"}).
		Select("id").
		Where("id = ? AND owner_id = ?", restaurantID, ownerUserID).
		First(&restaurant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAIActionPreviewNotFound
		}
		return err
	}
	return nil
}

func validateAIActionContextScope(tx *gorm.DB, restaurantID, ownerUserID uint, conversationID, turnID *string, now time.Time) error {
	if conversationID == nil {
		return nil
	}
	var conversation entity.AIConversation
	if err := tx.Select("id").
		Where("id = ? AND restaurant_id = ? AND owner_user_id = ? AND expires_at > ?", *conversationID, restaurantID, ownerUserID, now).
		First(&conversation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAIActionPreviewNotFound
		}
		return err
	}
	if turnID == nil {
		return nil
	}
	var turn entity.AIConversationTurn
	if err := tx.Select("id").Where("id = ? AND conversation_id = ?", *turnID, *conversationID).First(&turn).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAIActionPreviewNotFound
		}
		return err
	}
	return nil
}

func validateSetMenuAvailabilityChange(currentAvailability, desiredAvailability bool) error {
	if currentAvailability == desiredAvailability {
		return ErrAIActionPreviewNoChange
	}
	return nil
}

func buildSetMenuAvailabilityPreview(previewID string, restaurantID, ownerUserID uint, conversationID, turnID *string, menuItem *entity.MenuItem, desiredAvailability bool, confirmationTokenHash []byte, now time.Time) *entity.AIActionPreview {
	now = now.UTC()
	return &entity.AIActionPreview{
		ID:                      previewID,
		RestaurantID:            restaurantID,
		OwnerUserID:             ownerUserID,
		ConversationID:          conversationID,
		TurnID:                  turnID,
		ActionType:              entity.AIActionTypeSetMenuAvailability,
		TargetMenuItemID:        menuItem.ID,
		TargetMenuItemName:      menuItem.Name,
		ExpectedAvailability:    menuItem.IsAvailable,
		DesiredAvailability:     desiredAvailability,
		ExpectedTargetUpdatedAt: menuItem.UpdatedAt.UTC(),
		ConfirmationTokenHash:   append([]byte(nil), confirmationTokenHash...),
		Status:                  entity.AIActionPreviewStatusPending,
		ResultJSON:              "{}",
		ExpiresAt:               now.Add(AIActionPreviewTTL),
		CreatedAt:               now,
		UpdatedAt:               now,
	}
}

func lockAIActionPreview(tx *gorm.DB, restaurantID, ownerUserID uint, previewID string) (*entity.AIActionPreview, error) {
	var preview entity.AIActionPreview
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ? AND restaurant_id = ? AND owner_user_id = ?", previewID, restaurantID, ownerUserID).
		First(&preview).Error
	return &preview, err
}

func lockAIActionMenuItem(tx *gorm.DB, restaurantID, menuItemID uint) (*entity.MenuItem, error) {
	var menuItem entity.MenuItem
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Select("id", "restaurant_id", "name", "is_available", "updated_at").
		Where("id = ? AND restaurant_id = ?", menuItemID, restaurantID).
		First(&menuItem).Error
	return &menuItem, err
}

func updateAIActionMenuAvailability(tx *gorm.DB, preview *entity.AIActionPreview, now time.Time) (bool, error) {
	result := tx.Model(&entity.MenuItem{}).
		Where("id = ? AND restaurant_id = ? AND is_available = ? AND updated_at = ?", preview.TargetMenuItemID, preview.RestaurantID, preview.ExpectedAvailability, preview.ExpectedTargetUpdatedAt).
		Updates(map[string]interface{}{
			"is_available": preview.DesiredAvailability,
			"updated_at":   now.UTC(),
		})
	return result.RowsAffected == 1, result.Error
}

func finalizeStaleAIActionPreview(tx *gorm.DB, preview *entity.AIActionPreview, reason string, now time.Time) error {
	return finalizeAIActionPreview(tx, preview, entity.AIActionPreviewStatusStale, map[string]interface{}{
		"reason": reason,
	}, now)
}

func finalizeAIActionPreview(tx *gorm.DB, preview *entity.AIActionPreview, status string, result interface{}, now time.Time) error {
	resultJSON, err := marshalAIActionResultJSON(result)
	if err != nil {
		return err
	}
	completedAt := now.UTC()
	update := tx.Model(&entity.AIActionPreview{}).
		Where("id = ? AND restaurant_id = ? AND owner_user_id = ? AND status = ?", preview.ID, preview.RestaurantID, preview.OwnerUserID, entity.AIActionPreviewStatusPending).
		Updates(map[string]interface{}{
			"status":       status,
			"result_json":  resultJSON,
			"completed_at": completedAt,
			"updated_at":   completedAt,
		})
	if update.Error != nil {
		return update.Error
	}
	if update.RowsAffected != 1 {
		return ErrAIActionPreviewInvalidState
	}
	preview.Status = status
	preview.ResultJSON = resultJSON
	preview.CompletedAt = &completedAt
	preview.UpdatedAt = completedAt
	return nil
}

func createAIActionAuditLog(tx *gorm.DB, preview *entity.AIActionPreview, now time.Time) error {
	details, err := marshalAIActionResultJSON(map[string]interface{}{
		"action_preview_id":     preview.ID,
		"target_menu_item_id":   preview.TargetMenuItemID,
		"target_menu_item_name": preview.TargetMenuItemName,
		"previous_availability": preview.ExpectedAvailability,
		"is_available":          preview.DesiredAvailability,
	})
	if err != nil {
		return err
	}
	actorID := preview.OwnerUserID
	auditLog := &entity.RestaurantAuditLog{
		RestaurantID: preview.RestaurantID,
		ActorUserID:  &actorID,
		Action:       entity.AuditActionAISetMenuAvailability,
		Details:      details,
	}
	auditLog.CreatedAt = now
	auditLog.UpdatedAt = now
	return tx.Omit("ActorUser", "TargetUser", "Invitation").Create(auditLog).Error
}

func normalizeAIActionContextIDs(conversationID, turnID string) (*string, *string, error) {
	conversationID = strings.TrimSpace(conversationID)
	turnID = strings.TrimSpace(turnID)
	if turnID != "" && conversationID == "" {
		return nil, nil, errors.New("AI action preview turn requires a conversation")
	}
	var conversationPtr, turnPtr *string
	if conversationID != "" {
		normalized, err := normalizeAIActionOpaqueID(conversationID)
		if err != nil {
			return nil, nil, fmt.Errorf("AI action preview conversation id: %w", err)
		}
		conversationPtr = &normalized
	}
	if turnID != "" {
		normalized, err := normalizeAIActionOpaqueID(turnID)
		if err != nil {
			return nil, nil, fmt.Errorf("AI action preview turn id: %w", err)
		}
		turnPtr = &normalized
	}
	return conversationPtr, turnPtr, nil
}

func generateAIActionOpaqueID(source io.Reader) (string, error) {
	value := make([]byte, aiActionPreviewIDBytes)
	if _, err := io.ReadFull(source, value); err != nil {
		return "", fmt.Errorf("generate AI action preview id: %w", err)
	}
	return hex.EncodeToString(value), nil
}

func normalizeAIActionOpaqueID(raw string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", errors.New("AI action preview id is required")
	}
	if len(id) > 64 {
		return "", errors.New("AI action preview id is too long")
	}
	for _, char := range id {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') && char != '-' && char != '_' {
			return "", errors.New("AI action preview id contains unsupported characters")
		}
	}
	return id, nil
}

func generateAIActionConfirmationToken(source io.Reader) (string, []byte, error) {
	value := make([]byte, aiActionConfirmationTokenBytes)
	if _, err := io.ReadFull(source, value); err != nil {
		return "", nil, fmt.Errorf("generate AI action confirmation token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(value)
	hash := sha256.Sum256([]byte(token))
	return token, hash[:], nil
}

func hashPresentedAIActionToken(raw string) ([]byte, error) {
	token := strings.TrimSpace(raw)
	if token == "" || len(token) > maxAIActionConfirmationTokenLength {
		return nil, ErrAIActionPreviewInvalidToken
	}
	hash := sha256.Sum256([]byte(token))
	return hash[:], nil
}

func aiActionConfirmationTokenMatches(storedHash, presentedHash []byte) bool {
	return subtle.ConstantTimeCompare(storedHash, presentedHash) == 1
}

func marshalAIActionResultJSON(value interface{}) (string, error) {
	if value == nil {
		value = map[string]interface{}{}
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("marshal AI action result: %w", err)
	}
	if len(raw) > AIActionPreviewResultMaxBytes {
		return "", errors.New("AI action result is too large")
	}
	var object map[string]interface{}
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		return "", errors.New("AI action result must be a JSON object")
	}
	return string(raw), nil
}

func (r *AIActionPreviewRepository) currentTime() time.Time {
	return r.now().UTC()
}
