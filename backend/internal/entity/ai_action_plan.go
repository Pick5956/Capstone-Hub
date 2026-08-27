package entity

import "time"

// An action plan is the reviewed write boundary for the assistant's commands.
//
// The first boundary (AIActionPreview) holds exactly one menu-availability
// change; a plan holds N items of possibly different types, because an owner
// says "รับผักชี 2 กก. หมู 5 กก." in one breath. Everything that made the first
// boundary safe is kept: only a hash of the confirmation token is stored, the
// plan expires, and no row is written until the owner confirms.
//
// Items are executed one by one through the existing services (the same code a
// button press runs), so business rules — stock maths, the linked expense, menus
// auto-closing at zero — have exactly one implementation. That means a batch is
// not all-or-nothing: an item can succeed while a later one fails, which is why
// each item carries its own status and the plan can end "partial".

const (
	AIActionPlanStatusPending   = "pending"
	AIActionPlanStatusExecuting = "executing"
	AIActionPlanStatusExecuted  = "executed"
	AIActionPlanStatusPartial   = "partial"
	AIActionPlanStatusFailed    = "failed"
	AIActionPlanStatusExpired   = "expired"
	AIActionPlanStatusCancelled = "cancelled"

	AIActionItemStatusPending  = "pending"
	AIActionItemStatusExecuted = "executed"
	AIActionItemStatusFailed   = "failed"

	// Action types the plan boundary accepts. Adding one here is not enough: it
	// must also be registered with a validator and an executor, and the check
	// constraint below must list it — three reviewed places, on purpose.
	AIActionTypeAdjustIngredientStock = "adjust_ingredient_stock"
	AIActionTypeSetIngredientMinStock = "set_ingredient_min_stock"
	AIActionTypeSetIngredientCost     = "set_ingredient_cost"
	AIActionTypeCreateIngredient      = "create_ingredient"
	// Opening and closing a menu is also a plan item now. Its constant lives with
	// the older single-action preview (ai_action_preview.go), which names the same
	// action — one spelling of "set_menu_availability" for both boundaries.
)

type AIActionPlan struct {
	ID           string `json:"id" gorm:"type:varchar(64);primaryKey"`
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index:idx_ai_action_plans_owner_status,priority:1"`
	OwnerUserID  uint   `json:"owner_user_id" gorm:"not null;index:idx_ai_action_plans_owner_status,priority:2"`

	ConversationID *string `json:"conversation_id,omitempty" gorm:"type:varchar(64);index"`
	TurnID         *string `json:"turn_id,omitempty" gorm:"type:varchar(64);index"`

	Summary string `json:"summary" gorm:"size:400;not null;default:''"`

	ConfirmationTokenHash []byte `json:"-" gorm:"type:bytea;not null;check:ai_action_plans_token_hash_size,octet_length(confirmation_token_hash) = 32"`
	Status                string `json:"status" gorm:"size:16;not null;index:idx_ai_action_plans_owner_status,priority:3;check:ai_action_plans_valid_status,status IN ('pending','executing','executed','partial','failed','expired','cancelled')"`

	ExpiresAt   time.Time  `json:"expires_at" gorm:"not null;index:idx_ai_action_plans_expires_at"`
	ClaimedAt   *time.Time `json:"-"`
	CompletedAt *time.Time `json:"completed_at,omitempty" gorm:"index:idx_ai_action_plans_completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	Items []AIActionPlanItem `json:"items,omitempty" gorm:"foreignKey:PlanID"`

	Restaurant   *Restaurant         `json:"-" gorm:"foreignKey:RestaurantID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Owner        *User               `json:"-" gorm:"foreignKey:OwnerUserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Conversation *AIConversation     `json:"-" gorm:"foreignKey:ConversationID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL"`
	Turn         *AIConversationTurn `json:"-" gorm:"foreignKey:TurnID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL"`
}

// IsAllowedAIActionType reports whether a type may be stored in a plan. It is
// the Go half of the same allowlist the item table enforces as a check
// constraint, so an unreviewed type cannot reach the database from either side.
func IsAllowedAIActionType(actionType string) bool {
	switch actionType {
	case AIActionTypeAdjustIngredientStock,
		AIActionTypeSetIngredientMinStock,
		AIActionTypeSetIngredientCost,
		AIActionTypeCreateIngredient,
		AIActionTypeSetMenuAvailability:
		return true
	default:
		return false
	}
}

func (AIActionPlan) TableName() string { return "ai_action_plans" }

// AIActionPlanItem is one change inside a plan. PayloadJSON is the validated,
// Go-built argument set for its action type — never raw model output — and
// PreviewJSON is what the owner is shown before confirming (the "200 → 2,200
// กรัม" line and any side effect such as a linked expense).
type AIActionPlanItem struct {
	ID     uint   `json:"id" gorm:"primaryKey"`
	PlanID string `json:"plan_id" gorm:"type:varchar(64);not null;index:idx_ai_action_plan_items_plan,priority:1"`
	Seq    int    `json:"seq" gorm:"not null;index:idx_ai_action_plan_items_plan,priority:2"`

	ActionType string `json:"action_type" gorm:"size:48;not null;check:ai_action_plan_items_allowed_type,action_type IN ('adjust_ingredient_stock','set_ingredient_min_stock','set_ingredient_cost','create_ingredient','set_menu_availability')"`

	PayloadJSON string `json:"-" gorm:"type:jsonb;not null;default:'{}';check:ai_action_plan_items_payload_size,octet_length(payload_json::text) <= 8192"`
	PreviewJSON string `json:"preview" gorm:"type:jsonb;not null;default:'{}';check:ai_action_plan_items_preview_size,octet_length(preview_json::text) <= 8192"`

	Status    string `json:"status" gorm:"size:16;not null;default:'pending';check:ai_action_plan_items_valid_status,status IN ('pending','executed','failed')"`
	ErrorText string `json:"error_text,omitempty" gorm:"size:400;not null;default:''"`

	CreatedAt time.Time `json:"-"`
	UpdatedAt time.Time `json:"-"`

	Plan *AIActionPlan `json:"-" gorm:"foreignKey:PlanID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

func (AIActionPlanItem) TableName() string { return "ai_action_plan_items" }
