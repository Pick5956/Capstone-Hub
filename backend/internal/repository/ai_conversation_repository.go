package repository

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AIConversationTTL                  = 7 * 24 * time.Hour
	AIConversationStateMaxBytes        = 32 * 1024
	AIConversationTurnMetadataMaxBytes = 32 * 1024
	AIConversationQuestionMaxRunes     = 800
	AIConversationAnswerMaxRunes       = 16 * 1024
	AIConversationMaxStoredTurns       = 50
	defaultConversationTurnLimit       = 6
	maxConversationTurnLimit           = AIConversationMaxStoredTurns
	defaultConversationCleanupLimit    = 500
	maxConversationCleanupLimit        = 5000
)

var ErrAIConversationConflict = errors.New("AI conversation was updated or is unavailable")

type AIConversationRepository struct {
	db  *gorm.DB
	now func() time.Time
}

func NewAIConversationRepository(db *gorm.DB) *AIConversationRepository {
	return &AIConversationRepository{db: db, now: time.Now}
}

// CreateConversation persists a new conversation with the fixed retention
// window. Caller-provided expiry/version values are ignored so a client cannot
// extend retention or bypass optimistic concurrency.
func (r *AIConversationRepository) CreateConversation(conversation *entity.AIConversation) error {
	if r == nil || r.db == nil {
		return errors.New("AI conversation repository is not connected")
	}
	if conversation == nil {
		return errors.New("AI conversation is required")
	}
	if conversation.RestaurantID == 0 || conversation.OwnerUserID == 0 {
		return errors.New("AI conversation restaurant and owner are required")
	}

	id, err := prepareOpaqueID(conversation.ID)
	if err != nil {
		return fmt.Errorf("AI conversation id: %w", err)
	}
	stateJSON, err := normalizeConversationJSONObject(conversation.StateJSON, AIConversationStateMaxBytes)
	if err != nil {
		return fmt.Errorf("AI conversation state: %w", err)
	}

	now := r.currentTime()
	conversation.ID = id
	conversation.StateJSON = stateJSON
	conversation.Version = 1
	conversation.NextTurnSequence = 1
	conversation.ExpiresAt = now.Add(AIConversationTTL)
	conversation.CreatedAt = now
	conversation.UpdatedAt = now
	return r.db.Omit("Restaurant", "Owner").Create(conversation).Error
}

// FindActiveConversation always scopes by tenant, owner, opaque ID, and TTL.
// An expired conversation is intentionally indistinguishable from a missing
// one and must not be used to resolve a new question.
func (r *AIConversationRepository) FindActiveConversation(restaurantID, ownerUserID uint, conversationID string) (*entity.AIConversation, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("AI conversation repository is not connected")
	}
	id, err := normalizeExistingOpaqueID(conversationID)
	if err != nil {
		return nil, err
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return nil, errors.New("AI conversation restaurant and owner are required")
	}

	var conversation entity.AIConversation
	err = r.db.
		Where("id = ? AND restaurant_id = ? AND owner_user_id = ? AND expires_at > ?", id, restaurantID, ownerUserID, r.currentTime()).
		First(&conversation).Error
	if err != nil {
		return nil, err
	}
	return &conversation, nil
}

// UpdateState atomically replaces compact conversation state, advances its
// version, and refreshes the fixed TTL. expectedVersion prevents concurrent
// web/mobile requests from silently overwriting each other's context.
func (r *AIConversationRepository) UpdateState(restaurantID, ownerUserID uint, conversationID string, expectedVersion uint64, stateJSON string) error {
	if r == nil || r.db == nil {
		return errors.New("AI conversation repository is not connected")
	}
	if expectedVersion == 0 {
		return errors.New("AI conversation expected version is required")
	}
	id, err := normalizeExistingOpaqueID(conversationID)
	if err != nil {
		return err
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return errors.New("AI conversation restaurant and owner are required")
	}
	state, err := normalizeConversationJSONObject(stateJSON, AIConversationStateMaxBytes)
	if err != nil {
		return fmt.Errorf("AI conversation state: %w", err)
	}

	now := r.currentTime()
	result := r.db.Model(&entity.AIConversation{}).
		Where("id = ? AND restaurant_id = ? AND owner_user_id = ? AND expires_at > ? AND version = ?", id, restaurantID, ownerUserID, now, expectedVersion).
		Updates(map[string]interface{}{
			"state_json": state,
			"version":    gorm.Expr("version + 1"),
			"expires_at": now.Add(AIConversationTTL),
			"updated_at": now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrAIConversationConflict
	}
	return nil
}

// AppendTurn stores a completed exchange and its context delta in the same
// transaction that advances conversation state. The parent row lock assigns a
// stable sequence even when requests arrive concurrently.
func (r *AIConversationRepository) AppendTurn(restaurantID, ownerUserID uint, conversationID string, expectedVersion uint64, turn *entity.AIConversationTurn, nextStateJSON string) error {
	if r == nil || r.db == nil {
		return errors.New("AI conversation repository is not connected")
	}
	if turn == nil {
		return errors.New("AI conversation turn is required")
	}
	if expectedVersion == 0 {
		return errors.New("AI conversation expected version is required")
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return errors.New("AI conversation restaurant and owner are required")
	}

	conversationID, err := normalizeExistingOpaqueID(conversationID)
	if err != nil {
		return err
	}
	turnID, err := prepareOpaqueID(turn.ID)
	if err != nil {
		return fmt.Errorf("AI conversation turn id: %w", err)
	}
	question, err := normalizeRequiredText(turn.Question, AIConversationQuestionMaxRunes, "question")
	if err != nil {
		return err
	}
	answer, err := normalizeRequiredText(turn.Answer, AIConversationAnswerMaxRunes, "answer")
	if err != nil {
		return err
	}
	state, err := normalizeConversationJSONObject(nextStateJSON, AIConversationStateMaxBytes)
	if err != nil {
		return fmt.Errorf("AI conversation state: %w", err)
	}
	plan, err := normalizeConversationJSONObject(turn.ResolvedPlanJSON, AIConversationTurnMetadataMaxBytes)
	if err != nil {
		return fmt.Errorf("AI conversation resolved plan: %w", err)
	}
	delta, err := normalizeConversationJSONObject(turn.ContextDeltaJSON, AIConversationTurnMetadataMaxBytes)
	if err != nil {
		return fmt.Errorf("AI conversation context delta: %w", err)
	}
	refs, err := normalizeConversationJSONArray(turn.ResultEntityRefsJSON, AIConversationTurnMetadataMaxBytes)
	if err != nil {
		return fmt.Errorf("AI conversation entity references: %w", err)
	}
	if len([]rune(strings.TrimSpace(turn.Task))) > 48 || len([]rune(strings.TrimSpace(turn.Tool))) > 96 {
		return errors.New("AI conversation task or tool is too long")
	}

	turn.ID = turnID
	turn.Question = question
	turn.Answer = answer
	turn.Task = strings.TrimSpace(turn.Task)
	turn.Tool = strings.TrimSpace(turn.Tool)
	turn.ResolvedPlanJSON = plan
	turn.ContextDeltaJSON = delta
	turn.ResultEntityRefsJSON = refs

	return r.db.Transaction(func(tx *gorm.DB) error {
		now := r.currentTime()
		var conversation entity.AIConversation
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND restaurant_id = ? AND owner_user_id = ? AND expires_at > ?", conversationID, restaurantID, ownerUserID, now).
			First(&conversation).Error; err != nil {
			return err
		}
		if conversation.Version != expectedVersion {
			return ErrAIConversationConflict
		}

		turn.ConversationID = conversation.ID
		turn.Sequence = conversation.NextTurnSequence
		turn.CreatedAt = now
		if err := tx.Omit("Conversation").Create(turn).Error; err != nil {
			return err
		}
		if err := pruneOldConversationTurns(tx, conversation.ID, turn.Sequence); err != nil {
			return err
		}

		result := tx.Model(&entity.AIConversation{}).
			Where("id = ? AND version = ?", conversation.ID, expectedVersion).
			Updates(map[string]interface{}{
				"state_json":         state,
				"version":            expectedVersion + 1,
				"next_turn_sequence": conversation.NextTurnSequence + 1,
				"expires_at":         now.Add(AIConversationTTL),
				"updated_at":         now,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrAIConversationConflict
		}
		return nil
	})
}

func pruneOldConversationTurns(database *gorm.DB, conversationID string, newestSequence uint64) error {
	if newestSequence <= AIConversationMaxStoredTurns {
		return nil
	}
	oldestSequenceToDelete := newestSequence - AIConversationMaxStoredTurns
	return database.
		Where("conversation_id = ? AND sequence <= ?", conversationID, oldestSequenceToDelete).
		Delete(&entity.AIConversationTurn{}).Error
}

// ListRecentTurns returns the newest bounded context in chronological order so
// callers cannot accidentally load the complete history into an LLM prompt.
func (r *AIConversationRepository) ListRecentTurns(restaurantID, ownerUserID uint, conversationID string, limit int) ([]entity.AIConversationTurn, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("AI conversation repository is not connected")
	}
	id, err := normalizeExistingOpaqueID(conversationID)
	if err != nil {
		return nil, err
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return nil, errors.New("AI conversation restaurant and owner are required")
	}
	if limit <= 0 {
		limit = defaultConversationTurnLimit
	}
	if limit > maxConversationTurnLimit {
		limit = maxConversationTurnLimit
	}

	var turns []entity.AIConversationTurn
	err = r.db.Model(&entity.AIConversationTurn{}).
		Joins("JOIN ai_conversations AS conversation_scope ON conversation_scope.id = ai_conversation_turns.conversation_id").
		Where("conversation_scope.id = ? AND conversation_scope.restaurant_id = ? AND conversation_scope.owner_user_id = ? AND conversation_scope.expires_at > ?", id, restaurantID, ownerUserID, r.currentTime()).
		Order("ai_conversation_turns.sequence DESC").
		Limit(limit).
		Find(&turns).Error
	if err != nil {
		return nil, err
	}
	for left, right := 0, len(turns)-1; left < right; left, right = left+1, right-1 {
		turns[left], turns[right] = turns[right], turns[left]
	}
	return turns, nil
}

func (r *AIConversationRepository) DeleteConversation(restaurantID, ownerUserID uint, conversationID string) error {
	if r == nil || r.db == nil {
		return errors.New("AI conversation repository is not connected")
	}
	id, err := normalizeExistingOpaqueID(conversationID)
	if err != nil {
		return err
	}
	if restaurantID == 0 || ownerUserID == 0 {
		return errors.New("AI conversation restaurant and owner are required")
	}
	return r.db.Where("id = ? AND restaurant_id = ? AND owner_user_id = ?", id, restaurantID, ownerUserID).
		Delete(&entity.AIConversation{}).Error
}

// CleanupExpired deletes only expired parents in a bounded batch. Turn rows are
// removed by the migration-created ON DELETE CASCADE constraint.
func (r *AIConversationRepository) CleanupExpired(limit int) (int64, error) {
	if r == nil || r.db == nil {
		return 0, errors.New("AI conversation repository is not connected")
	}
	if limit <= 0 {
		limit = defaultConversationCleanupLimit
	}
	if limit > maxConversationCleanupLimit {
		limit = maxConversationCleanupLimit
	}

	expiredIDs := r.db.Model(&entity.AIConversation{}).
		Select("id").
		Where("expires_at <= ?", r.currentTime()).
		Order("expires_at ASC").
		Limit(limit)
	result := r.db.Where("id IN (?)", expiredIDs).Delete(&entity.AIConversation{})
	return result.RowsAffected, result.Error
}

func (r *AIConversationRepository) currentTime() time.Time {
	return r.now().UTC()
}

func prepareOpaqueID(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		value := make([]byte, 16)
		if _, err := rand.Read(value); err != nil {
			return "", fmt.Errorf("generate id: %w", err)
		}
		return hex.EncodeToString(value), nil
	}
	return normalizeExistingOpaqueID(raw)
}

func normalizeExistingOpaqueID(raw string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", errors.New("AI conversation id is required")
	}
	if len(id) > 64 {
		return "", errors.New("AI conversation id is too long")
	}
	for _, char := range id {
		if !unicode.IsLetter(char) && !unicode.IsDigit(char) && char != '-' && char != '_' {
			return "", errors.New("AI conversation id contains unsupported characters")
		}
	}
	return id, nil
}

func normalizeRequiredText(raw string, maxRunes int, field string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("AI conversation %s is required", field)
	}
	if len([]rune(value)) > maxRunes {
		return "", fmt.Errorf("AI conversation %s is too long", field)
	}
	return value, nil
}

func normalizeConversationJSONObject(raw string, maxBytes int) (string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = "{}"
	}
	return normalizeConversationJSON(raw, maxBytes, true)
}

func normalizeConversationJSONArray(raw string, maxBytes int) (string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = "[]"
	}
	return normalizeConversationJSON(raw, maxBytes, false)
}

func normalizeConversationJSON(raw string, maxBytes int, wantObject bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if len(raw) > maxBytes {
		return "", errors.New("JSON metadata is too large")
	}
	var value interface{}
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return "", errors.New("JSON metadata is invalid")
	}
	if wantObject {
		if _, ok := value.(map[string]interface{}); !ok {
			return "", errors.New("JSON metadata must be an object")
		}
	} else if _, ok := value.([]interface{}); !ok {
		return "", errors.New("JSON metadata must be an array")
	}
	if containsSnapshotKey(value) {
		return "", errors.New("operational snapshots cannot be stored in conversation metadata")
	}

	var compact bytes.Buffer
	if err := json.Compact(&compact, []byte(raw)); err != nil {
		return "", errors.New("JSON metadata is invalid")
	}
	return compact.String(), nil
}

func containsSnapshotKey(value interface{}) bool {
	switch typed := value.(type) {
	case map[string]interface{}:
		for key, child := range typed {
			if strings.Contains(strings.ToLower(key), "snapshot") || containsSnapshotKey(child) {
				return true
			}
		}
	case []interface{}:
		for _, child := range typed {
			if containsSnapshotKey(child) {
				return true
			}
		}
	}
	return false
}
