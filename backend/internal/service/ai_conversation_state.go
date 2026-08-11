package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync/atomic"

	"Project-M/internal/entity"
)

const (
	aiConversationContextTurnLimit = 10
	aiConversationCleanupEvery     = 100
	aiConversationStateVersion     = "1.0"
)

var ErrAIConversationPersistence = errors.New("AI conversation could not be saved")

// AIConversationStore keeps the orchestration layer independent from GORM and
// makes memory behavior testable without a database.
type AIConversationStore interface {
	CreateConversation(*entity.AIConversation) error
	FindActiveConversation(restaurantID, ownerUserID uint, conversationID string) (*entity.AIConversation, error)
	ListRecentTurns(restaurantID, ownerUserID uint, conversationID string, limit int) ([]entity.AIConversationTurn, error)
	AppendTurn(restaurantID, ownerUserID uint, conversationID string, expectedVersion uint64, turn *entity.AIConversationTurn, nextStateJSON string) error
	DeleteConversation(restaurantID, ownerUserID uint, conversationID string) error
	CleanupExpired(limit int) (int64, error)
}

type aiConversationSession struct {
	conversation *entity.AIConversation
}

type aiConversationCompactState struct {
	SchemaVersion    string          `json:"schema_version"`
	LastTask         AITask          `json:"last_task,omitempty"`
	LastTool         AIToolName      `json:"last_tool,omitempty"`
	LastResolvedPlan json.RawMessage `json:"last_resolved_plan,omitempty"`
}

type aiConversationContextDelta struct {
	Task       AITask     `json:"task,omitempty"`
	Tool       AIToolName `json:"tool,omitempty"`
	DocSources []string   `json:"doc_sources,omitempty"`
}

func conversationMemoryEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AI_CONVERSATION_MEMORY_ENABLED"))) {
	case "1", "true", "on", "enabled":
		return true
	default:
		return false
	}
}

func (s *AIService) prepareConversationSession(actor AIActorContext, req *AIAskRequest) (*aiConversationSession, []AIConversationMessage, error) {
	clientHistory := sanitizeConversationHistory(req.History)
	if !conversationMemoryEnabled() || s.conversationStore == nil {
		return nil, clientHistory, nil
	}
	s.maybeCleanupExpiredConversations()

	conversationID := strings.TrimSpace(req.ConversationID)
	var conversation *entity.AIConversation
	var err error
	if conversationID == "" {
		conversation = &entity.AIConversation{
			RestaurantID: actor.RestaurantID,
			OwnerUserID:  actor.OwnerUserID,
			StateJSON:    `{"schema_version":"` + aiConversationStateVersion + `"}`,
		}
		if err = s.conversationStore.CreateConversation(conversation); err != nil {
			return nil, nil, fmt.Errorf("%w: create conversation: %w", ErrAIConversationPersistence, err)
		}
	} else {
		conversation, err = s.conversationStore.FindActiveConversation(actor.RestaurantID, actor.OwnerUserID, conversationID)
		if err != nil {
			return nil, nil, fmt.Errorf("AI conversation was not found, expired, or belongs to another owner: %w", err)
		}
	}

	turns, err := s.conversationStore.ListRecentTurns(
		actor.RestaurantID,
		actor.OwnerUserID,
		conversation.ID,
		aiConversationContextTurnLimit,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("%w: load conversation turns: %w", ErrAIConversationPersistence, err)
	}
	history := conversationTurnsToMessages(turns)
	// Transition compatibility: a new backend conversation may be created while
	// the browser still holds the previous local-only history. Once a server turn
	// exists, server-owned history becomes the sole source of conversational data.
	if len(history) == 0 {
		history = clientHistory
	}
	return &aiConversationSession{conversation: conversation}, history, nil
}

func conversationTurnsToMessages(turns []entity.AIConversationTurn) []AIConversationMessage {
	messages := make([]AIConversationMessage, 0, len(turns)*2)
	for _, turn := range turns {
		turnID := strings.TrimSpace(turn.ID)
		messages = append(messages,
			AIConversationMessage{ID: turnID + "-user", Role: "user", Content: turn.Question},
			AIConversationMessage{ID: turnID + "-assistant", Role: "assistant", Content: providerSafeConversationAnswer(turn)},
		)
	}
	return sanitizeConversationHistoryInternal(messages, true)
}

func providerSafeConversationAnswer(turn entity.AIConversationTurn) string {
	var delta aiConversationContextDelta
	_ = json.Unmarshal([]byte(strings.TrimSpace(turn.ContextDeltaJSON)), &delta)
	docURLs := deduplicateSafeSystemDocURLs(delta.DocSources)
	hasSystemDocs := AITask(turn.Task) == AITaskProductHelp ||
		isSystemDocsTool(AIToolName(turn.Tool)) || len(docURLs) > 0
	if !hasSystemDocs {
		docURLs = safeSystemDocURLsFromText(turn.Answer)
		hasSystemDocs = len(docURLs) > 0
	}
	if !hasSystemDocs {
		return turn.Answer
	}
	return reduceSystemDocsAnswerForProvider(turn.Answer, docURLs)
}

func reduceSystemDocsAnswerForProvider(answer string, docURLs []string) string {
	liveAnswer := ""
	for _, heading := range []string{
		"\n\nข้อมูลวิธีใช้จากเอกสาร Dishy:",
		"\n\nDishy system documentation:",
	} {
		if index := strings.Index(answer, heading); index >= 0 {
			liveAnswer = strings.TrimSpace(answer[:index])
			break
		}
	}

	notice := "Public Dishy documentation was referenced; its untrusted body is omitted from model context."
	if docURLs = deduplicateSafeSystemDocURLs(docURLs); len(docURLs) > 0 {
		notice += " Sources: " + strings.Join(docURLs, ", ")
	}
	if liveAnswer == "" {
		return notice
	}
	return liveAnswer + "\n\n" + notice
}

func (s *AIService) persistConversationTurn(actor AIActorContext, session *aiConversationSession, question string, response *AIAskResponse) error {
	if session == nil || session.conversation == nil || response == nil {
		return errors.New("AI conversation turn is incomplete")
	}

	planJSON := []byte(`{}`)
	entityRefsJSON := []byte(`[]`)
	if response.ResolvedPlan != nil {
		var err error
		planJSON, err = json.Marshal(response.ResolvedPlan)
		if err != nil {
			return fmt.Errorf("encode resolved plan: %w", err)
		}
		entityRefsJSON, err = json.Marshal(response.ResolvedPlan.Parameters.Entities)
		if err != nil {
			return fmt.Errorf("encode resolved entities: %w", err)
		}
	}

	state := aiConversationCompactState{
		SchemaVersion:    aiConversationStateVersion,
		LastTask:         response.Task,
		LastTool:         response.Tool,
		LastResolvedPlan: planJSON,
	}
	stateJSON, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encode conversation state: %w", err)
	}
	docURLs := make([]string, 0, len(response.DocSources))
	for _, source := range response.DocSources {
		docURLs = append(docURLs, source.URL)
	}
	contextDeltaJSON, err := json.Marshal(aiConversationContextDelta{
		Task:       response.Task,
		Tool:       response.Tool,
		DocSources: deduplicateSafeSystemDocURLs(docURLs),
	})
	if err != nil {
		return fmt.Errorf("encode conversation context delta: %w", err)
	}

	turn := &entity.AIConversationTurn{
		Question:             question,
		Answer:               response.Answer,
		Task:                 string(response.Task),
		Tool:                 string(response.Tool),
		ResolvedPlanJSON:     string(planJSON),
		ContextDeltaJSON:     string(contextDeltaJSON),
		ResultEntityRefsJSON: string(entityRefsJSON),
	}
	if err := s.conversationStore.AppendTurn(
		actor.RestaurantID,
		actor.OwnerUserID,
		session.conversation.ID,
		session.conversation.Version,
		turn,
		string(stateJSON),
	); err != nil {
		return err
	}
	response.TurnID = turn.ID
	return nil
}

func (s *AIService) DeleteConversationForOwner(actor AIActorContext, conversationID string) error {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return errors.New("authenticated restaurant owner context is required")
	}
	if s.conversationStore == nil {
		return errors.New("AI conversation memory is not configured")
	}
	return s.conversationStore.DeleteConversation(actor.RestaurantID, actor.OwnerUserID, conversationID)
}

func (s *AIService) maybeCleanupExpiredConversations() {
	if s.conversationStore == nil {
		return
	}
	count := atomic.AddUint64(&s.conversationCleanupCounter, 1)
	if count != 1 && count%aiConversationCleanupEvery != 0 {
		return
	}
	if _, err := s.conversationStore.CleanupExpired(500); err != nil {
		aiStage("warn", "expired conversation cleanup failed: %v", err)
	}
}
