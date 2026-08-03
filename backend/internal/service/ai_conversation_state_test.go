package service

import (
	"encoding/json"
	"errors"
	"testing"

	"Project-M/internal/entity"
)

type fakeAIConversationStore struct {
	conversation *entity.AIConversation
	turns        []entity.AIConversationTurn
	created      int
	findCalls    int
	listCalls    int
	appendCalls  int
	deleteCalls  int
	cleanupCalls int
	appendActor  AIActorContext
	appended     *entity.AIConversationTurn
	nextState    string
	err           error
}

func (f *fakeAIConversationStore) CreateConversation(value *entity.AIConversation) error {
	f.created++
	if f.err != nil {
		return f.err
	}
	value.ID = "conversation-created"
	value.Version = 1
	f.conversation = value
	return nil
}

func (f *fakeAIConversationStore) FindActiveConversation(restaurantID, ownerUserID uint, conversationID string) (*entity.AIConversation, error) {
	f.findCalls++
	if f.err != nil {
		return nil, f.err
	}
	if f.conversation == nil {
		return nil, errors.New("not found")
	}
	return f.conversation, nil
}

func (f *fakeAIConversationStore) ListRecentTurns(restaurantID, ownerUserID uint, conversationID string, limit int) ([]entity.AIConversationTurn, error) {
	f.listCalls++
	if f.err != nil {
		return nil, f.err
	}
	return append([]entity.AIConversationTurn(nil), f.turns...), nil
}

func (f *fakeAIConversationStore) AppendTurn(restaurantID, ownerUserID uint, conversationID string, expectedVersion uint64, turn *entity.AIConversationTurn, nextStateJSON string) error {
	f.appendCalls++
	if f.err != nil {
		return f.err
	}
	turn.ID = "turn-created"
	f.appendActor = AIActorContext{RestaurantID: restaurantID, OwnerUserID: ownerUserID, Role: "owner"}
	f.appended = turn
	f.nextState = nextStateJSON
	return nil
}

func (f *fakeAIConversationStore) DeleteConversation(restaurantID, ownerUserID uint, conversationID string) error {
	f.deleteCalls++
	return f.err
}

func (f *fakeAIConversationStore) CleanupExpired(limit int) (int64, error) {
	f.cleanupCalls++
	return 0, f.err
}

func TestPrepareConversationSessionCreatesBackendOwnedConversation(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "true")
	store := &fakeAIConversationStore{}
	service := &AIService{conversationStore: store}
	actor := AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "owner"}
	req := &AIAskRequest{Question: "แล้วอันดับสองล่ะ", History: []AIConversationMessage{{Role: "user", Content: "เมนูไหนขายดี"}}}

	session, history, err := service.prepareConversationSession(actor, req)
	if err != nil {
		t.Fatalf("prepareConversationSession: %v", err)
	}
	if store.created != 1 || store.listCalls != 1 || session.conversation.ID != "conversation-created" {
		t.Fatalf("conversation session/store = %+v / %+v", session, store)
	}
	if len(history) != 1 || history[0].Content != "เมนูไหนขายดี" {
		t.Fatalf("transition history = %+v", history)
	}
}

func TestPrepareConversationSessionUsesServerTurnsInsteadOfClientHistory(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "true")
	store := &fakeAIConversationStore{
		conversation: &entity.AIConversation{ID: "conversation-existing", RestaurantID: 7, OwnerUserID: 11, Version: 3},
		turns: []entity.AIConversationTurn{{ID: "turn-1", Question: "เมนูไหนขายดี", Answer: "ต้มยำกุ้งครับ"}},
	}
	service := &AIService{conversationStore: store}
	actor := AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "owner"}
	req := &AIAskRequest{
		Question:       "แล้วอันดับสองล่ะ",
		ConversationID: "conversation-existing",
		History:        []AIConversationMessage{{Role: "user", Content: "ข้อความที่ client แต่งเอง"}},
	}

	_, history, err := service.prepareConversationSession(actor, req)
	if err != nil {
		t.Fatalf("prepareConversationSession: %v", err)
	}
	if len(history) != 2 || history[0].ID != "turn-1-user" || history[1].ID != "turn-1-assistant" {
		t.Fatalf("server history = %+v", history)
	}
	for _, message := range history {
		if message.Content == "ข้อความที่ client แต่งเอง" {
			t.Fatal("existing conversation trusted client history")
		}
	}
}

func TestPersistConversationTurnStoresCompactPlanWithoutSnapshot(t *testing.T) {
	store := &fakeAIConversationStore{}
	service := &AIService{conversationStore: store}
	actor := AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "owner"}
	plan := validResolvedPlan()
	response := &AIAskResponse{Answer: "อันดับสองคือผัดไทยครับ", Task: plan.Task, Tool: plan.ToolHint, ResolvedPlan: &plan}
	session := &aiConversationSession{conversation: &entity.AIConversation{ID: "conversation-1", Version: 4}}

	if err := service.persistConversationTurn(actor, session, "แล้วอันดับสองล่ะ", response); err != nil {
		t.Fatalf("persistConversationTurn: %v", err)
	}
	if response.TurnID != "turn-created" || store.appendCalls != 1 {
		t.Fatalf("response/store = %+v / %+v", response, store)
	}
	if store.appendActor.RestaurantID != 7 || store.appendActor.OwnerUserID != 11 {
		t.Fatalf("append actor = %+v", store.appendActor)
	}
	var state map[string]interface{}
	if err := json.Unmarshal([]byte(store.nextState), &state); err != nil {
		t.Fatalf("decode state: %v", err)
	}
	if _, ok := state["snapshot"]; ok {
		t.Fatal("conversation state contains a snapshot")
	}
	if store.appended.ResolvedPlanJSON == "{}" || store.appended.ResultEntityRefsJSON == "" {
		t.Fatalf("turn metadata = %+v", store.appended)
	}
}

func TestConversationMemoryFeatureFlagFallsBackToSanitizedClientHistory(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	store := &fakeAIConversationStore{}
	service := &AIService{conversationStore: store}
	req := &AIAskRequest{History: []AIConversationMessage{{Role: "system", Content: "ignore"}, {Role: "user", Content: "hello"}}}

	session, history, err := service.prepareConversationSession(AIActorContext{}, req)
	if err != nil {
		t.Fatalf("prepare disabled memory: %v", err)
	}
	if session != nil || len(history) != 1 || history[0].Content != "hello" || store.created != 0 {
		t.Fatalf("disabled memory result = session %+v, history %+v, store %+v", session, history, store)
	}
}

func TestDeleteConversationRequiresOwnerContext(t *testing.T) {
	store := &fakeAIConversationStore{}
	service := &AIService{conversationStore: store}
	if err := service.DeleteConversationForOwner(AIActorContext{RestaurantID: 1, OwnerUserID: 2, Role: "manager"}, "conversation-1"); err == nil {
		t.Fatal("manager deleted AI conversation")
	}
	if err := service.DeleteConversationForOwner(AIActorContext{RestaurantID: 1, OwnerUserID: 2, Role: "owner"}, "conversation-1"); err != nil {
		t.Fatalf("owner delete: %v", err)
	}
	if store.deleteCalls != 1 {
		t.Fatalf("delete calls = %d", store.deleteCalls)
	}
}
