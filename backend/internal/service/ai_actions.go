package service

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"gorm.io/gorm"
)

var (
	ErrAIActionsDisabled   = errors.New("AI actions are disabled for this restaurant")
	ErrAIActionUnavailable = errors.New("AI action confirmation is not configured")

	errAIActionTargetNotFound  = errors.New("AI action target menu was not found")
	errAIActionTargetAmbiguous = errors.New("AI action target menu is ambiguous")
)

// AIActionStore is the reviewed write boundary. The service never receives a
// generic model-supplied function name or arbitrary argument map.
type AIActionStore interface {
	CreateSetMenuAvailabilityPreview(repository.CreateSetMenuAvailabilityPreviewParams) (*entity.AIActionPreview, string, error)
	ConfirmSetMenuAvailability(restaurantID, ownerUserID uint, previewID, confirmationToken string) (*entity.AIActionPreview, bool, error)
	CancelPreview(restaurantID, ownerUserID uint, previewID string) (*entity.AIActionPreview, error)
	CleanupActionPreviews(limit int) (int64, error)
}

func (s *AIService) maybeCleanupAIActionPreviews() {
	if s.actionStore == nil {
		return
	}
	count := atomic.AddUint64(&s.actionCleanupCounter, 1)
	if count != 1 && count%100 != 0 {
		return
	}
	if _, err := s.actionStore.CleanupActionPreviews(500); err != nil {
		aiStage("warn", "AI action preview cleanup failed: %v", err)
	}
}

// AIActionMenuResolver resolves an untrusted entity reference to one tenant-
// scoped menu. Duplicate names deliberately remain ambiguous.
type AIActionMenuResolver interface {
	FindMenuItem(restaurantID, menuItemID uint) (*entity.MenuItem, error)
	FindMenuItemsByExactName(restaurantID uint, name string, limit int) ([]entity.MenuItem, error)
}

// AIActionsSettingStore reads and writes the per-restaurant owner toggle that
// says whether the assistant may make (previewed, confirmed) changes. When one
// is wired it replaces the env allowlist as the per-restaurant gate; the system
// master switch (AI_ACTIONS_ENABLED) still applies on top.
type AIActionsSettingStore interface {
	RestaurantAIActionsEnabled(restaurantID uint) (bool, error)
	SetRestaurantAIActionsEnabled(restaurantID uint, enabled bool) error
}

// ownerActionsEnabled is the production gate for whether the assistant may act
// for this restaurant: the system master switch, then the owner's own toggle.
// With no toggle store wired (unit tests), it falls back to the env allowlist so
// the reviewed-boundary tests keep exercising the same policy they always have.
func (s *AIService) ownerActionsEnabled(restaurantID uint) bool {
	if s.actionsSetting == nil {
		return aiActionsEnabledForRestaurant(restaurantID)
	}
	if restaurantID == 0 || !aiEnabledEnvironmentValue(os.Getenv("AI_ACTIONS_ENABLED")) {
		return false
	}
	enabled, err := s.actionsSetting.RestaurantAIActionsEnabled(restaurantID)
	return err == nil && enabled
}

type AIActionPreviewResponse struct {
	ID                string                    `json:"id"`
	ActionType        string                    `json:"action_type"`
	Status            string                    `json:"status"`
	ExpiresAt         time.Time                 `json:"expires_at"`
	ConfirmationToken string                    `json:"confirmation_token"`
	Summary           string                    `json:"summary"`
	Target            AIActionPreviewTarget     `json:"target"`
	Current           AIActionAvailabilityState `json:"current"`
	Requested         AIActionAvailabilityState `json:"requested"`
	Warnings          []string                  `json:"warnings"`
}

type AIActionPreviewTarget struct {
	MenuItemID uint   `json:"menu_item_id"`
	Name       string `json:"name"`
}

type AIActionAvailabilityState struct {
	IsAvailable bool `json:"is_available"`
}

type AIActionConfirmationRequest struct {
	ConfirmationToken string `json:"confirmation_token" binding:"required,max=256"`
}

type AIActionConfirmationResponse struct {
	ActionID   string                     `json:"action_id"`
	Status     string                     `json:"status"`
	Replayed   bool                       `json:"replayed"`
	ExecutedAt time.Time                  `json:"executed_at"`
	Message    string                     `json:"message"`
	Result     AIActionConfirmationResult `json:"result"`
}

type AIActionConfirmationResult struct {
	MenuItemID  uint   `json:"menu_item_id"`
	Name        string `json:"name"`
	IsAvailable bool   `json:"is_available"`
}

func aiActionsEnabledForRestaurant(restaurantID uint) bool {
	if restaurantID == 0 || !aiEnabledEnvironmentValue(os.Getenv("AI_ACTIONS_ENABLED")) {
		return false
	}
	for _, value := range strings.Split(os.Getenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS"), ",") {
		value = strings.TrimSpace(value)
		if value == "*" {
			return true
		}
		allowedID, err := strconv.ParseUint(value, 10, 64)
		if err == nil && uint64(restaurantID) == allowedID {
			return true
		}
	}
	return false
}

func aiEnabledEnvironmentValue(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "on", "enabled":
		return true
	default:
		return false
	}
}

func (s *AIService) maybeCreateAIActionPreview(actor AIActorContext, conversationID string, response *AIAskResponse) error {
	if response == nil || response.ResolvedPlan == nil || response.ResolvedPlan.Action == nil {
		return nil
	}
	// Shadow output is evaluation data only. It must never become authority to
	// create even a pending write preview.
	if aiOrchestrationMode() != aiOrchestratorPlanner || !s.ownerActionsEnabled(actor.RestaurantID) {
		return nil
	}
	if s.actionStore == nil || s.actionMenuResolver == nil {
		return ErrAIActionUnavailable
	}

	plan, err := NormalizeAndValidateResolvedPlan(*response.ResolvedPlan)
	if err != nil {
		return fmt.Errorf("AI action plan is invalid: %w", err)
	}
	if err := authorizeAIActionPlan(plan, actor); err != nil {
		return err
	}

	menuItem, err := s.resolveAIActionMenu(actor.RestaurantID, plan.Parameters.Entities[0])
	if err != nil {
		if errors.Is(err, errAIActionTargetNotFound) || errors.Is(err, errAIActionTargetAmbiguous) {
			setAIActionClarification(response, errors.Is(err, errAIActionTargetAmbiguous))
			return nil
		}
		return err
	}

	preview, confirmationToken, err := s.actionStore.CreateSetMenuAvailabilityPreview(
		repository.CreateSetMenuAvailabilityPreviewParams{
			RestaurantID:        actor.RestaurantID,
			OwnerUserID:         actor.OwnerUserID,
			ConversationID:      strings.TrimSpace(conversationID),
			TargetMenuItemID:    menuItem.ID,
			DesiredAvailability: plan.Action.Arguments.IsAvailable,
		},
	)
	if errors.Is(err, repository.ErrAIActionPreviewNoChange) {
		setAIActionNoChangeResponse(response, menuItem.Name, plan.Action.Arguments.IsAvailable)
		return nil
	}
	if errors.Is(err, repository.ErrAIActionPreviewNotFound) {
		setAIActionClarification(response, false)
		return nil
	}
	if err != nil {
		return fmt.Errorf("create AI action preview: %w", err)
	}

	response.Answer = fmt.Sprintf(
		"ผมเตรียมคำสั่ง%sเมนู “%s” แล้ว แต่ยังไม่ได้เปลี่ยนข้อมูล กรุณาตรวจสอบรายละเอียดและกดยืนยันภายใน 5 นาทีครับ",
		aiAvailabilityVerb(preview.DesiredAvailability),
		preview.TargetMenuItemName,
	)
	response.Model = "local-action-preview"
	response.ActionPreview = newAIActionPreviewResponse(preview, confirmationToken)
	return nil
}

func authorizeAIActionPlan(plan ResolvedPlan, actor AIActorContext) error {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return errors.New("AI action requires an authenticated restaurant owner")
	}
	if plan.Task != AITaskRiskyAction || plan.Domain != ResolvedPlanDomainMenu ||
		plan.Operation != ResolvedPlanOperationExecuteAction || plan.Action == nil ||
		plan.Action.Type != ResolvedPlanActionSetMenuAvailability {
		return errors.New("AI action is outside the reviewed action allowlist")
	}
	if plan.Policy.ReadOnly || plan.Policy.Risk != ResolvedPlanRiskHigh || !plan.Policy.RequiresConfirmation {
		return errors.New("AI action requires high-risk write policy and explicit confirmation")
	}
	return nil
}

func (s *AIService) resolveAIActionMenu(restaurantID uint, ref ResolvedPlanEntityRef) (*entity.MenuItem, error) {
	if ref.Type != ResolvedPlanEntityMenu {
		return nil, errAIActionTargetNotFound
	}
	name := strings.TrimSpace(ref.Name)
	if idText := strings.TrimSpace(ref.ID); idText != "" {
		parsedID, err := strconv.ParseUint(idText, 10, 64)
		if err != nil || parsedID == 0 || uint64(uint(parsedID)) != parsedID {
			return nil, errAIActionTargetNotFound
		}
		item, err := s.actionMenuResolver.FindMenuItem(restaurantID, uint(parsedID))
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errAIActionTargetNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("resolve AI action menu id: %w", err)
		}
		if name != "" && !strings.EqualFold(strings.TrimSpace(item.Name), name) {
			return nil, errAIActionTargetAmbiguous
		}
		return item, nil
	}
	if name == "" {
		return nil, errAIActionTargetNotFound
	}
	items, err := s.actionMenuResolver.FindMenuItemsByExactName(restaurantID, name, 2)
	if err != nil {
		return nil, fmt.Errorf("resolve AI action menu name: %w", err)
	}
	switch len(items) {
	case 0:
		return nil, errAIActionTargetNotFound
	case 1:
		return &items[0], nil
	default:
		return nil, errAIActionTargetAmbiguous
	}
}

func setAIActionClarification(response *AIAskResponse, ambiguous bool) {
	answer := "ผมหาเมนูที่ระบุไม่พบในร้านนี้ครับ กรุณาระบุชื่อเมนูให้ตรงกับหน้าจัดการเมนู หรือระบุรหัสเมนูที่ถูกต้อง"
	if ambiguous {
		answer = "ร้านนี้มีเมนูชื่อเดียวกันมากกว่าหนึ่งรายการครับ ผมจะไม่เดาเป้าหมาย กรุณาระบุรหัสเมนูหรือเปลี่ยนชื่อให้แยกกันก่อน"
	}
	response.Answer = answer
	response.Intent = AIIntentUnclear
	response.Task = AITaskUnclear
	response.Model = "local-action-policy"
	response.ActionPreview = nil
}

// setAIActionDisabledResponse answers a recognised menu open/close command when
// the assistant may not act (the owner has not turned actions on). It says so
// plainly — the one thing it must never do is let the model claim the change was
// made.
func setAIActionDisabledResponse(response *AIAskResponse, menuName string, desired bool) {
	verb := aiAvailabilityVerb(desired)
	name := strings.TrimSpace(menuName)
	if name == "" {
		response.Answer = fmt.Sprintf(
			"ผมยัง%sเมนูให้ไม่ได้ครับ ต้องเปิด “ให้ AI ลงมือทำ” ในตั้งค่า AI ก่อน แล้วผมจะเตรียมรายการให้คุณกดยืนยัน",
			verb,
		)
	} else {
		response.Answer = fmt.Sprintf(
			"ผมยัง%sเมนู “%s” ให้ไม่ได้ครับ ต้องเปิด “ให้ AI ลงมือทำ” ในตั้งค่า AI ก่อน แล้วผมจะเตรียมรายการให้คุณกดยืนยัน",
			verb, name,
		)
	}
	response.Intent = AIIntentChat
	response.Task = AITaskGeneralChat
	response.Model = "joyboy-action-disabled"
	response.ActionPreview = nil
}

func setAIActionNoChangeResponse(response *AIAskResponse, menuName string, desired bool) {
	response.Answer = fmt.Sprintf("เมนู “%s” อยู่ในสถานะ%sอยู่แล้ว จึงไม่มีข้อมูลที่ต้องเปลี่ยนครับ", menuName, aiAvailabilityVerb(desired))
	response.Model = "local-action-policy"
	response.ActionPreview = nil
}

func aiAvailabilityVerb(available bool) string {
	if available {
		return "เปิดขาย"
	}
	return "ปิดขาย"
}

func newAIActionPreviewResponse(preview *entity.AIActionPreview, confirmationToken string) *AIActionPreviewResponse {
	warning := "ลูกค้าจะสั่งเมนูนี้ได้ทันทีหลังยืนยัน"
	if !preview.DesiredAvailability {
		warning = "เมนูจะยังแสดงในหน้าสั่งอาหารว่าไม่พร้อมขาย และลูกค้าจะสั่งรายการนี้ไม่ได้"
	}
	return &AIActionPreviewResponse{
		ID:                preview.ID,
		ActionType:        preview.ActionType,
		Status:            preview.Status,
		ExpiresAt:         preview.ExpiresAt,
		ConfirmationToken: confirmationToken,
		Summary: fmt.Sprintf(
			"เปลี่ยนสถานะเมนู “%s” จาก%sเป็น%s",
			preview.TargetMenuItemName,
			aiAvailabilityVerb(preview.ExpectedAvailability),
			aiAvailabilityVerb(preview.DesiredAvailability),
		),
		Target: AIActionPreviewTarget{
			MenuItemID: preview.TargetMenuItemID,
			Name:       preview.TargetMenuItemName,
		},
		Current:   AIActionAvailabilityState{IsAvailable: preview.ExpectedAvailability},
		Requested: AIActionAvailabilityState{IsAvailable: preview.DesiredAvailability},
		Warnings:  []string{warning},
	}
}

func (s *AIService) ConfirmAIActionForOwner(actor AIActorContext, previewID, confirmationToken string) (*AIActionConfirmationResponse, error) {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return nil, errors.New("AI action requires an authenticated restaurant owner")
	}
	if !s.ownerActionsEnabled(actor.RestaurantID) {
		return nil, ErrAIActionsDisabled
	}
	if s.actionStore == nil {
		return nil, ErrAIActionUnavailable
	}

	preview, replayed, err := s.actionStore.ConfirmSetMenuAvailability(
		actor.RestaurantID,
		actor.OwnerUserID,
		strings.TrimSpace(previewID),
		strings.TrimSpace(confirmationToken),
	)
	if err != nil {
		return nil, err
	}
	if preview == nil || preview.CompletedAt == nil {
		return nil, repository.ErrAIActionPreviewInvalidState
	}
	return &AIActionConfirmationResponse{
		ActionID:   preview.ID,
		Status:     preview.Status,
		Replayed:   replayed,
		ExecutedAt: *preview.CompletedAt,
		Message:    "อัปเดตสถานะเมนูเรียบร้อยแล้ว",
		Result: AIActionConfirmationResult{
			MenuItemID:  preview.TargetMenuItemID,
			Name:        preview.TargetMenuItemName,
			IsAvailable: preview.DesiredAvailability,
		},
	}, nil
}

func (s *AIService) CancelAIActionForOwner(actor AIActorContext, previewID string) error {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return errors.New("AI action cancellation requires an authenticated restaurant owner")
	}
	if s.actionStore == nil {
		return ErrAIActionUnavailable
	}

	_, err := s.actionStore.CancelPreview(
		actor.RestaurantID,
		actor.OwnerUserID,
		strings.TrimSpace(previewID),
	)
	if errors.Is(err, repository.ErrAIActionPreviewCancelled) {
		return nil
	}
	return err
}

// --- Joyboy action path -----------------------------------------------------
//
// The planner path above turns an LLM ResolvedPlan into a reviewed write. Joyboy
// has no ResolvedPlan, so this detects an owner's plain-language command
// ("ปิดขายเมนูต้มยำกุ้ง") deterministically and routes it through the SAME reviewed
// boundary: the model never writes, the target is resolved to a tenant-scoped
// menu, and nothing changes until the owner confirms the preview. It is gated by
// the same env flag as the planner path, so it is off unless a restaurant is
// explicitly allowlisted. Only the one canary action (menu availability) exists;
// new action types are a separate, schema-level change.

var joyboyAvailabilityCloseMarkers = []string{"ปิดขาย", "หยุดขาย", "งดขาย", "พักขาย", "ปิดการขาย", "ปิดสถานะ", "ปิดเมนู"}
var joyboyAvailabilityOpenMarkers = []string{"เปิดขาย", "กลับมาขาย", "เปิดการขาย", "เปิดให้ขาย", "เปิดสถานะ", "เปิดเมนู"}

// joyboyQuestionMarkers keep an analytical question ("เมนูไหนควรปิดขาย") from being
// mistaken for an imperative command. A command names a menu; a question asks
// which one.
var joyboyQuestionMarkers = []string{"ไหน", "อะไร", "ทำไม", "กี่", "ควร", "แนะนำ", "น่าจะ", "ดีไหม", "มั้ย"}

var joyboyCommandTrailers = []string{
	"ให้หน่อยครับ", "ให้หน่อยค่ะ", "ให้หน่อย", "หน่อยครับ", "หน่อยค่ะ", "หน่อย",
	"ให้ทีครับ", "ให้ที", "ด้วยครับ", "ด้วยค่ะ", "ด้วย", "ครับ", "ค่ะ", "ที", "แล้ว", "เดี๋ยวนี้",
}

// detectMenuAvailabilityCommand recognises a plain-language open/close-a-menu
// command and pulls out the menu name. It is deliberately conservative: any
// interrogative marker makes it decline, so a question is answered normally
// rather than hijacked into an action. ok is false when this is not a command;
// an empty name with ok=true means "a command, but say which menu" — the caller
// resolves it and asks for clarification.
func detectMenuAvailabilityCommand(question string) (menuName string, desiredAvailable bool, ok bool) {
	n := strings.ToLower(strings.TrimSpace(question))
	if n == "" {
		return "", false, false
	}
	for _, q := range joyboyQuestionMarkers {
		if strings.Contains(n, q) {
			return "", false, false
		}
	}

	pos, markerEnd, available := -1, 0, false
	consider := func(markers []string, avail bool) {
		for _, m := range markers {
			if idx := strings.Index(n, m); idx >= 0 && (pos == -1 || idx < pos) {
				pos, markerEnd, available = idx, idx+len(m), avail
			}
		}
	}
	consider(joyboyAvailabilityCloseMarkers, false)
	consider(joyboyAvailabilityOpenMarkers, true)
	if pos == -1 {
		return "", false, false
	}

	name := strings.TrimSpace(question[markerEnd:])
	name = strings.TrimSpace(strings.TrimPrefix(name, "เมนู"))
	name = strings.Trim(name, "\"'“”‘’ ")
	for changed := true; changed; {
		changed = false
		for _, t := range joyboyCommandTrailers {
			if trimmed := strings.TrimSpace(strings.TrimSuffix(name, t)); trimmed != name {
				name, changed = trimmed, true
			}
		}
	}
	return strings.TrimSpace(name), available, true
}

// maybeCreateJoyboyMenuAvailabilityAction handles an owner's menu open/close
// command inside joyboy mode by creating a pending action preview. It returns
// true when it has taken over the response (a preview, a clarification, or a
// no-change note), so the caller skips the normal read/answer flow. It returns
// false — leaving the question to be answered normally — when actions are off,
// the caller is not an owner, or the text is not a command.
func (s *AIService) maybeCreateJoyboyMenuAvailabilityAction(actor AIActorContext, question string, response *AIAskResponse) bool {
	if s.actionStore == nil || s.actionMenuResolver == nil {
		return false
	}
	name, desired, ok := detectMenuAvailabilityCommand(question)
	if !ok {
		return false
	}
	// The text is a menu open/close command, so this function owns the reply from
	// here — the model must never be left to free-write "done" for a write that
	// never ran. When actions are off (or the caller is not the owner), say so.
	if actor.Role != "owner" || actor.OwnerUserID == 0 || !s.ownerActionsEnabled(actor.RestaurantID) {
		setAIActionDisabledResponse(response, name, desired)
		return true
	}

	menuItem, err := s.resolveAIActionMenu(actor.RestaurantID, ResolvedPlanEntityRef{
		Type: ResolvedPlanEntityMenu,
		Name: name,
	})
	if err != nil {
		if errors.Is(err, errAIActionTargetNotFound) || errors.Is(err, errAIActionTargetAmbiguous) {
			setAIActionClarification(response, errors.Is(err, errAIActionTargetAmbiguous))
			return true
		}
		aiStage("warn", "joyboy action: resolve menu failed (%v) → answering normally", err)
		return false
	}

	preview, confirmationToken, err := s.actionStore.CreateSetMenuAvailabilityPreview(
		repository.CreateSetMenuAvailabilityPreviewParams{
			RestaurantID:        actor.RestaurantID,
			OwnerUserID:         actor.OwnerUserID,
			ConversationID:      "",
			TargetMenuItemID:    menuItem.ID,
			DesiredAvailability: desired,
		},
	)
	if errors.Is(err, repository.ErrAIActionPreviewNoChange) {
		setAIActionNoChangeResponse(response, menuItem.Name, desired)
		return true
	}
	if errors.Is(err, repository.ErrAIActionPreviewNotFound) {
		setAIActionClarification(response, false)
		return true
	}
	if err != nil {
		aiStage("warn", "joyboy action: create preview failed (%v) → answering normally", err)
		return false
	}

	response.Answer = fmt.Sprintf(
		"ผมเตรียมคำสั่ง%sเมนู “%s” แล้ว แต่ยังไม่ได้เปลี่ยนข้อมูล กรุณาตรวจสอบรายละเอียดและกดยืนยันภายใน 5 นาทีครับ",
		aiAvailabilityVerb(preview.DesiredAvailability),
		preview.TargetMenuItemName,
	)
	response.Intent = AIIntentAnalysis
	response.Task = AITaskRecommendAction
	response.Model = "joyboy-action-preview"
	response.ActionPreview = newAIActionPreviewResponse(preview, confirmationToken)
	return true
}
