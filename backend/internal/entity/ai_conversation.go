package entity

import "time"

// AIConversation stores compact, backend-owned conversational state. It does
// not store an operational AISnapshot; current restaurant facts must always be
// queried again when a later turn needs them.
type AIConversation struct {
	ID               string    `json:"id" gorm:"type:varchar(64);primaryKey"`
	RestaurantID     uint      `json:"restaurant_id" gorm:"not null;index:idx_ai_conversations_owner_activity,priority:1"`
	OwnerUserID      uint      `json:"owner_user_id" gorm:"not null;index:idx_ai_conversations_owner_activity,priority:2"`
	StateJSON        string    `json:"-" gorm:"type:jsonb;not null;default:'{}'"`
	Version          uint64    `json:"version" gorm:"not null;default:1;check:ai_conversations_version_positive,version > 0"`
	NextTurnSequence uint64    `json:"-" gorm:"not null;default:1;check:ai_conversations_next_sequence_positive,next_turn_sequence > 0"`
	ExpiresAt        time.Time `json:"expires_at" gorm:"not null;index:idx_ai_conversations_expires_at"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at" gorm:"index:idx_ai_conversations_owner_activity,priority:3,sort:desc"`

	Restaurant *Restaurant `json:"-" gorm:"foreignKey:RestaurantID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Owner      *User       `json:"-" gorm:"foreignKey:OwnerUserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

func (AIConversation) TableName() string {
	return "ai_conversations"
}

// AIConversationTurn stores one completed question/answer exchange plus only
// the compact metadata needed to resolve later references. In particular, it
// intentionally has no Snapshot or raw tool-result field.
type AIConversationTurn struct {
	ID                   string    `json:"id" gorm:"type:varchar(64);primaryKey"`
	ConversationID       string    `json:"conversation_id" gorm:"type:varchar(64);not null;uniqueIndex:idx_ai_conversation_turn_sequence,priority:1"`
	Sequence             uint64    `json:"sequence" gorm:"not null;uniqueIndex:idx_ai_conversation_turn_sequence,priority:2;check:ai_conversation_turn_sequence_positive,sequence > 0"`
	Question             string    `json:"question" gorm:"type:text;not null"`
	Answer               string    `json:"answer" gorm:"type:text;not null"`
	Task                 string    `json:"task,omitempty" gorm:"size:48"`
	Tool                 string    `json:"tool,omitempty" gorm:"size:96"`
	ResolvedPlanJSON     string    `json:"-" gorm:"type:jsonb;not null;default:'{}'"`
	ContextDeltaJSON     string    `json:"-" gorm:"type:jsonb;not null;default:'{}'"`
	ResultEntityRefsJSON string    `json:"-" gorm:"type:jsonb;not null;default:'[]'"`
	CreatedAt            time.Time `json:"created_at"`

	Conversation *AIConversation `json:"-" gorm:"foreignKey:ConversationID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

func (AIConversationTurn) TableName() string {
	return "ai_conversation_turns"
}
