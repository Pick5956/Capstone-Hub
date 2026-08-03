package entity

import "time"

const (
	AIActionTypeSetMenuAvailability = "set_menu_availability"

	AIActionPreviewStatusPending   = "pending"
	AIActionPreviewStatusExecuted  = "executed"
	AIActionPreviewStatusExpired   = "expired"
	AIActionPreviewStatusStale     = "stale"
	AIActionPreviewStatusCancelled = "cancelled"
)

// AIActionPreview is a short-lived, owner-scoped confirmation record for an
// AI-proposed write. The raw confirmation token is never persisted; only its
// SHA-256 digest is stored. Version 7 intentionally supports one canary action
// so new write capabilities cannot silently bypass a reviewed persistence path.
type AIActionPreview struct {
	ID           string `json:"id" gorm:"type:varchar(64);primaryKey"`
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index:idx_ai_action_previews_owner_status,priority:1"`
	OwnerUserID  uint   `json:"owner_user_id" gorm:"not null;index:idx_ai_action_previews_owner_status,priority:2"`

	ConversationID *string `json:"conversation_id,omitempty" gorm:"type:varchar(64);index"`
	TurnID         *string `json:"turn_id,omitempty" gorm:"type:varchar(64);index"`

	ActionType              string    `json:"action_type" gorm:"size:48;not null;check:ai_action_previews_canary_action,action_type = 'set_menu_availability'"`
	TargetMenuItemID        uint      `json:"target_menu_item_id" gorm:"not null;index"`
	TargetMenuItemName      string    `json:"target_menu_item_name" gorm:"size:160;not null"`
	ExpectedAvailability    bool      `json:"expected_availability" gorm:"not null"`
	DesiredAvailability     bool      `json:"desired_availability" gorm:"not null"`
	ExpectedTargetUpdatedAt time.Time `json:"expected_target_updated_at" gorm:"not null"`

	ConfirmationTokenHash []byte `json:"-" gorm:"type:bytea;not null;check:ai_action_previews_token_hash_size,octet_length(confirmation_token_hash) = 32"`
	Status                string `json:"status" gorm:"size:16;not null;index:idx_ai_action_previews_owner_status,priority:3;check:ai_action_previews_valid_status,status IN ('pending','executed','expired','stale','cancelled')"`
	ResultJSON            string `json:"-" gorm:"type:jsonb;not null;default:'{}';check:ai_action_previews_result_size,octet_length(result_json::text) <= 16384"`

	ExpiresAt   time.Time  `json:"expires_at" gorm:"not null;index:idx_ai_action_previews_expires_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty" gorm:"index:idx_ai_action_previews_completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	Restaurant     *Restaurant         `json:"-" gorm:"foreignKey:RestaurantID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Owner          *User               `json:"-" gorm:"foreignKey:OwnerUserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Conversation   *AIConversation     `json:"-" gorm:"foreignKey:ConversationID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL"`
	Turn           *AIConversationTurn `json:"-" gorm:"foreignKey:TurnID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL"`
	TargetMenuItem *MenuItem           `json:"-" gorm:"foreignKey:TargetMenuItemID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT"`
}

func (AIActionPreview) TableName() string {
	return "ai_action_previews"
}
