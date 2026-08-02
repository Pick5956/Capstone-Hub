package repository

import (
	"errors"
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"

	"gorm.io/gorm"
)

func TestCreateAIConversationAppliesFixedTTLAndCompactState(t *testing.T) {
	db, _ := dryRunAIConversationRepositoryDB(t)
	now := time.Date(2026, time.August, 2, 12, 0, 0, 0, time.UTC)
	repo := NewAIConversationRepository(db)
	repo.now = func() time.Time { return now }
	conversation := &entity.AIConversation{
		RestaurantID: 7,
		OwnerUserID:  11,
		StateJSON:    " { \"domain\" : \"menu\" } ",
		Version:      99,
		ExpiresAt:    now.Add(365 * 24 * time.Hour),
	}

	if err := repo.CreateConversation(conversation); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("CreateConversation() error = %v", err)
	}
	if len(conversation.ID) != 32 {
		t.Fatalf("generated conversation id length = %d, want 32", len(conversation.ID))
	}
	if conversation.StateJSON != `{"domain":"menu"}` {
		t.Fatalf("compact state = %q", conversation.StateJSON)
	}
	if conversation.Version != 1 || conversation.NextTurnSequence != 1 {
		t.Fatalf("initial counters = version %d sequence %d, want 1/1", conversation.Version, conversation.NextTurnSequence)
	}
	if !conversation.ExpiresAt.Equal(now.Add(AIConversationTTL)) {
		t.Fatalf("expires_at = %s, want fixed TTL %s", conversation.ExpiresAt, now.Add(AIConversationTTL))
	}
	if !conversation.CreatedAt.Equal(now) || !conversation.UpdatedAt.Equal(now) {
		t.Fatalf("conversation timestamps = %s/%s, want repository clock %s", conversation.CreatedAt, conversation.UpdatedAt, now)
	}
}

func TestAIConversationJSONMetadataValidation(t *testing.T) {
	tests := []struct {
		name string
		raw  string
	}{
		{name: "invalid JSON", raw: `{`},
		{name: "object required", raw: `[]`},
		{name: "top-level snapshot", raw: `{"snapshot":{"sales":[]}}`},
		{name: "nested snapshot", raw: `{"context":{"full_snapshot":{}}}`},
		{name: "too large", raw: `{"value":"` + strings.Repeat("a", AIConversationStateMaxBytes) + `"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := normalizeConversationJSONObject(test.raw, AIConversationStateMaxBytes); err == nil {
				t.Fatal("normalizeConversationJSONObject() unexpectedly succeeded")
			}
		})
	}

	if got, err := normalizeConversationJSONObject("", AIConversationStateMaxBytes); err != nil || got != "{}" {
		t.Fatalf("blank object metadata = %q, %v; want {}", got, err)
	}
	if got, err := normalizeConversationJSONArray("", AIConversationTurnMetadataMaxBytes); err != nil || got != "[]" {
		t.Fatalf("blank array metadata = %q, %v; want []", got, err)
	}
}

func TestAppendTurnRejectsSnapshotAndOversizedMessagesBeforeDatabase(t *testing.T) {
	db, _ := dryRunAIConversationRepositoryDB(t)
	repo := NewAIConversationRepository(db)
	valid := entity.AIConversationTurn{
		Question:             "เมนูไหนแพงสุด",
		Answer:               "ต้มยำกุ้งครับ",
		ResolvedPlanJSON:     `{}`,
		ContextDeltaJSON:     `{}`,
		ResultEntityRefsJSON: `[]`,
	}

	snapshotTurn := valid
	snapshotTurn.ResolvedPlanJSON = `{"snapshot":{"sales_days":[]}}`
	if err := repo.AppendTurn(7, 11, "conversation-1", 1, &snapshotTurn, `{}`); err == nil || !strings.Contains(err.Error(), "snapshots cannot be stored") {
		t.Fatalf("snapshot turn error = %v", err)
	}

	longQuestionTurn := valid
	longQuestionTurn.Question = strings.Repeat("ก", AIConversationQuestionMaxRunes+1)
	if err := repo.AppendTurn(7, 11, "conversation-1", 1, &longQuestionTurn, `{}`); err == nil || !strings.Contains(err.Error(), "question is too long") {
		t.Fatalf("long question error = %v", err)
	}
}

func TestAIConversationRepositoryQueriesAreTenantOwnerAndTTLScoped(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	now := time.Date(2026, time.August, 2, 12, 0, 0, 0, time.UTC)
	repo := NewAIConversationRepository(db)
	repo.now = func() time.Time { return now }

	capture.statements = nil
	_, err := repo.FindActiveConversation(7, 11, "conversation-1")
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("FindActiveConversation() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id", "expires_at >")

	capture.statements = nil
	_, err = repo.ListRecentTurns(7, 11, "conversation-1", 250)
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListRecentTurns() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "conversation_scope.restaurant_id", "conversation_scope.owner_user_id", "conversation_scope.expires_at >", "limit 50")

	capture.statements = nil
	err = repo.UpdateState(7, 11, "conversation-1", 3, `{"domain":"inventory"}`)
	if err != nil && !errors.Is(err, ErrAIConversationConflict) && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("UpdateState() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id", "expires_at >", "version")

	capture.statements = nil
	if err := repo.DeleteConversation(7, 11, "conversation-1"); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("DeleteConversation() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id")
}

func TestCleanupExpiredAIConversationsIsTTLOnlyAndBounded(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	repo := NewAIConversationRepository(db)
	repo.now = func() time.Time {
		return time.Date(2026, time.August, 2, 12, 0, 0, 0, time.UTC)
	}

	if _, err := repo.CleanupExpired(maxConversationCleanupLimit + 100); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("CleanupExpired() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "expires_at <=", "limit 5000")
}

func TestPruneOldConversationTurnsKeepsFixedWindowAndScopesParent(t *testing.T) {
	if AIConversationMaxStoredTurns != 50 {
		t.Fatalf("AIConversationMaxStoredTurns = %d, want reviewed retention cap 50", AIConversationMaxStoredTurns)
	}
	db, capture := dryRunAIConversationRepositoryDB(t)

	if err := pruneOldConversationTurns(db, "conversation-1", AIConversationMaxStoredTurns); err != nil {
		t.Fatalf("prune at retention boundary: %v", err)
	}
	if len(capture.statements) != 0 {
		t.Fatalf("turns were pruned before exceeding retention: %v", capture.statements)
	}

	if err := pruneOldConversationTurns(db, "conversation-1", AIConversationMaxStoredTurns+1); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("prune over retention boundary: %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "conversation_id", "sequence <= 1")
	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	if strings.Contains(joined, "delete from \"ai_conversation_turns\"") && !strings.Contains(joined, "conversation-1") {
		t.Fatalf("turn cleanup is not scoped to its conversation:\n%s", joined)
	}
}

func TestOpaqueConversationIDsAreGeneratedAndValidated(t *testing.T) {
	first, err := prepareOpaqueID("")
	if err != nil {
		t.Fatalf("prepareOpaqueID() error = %v", err)
	}
	second, err := prepareOpaqueID("")
	if err != nil {
		t.Fatalf("prepareOpaqueID() second error = %v", err)
	}
	if len(first) != 32 || len(second) != 32 || first == second {
		t.Fatalf("generated ids are not independent 128-bit hex values: %q %q", first, second)
	}
	for _, invalid := range []string{"contains space", "slash/id", strings.Repeat("a", 65)} {
		if _, err := normalizeExistingOpaqueID(invalid); err == nil {
			t.Fatalf("invalid id %q was accepted", invalid)
		}
	}
}

func requireConversationSQLFragments(t *testing.T, statements []string, fragments ...string) {
	t.Helper()
	joined := strings.ToLower(strings.Join(statements, "\n"))
	for _, fragment := range fragments {
		if !strings.Contains(joined, strings.ToLower(fragment)) {
			t.Fatalf("generated SQL does not contain %q:\n%s", fragment, joined)
		}
	}
}

func dryRunAIConversationRepositoryDB(t *testing.T) (*gorm.DB, *statementCapture) {
	t.Helper()
	db, capture := dryRunRepositoryDB(t)
	// Writes normally start a transaction, which would acquire a real connection
	// even in DryRun mode. Disable that wrapper so these tests inspect SQL only.
	return db.Session(&gorm.Session{SkipDefaultTransaction: true}), capture
}
