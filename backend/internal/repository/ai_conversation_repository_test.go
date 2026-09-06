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
	requireConversationSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id", "trashed_at is null")

	capture.statements = nil
	_, err = repo.ListRecentTurns(7, 11, "conversation-1", 250)
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListRecentTurns() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "conversation_scope.restaurant_id", "conversation_scope.owner_user_id", "conversation_scope.trashed_at is null", "limit 50")

	capture.statements = nil
	err = repo.UpdateState(7, 11, "conversation-1", 3, `{"domain":"inventory"}`)
	if err != nil && !errors.Is(err, ErrAIConversationConflict) && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("UpdateState() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id", "trashed_at is null", "version")

	capture.statements = nil
	if err := repo.DeleteConversation(7, 11, "conversation-1"); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("DeleteConversation() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id")
}

// Chats are kept until the owner deletes them; what the sweep removes is the
// trash, and only the part of it older than the retention window. Bounded, so
// the sweep between two questions stays short.
func TestPurgeTrashedIsTrashOnlyAndBounded(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	repo := NewAIConversationRepository(db)
	cutoff := time.Date(2026, time.August, 30, 12, 0, 0, 0, time.UTC)

	if _, err := repo.PurgeTrashed(cutoff, maxConversationCleanupLimit+100); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("PurgeTrashed() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "trashed_at is not null", "trashed_at <=", "limit 5000")
	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	if strings.Contains(joined, "expires_at") {
		t.Fatalf("the purge still reads expires_at — chats must not expire:\n%s", joined)
	}
}

// The chat list is scoped to the owner, skips conversations that never got a
// turn, and reads the live set or the trash — never both.
func TestListConversationsScopesAndSplitsTrash(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	repo := NewAIConversationRepository(db)

	if _, err := repo.ListConversations(7, 11, false, 0); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListConversations() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "restaurant_id", "owner_user_id", "next_turn_sequence > 1", "trashed_at is null", "updated_at desc", "limit 100")

	capture.statements = nil
	if _, err := repo.ListConversations(7, 11, true, maxConversationListLimit+1); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListConversations(trash) error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "trashed_at is not null", "limit 500")
}

// A transcript page reads backwards from a sequence and stays inside the
// owner's own conversation.
func TestListTurnsPageReadsBackwardsWithinScope(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	repo := NewAIConversationRepository(db)

	if _, err := repo.ListTurnsPage(7, 11, "conversation-1", 120, 0); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("ListTurnsPage() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "conversation_scope.restaurant_id", "conversation_scope.owner_user_id", "sequence < ", "sequence desc", "limit 50")
}

// Renaming records that the owner chose the title and does not move the chat
// in the list; the automatic title only fills an empty one.
func TestRenameAndAutoTitleRules(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	repo := NewAIConversationRepository(db)

	if err := repo.RenameConversation(7, 11, "conversation-1", "  ยอดขาย   สัปดาห์นี้  "); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) && !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("RenameConversation() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "title_by_owner", "restaurant_id", "owner_user_id")
	joined := strings.ToLower(strings.Join(capture.statements, "\n"))
	if strings.Contains(joined, "updated_at") {
		t.Fatalf("renaming must not touch updated_at (it would move the chat to the top):\n%s", joined)
	}
	if err := repo.RenameConversation(7, 11, "conversation-1", "   "); err == nil {
		t.Fatal("an empty title was accepted")
	}

	capture.statements = nil
	if err := repo.AutoTitleConversation(7, 11, "conversation-1", "วัตถุดิบไหนควรสั่งเพิ่ม"); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("AutoTitleConversation() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "title = ''", "title_by_owner = false")

	long := strings.Repeat("ก", AIConversationTitleMaxRunes+20)
	if got := normalizeConversationTitle(long); len([]rune(got)) != AIConversationTitleMaxRunes {
		t.Errorf("title not bounded: %d runes", len([]rune(got)))
	}
}

// Trash and restore flip one column inside the owner's scope, each refusing
// to run twice; emptying the trash deletes only what is in it.
func TestTrashRestoreAndPurgeAllStayInScope(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	repo := NewAIConversationRepository(db)

	_ = repo.TrashConversation(7, 11, "conversation-1")
	requireConversationSQLFragments(t, capture.statements, "trashed_at is null", "restaurant_id", "owner_user_id")
	capture.statements = nil
	_ = repo.RestoreConversation(7, 11, "conversation-1")
	requireConversationSQLFragments(t, capture.statements, "trashed_at is not null")
	capture.statements = nil
	if _, err := repo.PurgeAllTrashed(7, 11); err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("PurgeAllTrashed() error = %v", err)
	}
	requireConversationSQLFragments(t, capture.statements, "delete", "trashed_at is not null", "restaurant_id", "owner_user_id")
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
