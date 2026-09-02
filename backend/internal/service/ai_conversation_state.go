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
	// aiConversationContextTurnLimit is how many past exchanges (each a
	// question+answer) the assistant loads as context. 20 turns = 40 messages, which
	// must stay in step with structuredPlannerMaxContextItems (the message-count cap
	// every history path is trimmed to) or the extra turns are silently dropped.
	aiConversationContextTurnLimit = 20
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
	// UpdateState replaces the stored state without appending a turn. The
	// repository has always had it; the digest is the first caller.
	UpdateState(restaurantID, ownerUserID uint, conversationID string, expectedVersion uint64, nextStateJSON string) error
}

type aiConversationSession struct {
	conversation *entity.AIConversation
	// digest is what the model wrote about the earlier part of this conversation,
	// read back from the stored state. It rides on the session because
	// persistConversationTurn rebuilds the whole state object on every turn and
	// would otherwise overwrite it with an empty one — the feature would look
	// implemented and quietly never accumulate anything.
	digest string
	// digestThrough is the last turn the digest already covers, so the next
	// summary only reads what came after it.
	digestThrough uint64
}

type aiConversationCompactState struct {
	SchemaVersion    string          `json:"schema_version"`
	LastTask         AITask          `json:"last_task,omitempty"`
	LastTool         AIToolName      `json:"last_tool,omitempty"`
	LastResolvedPlan json.RawMessage `json:"last_resolved_plan,omitempty"`
	// Digest is the model-written memory of the older part of this conversation.
	// The key deliberately avoids the word "snapshot": the repository rejects any
	// state object containing one, to keep tool output from being stored here.
	Digest string `json:"digest,omitempty"`
	// DigestThrough records how far the digest reaches, so summarising resumes
	// rather than restarting.
	DigestThrough uint64 `json:"digest_through,omitempty"`
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
	// The stored state has been written on every turn and never read until now.
	// The digest lives in it, and without this read the assistant would rewrite
	// its memory from nothing each time.
	var stored aiConversationCompactState
	_ = json.Unmarshal([]byte(strings.TrimSpace(conversation.StateJSON)), &stored)

	history := conversationTurnsToMessages(turns)
	// Transition compatibility: a new backend conversation may be created while
	// the browser still holds the previous local-only history. Once a server turn
	// exists, server-owned history becomes the sole source of conversational data.
	if len(history) == 0 {
		history = clientHistory
	}
	return &aiConversationSession{
		conversation:  conversation,
		digest:        stored.Digest,
		digestThrough: stored.DigestThrough,
	}, history, nil
}

func conversationTurnsToMessages(turns []entity.AIConversationTurn) []AIConversationMessage {
	messages := make([]AIConversationMessage, 0, len(turns)*2)
	for _, turn := range turns {
		turnID := strings.TrimSpace(turn.ID)
		messages = append(messages,
			AIConversationMessage{
				ID: turnID + "-user", Role: "user", Content: turn.Question,
				Topic: conversationTurnTopic(turn),
			},
			AIConversationMessage{ID: turnID + "-assistant", Role: "assistant", Content: providerSafeConversationAnswer(turn)},
		)
	}
	return sanitizeConversationHistoryInternal(messages, true)
}

// conversationTurnTopic labels a stored turn for the thread index.
//
// It uses the tool's own section heading ("วัตถุดิบและสต๊อก", "เมนู") rather than
// the tool name. Two reasons: the headings are already written for people and
// kept up to date, and a raw name like get_top_selling_menus in the prompt is one
// the model has copied into an answer before — the cleaner only strips the
// bracketed form, so the bare one would reach the owner.
func conversationTurnTopic(turn entity.AIConversationTurn) string {
	for _, name := range strings.Split(turn.Tool, ",") {
		if heading := joyboyToolGroupHeading(AIToolName(strings.TrimSpace(name))); heading != "" {
			return heading
		}
	}
	return ""
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
		// Carried forward, not rebuilt. This object replaces the stored state
		// wholesale on every turn, so anything not copied here is deleted.
		Digest:        session.digest,
		DigestThrough: session.digestThrough,
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
	// AppendTurn moved the row on in the database but not in this copy. Anything
	// that writes after it — the digest does — must use the new version or its
	// write is rejected as a conflict every single time, which is exactly how the
	// digest came to be composed correctly and thrown away on every turn.
	session.conversation.Version++
	session.conversation.NextTurnSequence = turn.Sequence + 1
	s.maybeSummarizeConversation(actor, session, turn.Sequence)
	return nil
}

// maybeSummarizeConversation writes the model's memory of the older part of this
// conversation, once enough turns have piled up beyond what it already covers.
//
// It runs in the background because the owner is waiting for an answer, not for a
// memory to be filed, and a slow provider must never make the chat feel slow. If
// it fails there is nothing to recover: the previous digest stays, and the two
// deterministic layers of memory keep working regardless — this is the layer that
// can be absent without the assistant losing the thread.
func (s *AIService) maybeSummarizeConversation(actor AIActorContext, session *aiConversationSession, latestSequence uint64) {
	if !aiConversationDigestEnabled() || s.conversationStore == nil || session == nil || session.conversation == nil {
		return
	}
	// The newest turns are already shown to the model word for word; summarising
	// them would put the same sentences in the prompt twice.
	uncovered := int64(latestSequence) - int64(session.digestThrough) - aiDigestSkipRecentTurns
	if uncovered < aiDigestTurnThreshold {
		return
	}
	conversationID := session.conversation.ID
	version := session.conversation.Version
	previous := session.digest
	through := latestSequence - aiDigestSkipRecentTurns

	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				aiStage("warn", "digest: สรุปบทสนทนาแล้วพัง (%v)", recovered)
			}
		}()
		turns, err := s.conversationStore.ListRecentTurns(
			actor.RestaurantID, actor.OwnerUserID, conversationID, aiConversationContextTurnLimit)
		if err != nil {
			aiStage("warn", "digest: อ่านบทสนทนาไม่ได้ (%v)", err)
			return
		}
		pending := make([]entity.AIConversationTurn, 0, len(turns))
		for _, candidate := range turns {
			if candidate.Sequence > session.digestThrough && candidate.Sequence <= through {
				pending = append(pending, candidate)
			}
		}
		digest := s.summarizeConversation(pending, previous)
		if strings.TrimSpace(digest) == "" {
			return
		}
		state := aiConversationCompactState{
			SchemaVersion: aiConversationStateVersion,
			Digest:        digest,
			DigestThrough: through,
		}
		stateJSON, err := json.Marshal(state)
		if err != nil {
			return
		}
		// A turn may have landed while the summary was being written, which moves
		// the version on. Dropping the write is correct: the next turn past the
		// threshold summarises again, over a conversation that now includes it.
		if err := s.conversationStore.UpdateState(
			actor.RestaurantID, actor.OwnerUserID, conversationID, version, string(stateJSON)); err != nil {
			aiStage("flow", "digest: บันทึกไม่ทัน มีเทิร์นใหม่แทรกเข้ามา (%v) — รอบหน้าค่อยสรุปใหม่", err)
		}
	}()
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
