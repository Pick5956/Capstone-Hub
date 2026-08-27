package service

import (
	"fmt"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

// Joyboy's inventory command path.
//
// A sentence becomes a proposal (model), the proposal becomes checked commands
// (Go, against the live shelf), and checked commands become a plan the owner
// confirms. Every branch that cannot proceed says why — a question, an offer to
// add the missing ingredient, or a plain "actions are off" — because the one
// unacceptable outcome is the assistant claiming it did something it did not.

// aiStockCommandMarkers keep the extraction round off questions. Running it on
// every message would spend a model call per turn and invite false positives on
// wording like "ยอดขายเพิ่มขึ้น"; a stock command always says what to do to the
// shelf.
var aiStockCommandMarkers = []string{
	"รับเข้า", "รับของ", "รับ", "เติมสต๊อก", "เติมสต็อก", "เติม",
	"ตัดออก", "ตัดสต๊อก", "ตัดสต็อก", "หักออก", "ใช้ไป", "ทิ้ง", "เสีย",
	"ปรับสต๊อก", "ปรับสต็อก", "ปรับยอด", "ตั้งยอด", "นับได้", "ปรับเป็น",
	"เพิ่มวัตถุดิบ", "เพิ่มของ", "เพิ่มเข้าคลัง", "เข้าคลัง",
	"ตั้งขั้นต่ำ", "ขั้นต่ำ", "แจ้งเตือนเมื่อเหลือ",
	"ขึ้นราคา", "ลดราคา", "ตั้งราคา", "ราคาต่อ", "กิโลละ", "ต้นทุนเป็น",
}

// aiStockCommandExcluded filters the analytical questions that share vocabulary
// with a command ("วัตถุดิบไหนควรเติม") — those are answered, not acted on.
var aiStockCommandExcluded = []string{"ไหน", "อะไรบ้าง", "เท่าไหร่", "กี่", "ควร", "แนะนำ", "ทำไม", "ดีไหม", "มั้ย"}

// looksLikeStockCommand is a cheap pre-filter, not the decision. The decision is
// made by the extractor plus Go validation downstream.
func looksLikeStockCommand(question string) bool {
	text := strings.ToLower(strings.TrimSpace(question))
	if text == "" {
		return false
	}
	for _, excluded := range aiStockCommandExcluded {
		if strings.Contains(text, excluded) {
			return false
		}
	}
	for _, marker := range aiStockCommandMarkers {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

// AIActionPlanResponse is the confirm-bar payload for a multi-item plan.
type AIActionPlanResponse struct {
	ID                string                    `json:"id"`
	Status            string                    `json:"status"`
	ExpiresAt         string                    `json:"expires_at"`
	ConfirmationToken string                    `json:"confirmation_token"`
	Summary           string                    `json:"summary"`
	Items             []AIActionPlanItemResponse `json:"items"`
	Warnings          []string                  `json:"warnings,omitempty"`
}

type AIActionPlanItemResponse struct {
	Title       string   `json:"title"`
	Change      string   `json:"change"`
	Unit        string   `json:"unit,omitempty"`
	SideEffects []string `json:"side_effects,omitempty"`
}

// maybeHandleJoyboyStockCommand answers an inventory command. It reports handled
// = true whenever it has taken over the reply, so the caller skips the normal
// read/answer flow and the model never free-writes about a write.
func (s *AIService) maybeHandleJoyboyStockCommand(actor AIActorContext, request *AIAskRequest, response *AIAskResponse) bool {
	if s.actionPlanStore == nil || s.actionIngredients == nil || s.repo == nil {
		return false
	}
	if !looksLikeStockCommand(request.Question) {
		return false
	}

	drafts, err := s.ExtractStockCommands(request.Question, request.History)
	if err != nil || len(drafts) == 0 {
		return false
	}

	// Actions off (or not the owner): say so rather than letting the answer round
	// describe a change that will not happen.
	if actor.Role != "owner" || actor.OwnerUserID == 0 || !s.ownerActionsEnabled(actor.RestaurantID) {
		response.Answer = "ผมยังแก้ข้อมูลคลังให้ไม่ได้ครับ ต้องเปิด “ให้ AI ลงมือทำ” ในตั้งค่า AI ก่อน แล้วผมจะเตรียมรายการให้คุณกดยืนยัน"
		response.Intent = AIIntentChat
		response.Task = AITaskGeneralChat
		response.Model = "joyboy-action-disabled"
		return true
	}

	shelf, err := s.actionIngredients.ListIngredients(actor.RestaurantID)
	if err != nil {
		aiStage("warn", "joyboy command: listing ingredients failed (%v) → answering normally", err)
		return false
	}

	commands := make([]AIAdjustStockCommand, 0, len(drafts))
	titles := make([]string, 0, len(drafts))
	questions := make([]string, 0, 2)
	for _, draft := range drafts {
		resolution := ResolveStockCommand(shelf, draft)
		switch resolution.Kind {
		case AICommandOutcomeReady:
			commands = append(commands, resolution.Command)
			titles = append(titles, resolution.Title)
		default:
			// A question and an offer to add a missing ingredient are both simply
			// asked; the owner's next message flows back through this path with the
			// history attached.
			questions = append(questions, resolution.Question)
		}
	}

	// Anything unclear is asked before a plan is built, so the owner never
	// confirms half of what they said without knowing.
	if len(questions) > 0 {
		response.Answer = strings.Join(questions, "\n")
		response.Intent = AIIntentUnclear
		response.Task = AITaskUnclear
		response.Model = "joyboy-command-clarify"
		return true
	}
	if len(commands) == 0 {
		return false
	}

	draft := BuildAdjustStockPlan(s.actionIngredients, actor.RestaurantID, commands, titles)
	if len(draft.Items) == 0 {
		response.Answer = aiRejectedItemsMessage(draft.Rejected)
		response.Intent = AIIntentChat
		response.Task = AITaskGeneralChat
		response.Model = "joyboy-command-rejected"
		return true
	}

	summary := aiStockPlanSummary(draft.Previews)
	plan, token, err := s.actionPlanStore.CreateAIActionPlan(repository.CreateAIActionPlanParams{
		RestaurantID: actor.RestaurantID,
		OwnerUserID:  actor.OwnerUserID,
		Summary:      summary,
		Items:        draft.Items,
	})
	if err != nil {
		aiStage("warn", "joyboy command: creating the plan failed (%v)", err)
		response.Answer = "ผมเตรียมคำสั่งไม่สำเร็จครับ ลองพิมพ์ใหม่อีกครั้ง"
		response.Intent = AIIntentChat
		response.Task = AITaskGeneralChat
		response.Model = "joyboy-command-failed"
		return true
	}

	items := make([]AIActionPlanItemResponse, 0, len(draft.Previews))
	for _, preview := range draft.Previews {
		items = append(items, AIActionPlanItemResponse{
			Title:       preview.Title,
			Change:      preview.Change,
			Unit:        preview.Unit,
			SideEffects: preview.SideEffects,
		})
	}

	answer := fmt.Sprintf("ผมเตรียม%sแล้ว ยังไม่ได้แก้ข้อมูล กดยืนยันภายใน 1 นาทีครับ", summary)
	warnings := make([]string, 0, len(draft.Rejected))
	if len(draft.Rejected) > 0 {
		answer += "\n" + aiRejectedItemsMessage(draft.Rejected)
		for _, rejected := range draft.Rejected {
			warnings = append(warnings, fmt.Sprintf("%s — %s", rejected.Title, rejected.Reason))
		}
	}

	response.Answer = answer
	response.Intent = AIIntentAnalysis
	response.Task = AITaskRecommendAction
	response.Model = "joyboy-command-plan"
	response.ActionPlan = &AIActionPlanResponse{
		ID:                plan.ID,
		Status:            plan.Status,
		ExpiresAt:         plan.ExpiresAt.Format(aiActionPlanTimeLayout),
		ConfirmationToken: token,
		Summary:           summary,
		Items:             items,
		Warnings:          warnings,
	}
	return true
}

const aiActionPlanTimeLayout = "2006-01-02T15:04:05Z07:00"

func aiStockPlanSummary(previews []AIActionItemPreview) string {
	if len(previews) == 1 {
		return fmt.Sprintf("ปรับสต๊อก “%s”", previews[0].Title)
	}
	return fmt.Sprintf("ปรับสต๊อก %d รายการ", len(previews))
}

func aiRejectedItemsMessage(rejected []AIActionRejectedItem) string {
	if len(rejected) == 0 {
		return ""
	}
	lines := make([]string, 0, len(rejected)+1)
	lines = append(lines, "รายการที่ผมทำให้ไม่ได้:")
	for _, item := range rejected {
		lines = append(lines, fmt.Sprintf("- %s — %s", item.Title, item.Reason))
	}
	return strings.Join(lines, "\n")
}

// ConfirmAIActionPlanForOwner runs a confirmed plan: claim it (which makes a
// second confirmation a no-op), execute each item through the normal services,
// then record what happened.
func (s *AIService) ConfirmAIActionPlanForOwner(actor AIActorContext, planID, confirmationToken string) (*AIActionPlanConfirmation, error) {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return nil, ErrAIActionsDisabled
	}
	if !s.ownerActionsEnabled(actor.RestaurantID) {
		return nil, ErrAIActionsDisabled
	}
	if s.actionPlanStore == nil || s.actionIngredients == nil {
		return nil, ErrAIActionUnavailable
	}

	plan, replayed, err := s.actionPlanStore.ClaimAIActionPlan(actor.RestaurantID, actor.OwnerUserID, planID, confirmationToken)
	if err != nil {
		return nil, err
	}
	if replayed {
		return newAIActionPlanConfirmation(plan, true), nil
	}

	outcomes := make([]repository.AIActionPlanItemOutcome, 0, len(plan.Items))
	for _, item := range plan.Items {
		execErr := executeAIActionItem(s.actionIngredients, actor.RestaurantID, actor.OwnerUserID, item)
		outcome := repository.AIActionPlanItemOutcome{ItemID: item.ID, Succeeded: execErr == nil}
		if execErr != nil {
			outcome.ErrorText = execErr.Error()
			aiStage("warn", "joyboy plan %s item %d failed: %v", plan.ID, item.ID, execErr)
		}
		outcomes = append(outcomes, outcome)
	}

	finished, err := s.actionPlanStore.FinishAIActionPlan(plan.ID, outcomes)
	if err != nil {
		return nil, err
	}
	return newAIActionPlanConfirmation(finished, false), nil
}

// CancelAIActionPlanForOwner drops a pending plan without writing anything.
func (s *AIService) CancelAIActionPlanForOwner(actor AIActorContext, planID string) error {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return ErrAIActionsDisabled
	}
	if s.actionPlanStore == nil {
		return ErrAIActionUnavailable
	}
	_, err := s.actionPlanStore.CancelAIActionPlan(actor.RestaurantID, actor.OwnerUserID, planID)
	return err
}

// AIActionPlanConfirmation reports the outcome per item, so a batch that partly
// failed is visible rather than rounded to "done".
type AIActionPlanConfirmation struct {
	PlanID    string                        `json:"plan_id"`
	Status    string                        `json:"status"`
	Replayed  bool                          `json:"replayed"`
	Message   string                        `json:"message"`
	Succeeded int                           `json:"succeeded"`
	Failed    int                           `json:"failed"`
	Items     []AIActionPlanItemOutcomeView `json:"items"`
}

type AIActionPlanItemOutcomeView struct {
	Title     string `json:"title"`
	Succeeded bool   `json:"succeeded"`
	Error     string `json:"error,omitempty"`
}

func newAIActionPlanConfirmation(plan *entity.AIActionPlan, replayed bool) *AIActionPlanConfirmation {
	confirmation := &AIActionPlanConfirmation{
		PlanID:   plan.ID,
		Status:   plan.Status,
		Replayed: replayed,
	}
	for _, item := range plan.Items {
		title := aiActionItemTitle(item)
		succeeded := item.Status == entity.AIActionItemStatusExecuted
		if succeeded {
			confirmation.Succeeded++
		} else {
			confirmation.Failed++
		}
		confirmation.Items = append(confirmation.Items, AIActionPlanItemOutcomeView{
			Title:     title,
			Succeeded: succeeded,
			Error:     item.ErrorText,
		})
	}
	switch {
	case confirmation.Failed == 0:
		confirmation.Message = "บันทึกลงระบบแล้ว มีผลทันทีครับ"
	case confirmation.Succeeded == 0:
		confirmation.Message = "ทำไม่สำเร็จครับ ข้อมูลไม่ถูกเปลี่ยน"
	default:
		confirmation.Message = fmt.Sprintf("สำเร็จ %d รายการ ไม่สำเร็จ %d รายการครับ", confirmation.Succeeded, confirmation.Failed)
	}
	return confirmation
}

func aiActionItemTitle(item entity.AIActionPlanItem) string {
	var preview AIActionItemPreview
	if err := jsonUnmarshalString(item.PreviewJSON, &preview); err == nil && strings.TrimSpace(preview.Title) != "" {
		return preview.Title
	}
	return item.ActionType
}
