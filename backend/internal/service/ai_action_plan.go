package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

// The action registry: what the assistant is allowed to do, and how.
//
// Each action type has three separate jobs, kept apart on purpose:
//
//	validate — Go checks the request against the live database (does the thing
//	           exist? is the number sane? is there enough stock?) and builds the
//	           payload. The model's text never becomes a payload directly.
//	preview  — what the owner is shown before confirming, including the side
//	           effects the system will cause on its own (a linked expense that
//	           can never be edited, menus closing when stock hits zero).
//	execute  — calls the same service a button press calls, so business rules
//	           have exactly one implementation and cannot drift.
//
// Nothing here writes. Writing happens only after the owner confirms the plan.

// AIActionPlanStore is the reviewed multi-item write boundary.
type AIActionPlanStore interface {
	CreateAIActionPlan(repository.CreateAIActionPlanParams) (*entity.AIActionPlan, string, error)
	FindAIActionPlan(restaurantID, ownerUserID uint, planID string) (*entity.AIActionPlan, error)
	ClaimAIActionPlan(restaurantID, ownerUserID uint, planID, confirmationToken string) (*entity.AIActionPlan, bool, error)
	FinishAIActionPlan(planID string, outcomes []repository.AIActionPlanItemOutcome) (*entity.AIActionPlan, error)
	CancelAIActionPlan(restaurantID, ownerUserID uint, planID string) (*entity.AIActionPlan, error)
}

// AIActionIngredientPort is the slice of the ingredient service the action layer
// needs: read one ingredient to validate against, and apply a stock change the
// way the inventory screen does.
type AIActionIngredientPort interface {
	FindIngredient(restaurantID, ingredientID uint) (*entity.Ingredient, error)
	AdjustStock(restaurantID, ingredientID, userID uint, req *AdjustStockRequest) (*entity.Ingredient, error)
}

// --- Request shapes handed in by the command layer ---------------------------

// AIAdjustStockCommand is a validated-by-Go intent to change one ingredient's
// stock. Quantity is already expressed in that ingredient's own stock unit.
type AIAdjustStockCommand struct {
	IngredientID uint
	Kind         string // in | out | adjust
	Quantity     float64
	Amount       float64 // baht, only meaningful for kind=in
	Note         string
}

// AIActionItemPayload is what gets persisted for an item. It is deliberately
// explicit rather than a free-form map so a new field is a reviewed change.
type AIActionItemPayload struct {
	IngredientID uint    `json:"ingredient_id,omitempty"`
	Kind         string  `json:"kind,omitempty"`
	Quantity     float64 `json:"quantity,omitempty"`
	Amount       float64 `json:"amount,omitempty"`
	Note         string  `json:"note,omitempty"`
}

// AIActionItemPreview is what the owner reads before confirming.
type AIActionItemPreview struct {
	Title       string   `json:"title"`
	Change      string   `json:"change"`
	Unit        string   `json:"unit,omitempty"`
	SideEffects []string `json:"side_effects,omitempty"`
}

// --- Validation --------------------------------------------------------------

var (
	ErrAIActionUnknownIngredient = errors.New("ไม่พบวัตถุดิบที่ระบุ")
	ErrAIActionBadQuantity       = errors.New("จำนวนต้องมากกว่า 0")
	ErrAIActionBadKind           = errors.New("ชนิดการปรับสต๊อกต้องเป็น in, out หรือ adjust")
	ErrAIActionNotEnoughStock    = errors.New("สต๊อกไม่พอสำหรับตัดออก")
	ErrAIActionAmountOnlyForIn   = errors.New("ยอดเงินใช้ได้เฉพาะการรับเข้า")
)

const aiActionMaxQuantity = 1e12

// validateAdjustStock turns an intent into a payload plus the preview the owner
// will read, checking everything against the live row first.
func validateAdjustStock(port AIActionIngredientPort, restaurantID uint, command AIAdjustStockCommand) (AIActionItemPayload, AIActionItemPreview, error) {
	kind := strings.ToLower(strings.TrimSpace(command.Kind))
	if kind != "in" && kind != "out" && kind != "adjust" {
		return AIActionItemPayload{}, AIActionItemPreview{}, ErrAIActionBadKind
	}
	if command.Quantity <= 0 || command.Quantity > aiActionMaxQuantity {
		return AIActionItemPayload{}, AIActionItemPreview{}, ErrAIActionBadQuantity
	}
	if command.Amount > 0 && kind != "in" {
		return AIActionItemPayload{}, AIActionItemPreview{}, ErrAIActionAmountOnlyForIn
	}

	ingredient, err := port.FindIngredient(restaurantID, command.IngredientID)
	if err != nil || ingredient == nil {
		return AIActionItemPayload{}, AIActionItemPreview{}, ErrAIActionUnknownIngredient
	}

	next, err := aiActionNextStock(ingredient.Stock, kind, command.Quantity)
	if err != nil {
		return AIActionItemPayload{}, AIActionItemPreview{}, err
	}

	// The system charges the restock to the expense ledger itself when a stock-in
	// carries a value — and that row can never be edited or deleted afterwards.
	// The owner must see that before confirming, not discover it later.
	amount := command.Amount
	if kind == "in" && amount == 0 {
		amount = roundBaht(ingredient.CostPerUnit * command.Quantity)
	}

	preview := AIActionItemPreview{
		Title:  ingredient.Name,
		Change: fmt.Sprintf("%s → %s", formatStockNumber(ingredient.Stock), formatStockNumber(next)),
		Unit:   ingredient.Unit,
	}
	if amount > 0 {
		preview.SideEffects = append(preview.SideEffects,
			fmt.Sprintf("บันทึกรายจ่าย %s บาท (แก้หรือลบไม่ได้)", formatStockNumber(amount)))
	}
	if next <= 0 && ingredient.Stock > 0 {
		preview.SideEffects = append(preview.SideEffects, "สต๊อกเหลือ 0 · เมนูที่ใช้วัตถุดิบนี้จะถูกปิดขายอัตโนมัติ")
	}

	return AIActionItemPayload{
		IngredientID: ingredient.ID,
		Kind:         kind,
		Quantity:     command.Quantity,
		Amount:       command.Amount,
		Note:         strings.TrimSpace(command.Note),
	}, preview, nil
}

// aiActionNextStock mirrors the inventory rules: "in" adds, "out" subtracts and
// refuses to go negative, "adjust" sets the level outright.
func aiActionNextStock(current float64, kind string, quantity float64) (float64, error) {
	switch kind {
	case "in":
		return current + quantity, nil
	case "out":
		if current < quantity {
			return 0, ErrAIActionNotEnoughStock
		}
		return current - quantity, nil
	default:
		return quantity, nil
	}
}

func roundBaht(value float64) float64 {
	return float64(int64(value*100+0.5)) / 100
}

// formatStockNumber prints a stock figure without trailing zeros ("2500" not
// "2500.0000"), which is how the inventory screen reads.
func formatStockNumber(value float64) string {
	text := strconv.FormatFloat(value, 'f', -1, 64)
	return text
}

// --- Building and executing a plan -------------------------------------------

// AIActionPlanDraft is a fully validated plan, ready to be stored for
// confirmation. Rejected holds the items that could not be validated, so the
// assistant can tell the owner which parts of a batch it could not take.
type AIActionPlanDraft struct {
	Items    []repository.CreateAIActionPlanItemParams
	Previews []AIActionItemPreview
	Rejected []AIActionRejectedItem
}

type AIActionRejectedItem struct {
	Title  string
	Reason string
}

// BuildAdjustStockPlan validates every requested stock change and returns the
// draft. Invalid items are reported, not silently dropped.
func BuildAdjustStockPlan(port AIActionIngredientPort, restaurantID uint, commands []AIAdjustStockCommand, titles []string) AIActionPlanDraft {
	draft := AIActionPlanDraft{}
	for index, command := range commands {
		title := ""
		if index < len(titles) {
			title = titles[index]
		}
		payload, preview, err := validateAdjustStock(port, restaurantID, command)
		if err != nil {
			if title == "" {
				title = fmt.Sprintf("รายการที่ %d", index+1)
			}
			draft.Rejected = append(draft.Rejected, AIActionRejectedItem{Title: title, Reason: err.Error()})
			continue
		}
		payloadJSON, err := json.Marshal(payload)
		if err != nil {
			draft.Rejected = append(draft.Rejected, AIActionRejectedItem{Title: preview.Title, Reason: "สร้างคำสั่งไม่สำเร็จ"})
			continue
		}
		previewJSON, err := json.Marshal(preview)
		if err != nil {
			draft.Rejected = append(draft.Rejected, AIActionRejectedItem{Title: preview.Title, Reason: "สร้างคำสั่งไม่สำเร็จ"})
			continue
		}
		draft.Items = append(draft.Items, repository.CreateAIActionPlanItemParams{
			ActionType:  entity.AIActionTypeAdjustIngredientStock,
			PayloadJSON: string(payloadJSON),
			PreviewJSON: string(previewJSON),
		})
		draft.Previews = append(draft.Previews, preview)
	}
	return draft
}

// executeAIActionItem runs one stored item through the normal service path.
func executeAIActionItem(port AIActionIngredientPort, restaurantID, actorUserID uint, item entity.AIActionPlanItem) error {
	switch item.ActionType {
	case entity.AIActionTypeAdjustIngredientStock:
		var payload AIActionItemPayload
		if err := json.Unmarshal([]byte(item.PayloadJSON), &payload); err != nil {
			return errors.New("คำสั่งเสียหาย")
		}
		_, err := port.AdjustStock(restaurantID, payload.IngredientID, actorUserID, &AdjustStockRequest{
			Type:     payload.Kind,
			Quantity: payload.Quantity,
			Amount:   payload.Amount,
			Note:     payload.Note,
		})
		return err
	default:
		return fmt.Errorf("ยังไม่รองรับคำสั่งชนิด %q", item.ActionType)
	}
}
