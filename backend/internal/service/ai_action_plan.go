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
	ListIngredients(restaurantID uint) ([]entity.Ingredient, error)
	FindIngredient(restaurantID, ingredientID uint) (*entity.Ingredient, error)
	AdjustStock(restaurantID, ingredientID, userID uint, req *AdjustStockRequest) (*entity.Ingredient, error)
	Create(restaurantID, userID uint, req *IngredientRequest) (*entity.Ingredient, error)
	Update(restaurantID, ingredientID uint, req *IngredientRequest) (*entity.Ingredient, error)
}

// AIActionMenuPort is the slice of the menu service the action layer needs: read
// the catalogue to resolve a spoken name, re-read one row to validate against,
// and flip its availability the way the menu screen's toggle does.
type AIActionMenuPort interface {
	ListMenuItems(restaurantID uint, includeInactive bool, categoryID uint) ([]entity.MenuItem, error)
	FindMenuItem(restaurantID, itemID uint) (*entity.MenuItem, error)
	UpdateMenuItemAvailability(restaurantID, itemID uint, req *MenuItemAvailabilityRequest) (*entity.MenuItem, error)
}

// AITablePort is the read-only slice of the table service the assistant needs.
// There is no write method here on purpose: booking a table is left to the table
// screen, where it takes effect the moment it is tapped (see joyboyToolTableStatus).
type AITablePort interface {
	ListTables(restaurantID uint) ([]entity.RestaurantTable, error)
}

// jsonUnmarshalString decodes a stored JSON column into a typed value.
func jsonUnmarshalString(raw string, target any) error {
	return json.Unmarshal([]byte(raw), target)
}

// --- Request shapes handed in by the command layer ---------------------------

// AIAdjustStockCommand is a validated-by-Go intent to change one thing:
// an ingredient's stock, one of its fields, or whether a menu is being sold.
// Quantity is already expressed in that ingredient's own stock unit.
type AIAdjustStockCommand struct {
	IngredientID uint
	Kind         string // in | out | adjust | min | cost | create | menu_on | menu_off
	Quantity     float64
	Amount       float64 // baht, only meaningful for kind=in
	Note         string
	// Set only when Kind is create.
	Name string
	Unit string
	// Set only for the menu kinds.
	MenuItemID uint
	Available  bool
}

// AIActionItemPayload is what gets persisted for an item. It is deliberately
// explicit rather than a free-form map so a new field is a reviewed change.
type AIActionItemPayload struct {
	IngredientID uint    `json:"ingredient_id,omitempty"`
	Kind         string  `json:"kind,omitempty"`
	Quantity     float64 `json:"quantity,omitempty"`
	Amount       float64 `json:"amount,omitempty"`
	Note         string  `json:"note,omitempty"`
	// Used by the ingredient-editing types.
	Name        string  `json:"name,omitempty"`
	Unit        string  `json:"unit,omitempty"`
	MinStock    float64 `json:"min_stock,omitempty"`
	CostPerUnit float64 `json:"cost_per_unit,omitempty"`
	// Used by set_menu_availability. Available carries no omitempty on purpose:
	// closing a menu IS the false value, and omitting it would store a payload
	// that reads as "no change requested".
	MenuItemID uint `json:"menu_item_id,omitempty"`
	Available  bool `json:"available"`
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

// validateSetIngredientField checks a min-stock or cost change against the live
// row and describes it as "from → to", the only rendering that makes the
// difference between setting and adding unmistakable.
func validateSetIngredientField(port AIActionIngredientPort, restaurantID uint, ingredientID uint, actionType string, value float64) (AIActionItemPayload, AIActionItemPreview, error) {
	if value < 0 || value > aiActionMaxQuantity {
		return AIActionItemPayload{}, AIActionItemPreview{}, ErrAIActionBadQuantity
	}
	ingredient, err := port.FindIngredient(restaurantID, ingredientID)
	if err != nil || ingredient == nil {
		return AIActionItemPayload{}, AIActionItemPreview{}, ErrAIActionUnknownIngredient
	}

	payload := AIActionItemPayload{IngredientID: ingredient.ID}
	preview := AIActionItemPreview{Title: ingredient.Name}
	switch actionType {
	case entity.AIActionTypeSetIngredientMinStock:
		payload.MinStock = value
		preview.Change = fmt.Sprintf("ขั้นต่ำ %s → %s", formatStockNumber(ingredient.MinStock), formatStockNumber(value))
		preview.Unit = ingredient.Unit
		if ingredient.Stock < value {
			preview.SideEffects = append(preview.SideEffects, "สต๊อกตอนนี้ต่ำกว่าขั้นต่ำใหม่ · จะขึ้นเตือนว่าใกล้หมด")
		}
	case entity.AIActionTypeSetIngredientCost:
		payload.CostPerUnit = value
		preview.Change = fmt.Sprintf("ราคาต่อ%s %s → %s บาท", ingredient.Unit, formatStockNumber(ingredient.CostPerUnit), formatStockNumber(value))
		preview.SideEffects = append(preview.SideEffects, "กระทบต้นทุนและกำไรของเมนูที่ใช้วัตถุดิบนี้")
	default:
		return AIActionItemPayload{}, AIActionItemPreview{}, fmt.Errorf("ยังไม่รองรับคำสั่งชนิด %q", actionType)
	}
	return payload, preview, nil
}

// validateCreateIngredient refuses a nameless or unitless ingredient: the unit is
// what recipes are measured against, and the system never converts, so guessing
// it would misread every recipe that later uses this item.
func validateCreateIngredient(shelf []entity.Ingredient, name, unit string, stock, minStock, cost float64) (AIActionItemPayload, AIActionItemPreview, error) {
	cleanName := strings.TrimSpace(name)
	cleanUnit := strings.TrimSpace(unit)
	if cleanName == "" {
		return AIActionItemPayload{}, AIActionItemPreview{}, errors.New("ต้องมีชื่อวัตถุดิบ")
	}
	if cleanUnit == "" {
		return AIActionItemPayload{}, AIActionItemPreview{}, errors.New("ต้องระบุหน่วย เช่น กรัม หรือ ฟอง")
	}
	if match := ResolveIngredientName(shelf, cleanName); match.Exact != nil {
		return AIActionItemPayload{}, AIActionItemPreview{}, fmt.Errorf("มี “%s” ในคลังอยู่แล้ว", match.Exact.Name)
	}

	preview := AIActionItemPreview{
		Title:  cleanName,
		Change: fmt.Sprintf("เพิ่มเข้าคลัง · หน่วย%s · เริ่มที่ %s", cleanUnit, formatStockNumber(stock)),
		Unit:   cleanUnit,
	}
	if stock > 0 && cost > 0 {
		preview.SideEffects = append(preview.SideEffects,
			fmt.Sprintf("บันทึกรายจ่าย %s บาท (แก้หรือลบไม่ได้)", formatStockNumber(roundBaht(stock*cost))))
	}
	return AIActionItemPayload{
		Name:        cleanName,
		Unit:        cleanUnit,
		Quantity:    stock,
		MinStock:    minStock,
		CostPerUnit: cost,
	}, preview, nil
}

// validateSetMenuAvailability re-reads the menu row and describes the flip in
// the words the owner used to think about it. The row is read again here rather
// than trusted from the catalogue listing, so a toggle someone pressed on the
// menu screen a second ago is what the preview reflects.
func validateSetMenuAvailability(port AIActionMenuPort, restaurantID, menuItemID uint, available bool) (AIActionItemPayload, AIActionItemPreview, error) {
	if port == nil {
		return AIActionItemPayload{}, AIActionItemPreview{}, ErrAIActionUnavailable
	}
	item, err := port.FindMenuItem(restaurantID, menuItemID)
	if err != nil || item == nil {
		return AIActionItemPayload{}, AIActionItemPreview{}, errAIActionTargetNotFound
	}
	if item.IsAvailable == available {
		return AIActionItemPayload{}, AIActionItemPreview{}, fmt.Errorf("“%s” %sอยู่แล้ว", item.Name, aiAvailabilityStateWord(available))
	}

	preview := AIActionItemPreview{
		Title: item.Name,
		Change: fmt.Sprintf("%s → %s",
			aiAvailabilityStateWord(item.IsAvailable), aiAvailabilityStateWord(available)),
	}
	if available {
		preview.SideEffects = append(preview.SideEffects, "ลูกค้าจะสั่งเมนูนี้ได้ทันที")
	} else {
		preview.SideEffects = append(preview.SideEffects, "เมนูนี้จะหายจากหน้าสั่งอาหาร · ออเดอร์ที่สั่งไปแล้วไม่กระทบ")
	}
	return AIActionItemPayload{MenuItemID: item.ID, Available: available}, preview, nil
}

func aiAvailabilityStateWord(available bool) string {
	if available {
		return "เปิดขาย"
	}
	return "ปิดขาย"
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

// aiValidateCommand sends one command to the validator for its kind and reports
// which action type it becomes.
func aiValidateCommand(port AIActionIngredientPort, menuPort AIActionMenuPort, restaurantID uint, command AIAdjustStockCommand) (AIActionItemPayload, AIActionItemPreview, string, error) {
	switch command.Kind {
	case "menu_on", "menu_off":
		payload, preview, err := validateSetMenuAvailability(menuPort, restaurantID, command.MenuItemID, command.Available)
		return payload, preview, entity.AIActionTypeSetMenuAvailability, err
	case "min":
		payload, preview, err := validateSetIngredientField(port, restaurantID, command.IngredientID, entity.AIActionTypeSetIngredientMinStock, command.Quantity)
		return payload, preview, entity.AIActionTypeSetIngredientMinStock, err
	case "cost":
		payload, preview, err := validateSetIngredientField(port, restaurantID, command.IngredientID, entity.AIActionTypeSetIngredientCost, command.Quantity)
		return payload, preview, entity.AIActionTypeSetIngredientCost, err
	case "create":
		shelf, err := port.ListIngredients(restaurantID)
		if err != nil {
			return AIActionItemPayload{}, AIActionItemPreview{}, "", err
		}
		payload, preview, err := validateCreateIngredient(shelf, command.Name, command.Unit, command.Quantity, 0, 0)
		return payload, preview, entity.AIActionTypeCreateIngredient, err
	default:
		payload, preview, err := validateAdjustStock(port, restaurantID, command)
		return payload, preview, entity.AIActionTypeAdjustIngredientStock, err
	}
}

// BuildAdjustStockPlan validates every requested change and returns the draft.
// Invalid items are reported, not silently dropped.
func BuildAdjustStockPlan(port AIActionIngredientPort, menuPort AIActionMenuPort, restaurantID uint, commands []AIAdjustStockCommand, titles []string) AIActionPlanDraft {
	draft := AIActionPlanDraft{}
	for index, command := range commands {
		title := ""
		if index < len(titles) {
			title = titles[index]
		}
		payload, preview, actionType, err := aiValidateCommand(port, menuPort, restaurantID, command)
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
			ActionType:  actionType,
			PayloadJSON: string(payloadJSON),
			PreviewJSON: string(previewJSON),
		})
		draft.Previews = append(draft.Previews, preview)
	}
	return draft
}

// executeAIActionItem runs one stored item through the normal service path.
func executeAIActionItem(port AIActionIngredientPort, menuPort AIActionMenuPort, restaurantID, actorUserID uint, item entity.AIActionPlanItem) error {
	switch item.ActionType {
	case entity.AIActionTypeSetMenuAvailability:
		// The same call the availability toggle on the menu screen makes, so
		// whatever that does — and whatever it grows into — happens here too.
		var payload AIActionItemPayload
		if err := json.Unmarshal([]byte(item.PayloadJSON), &payload); err != nil {
			return errors.New("คำสั่งเสียหาย")
		}
		if menuPort == nil {
			return ErrAIActionUnavailable
		}
		_, err := menuPort.UpdateMenuItemAvailability(restaurantID, payload.MenuItemID, &MenuItemAvailabilityRequest{
			IsAvailable: payload.Available,
		})
		return err

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
	case entity.AIActionTypeSetIngredientMinStock, entity.AIActionTypeSetIngredientCost:
		// Editing one field goes through the same Update the inventory form uses,
		// so its validation and its "unit cannot change while recipes use it" rule
		// still apply. The current row is re-read here so a concurrent edit to any
		// other field is preserved rather than overwritten with a stale copy.
		var payload AIActionItemPayload
		if err := json.Unmarshal([]byte(item.PayloadJSON), &payload); err != nil {
			return errors.New("คำสั่งเสียหาย")
		}
		current, err := port.FindIngredient(restaurantID, payload.IngredientID)
		if err != nil || current == nil {
			return ErrAIActionUnknownIngredient
		}
		request := aiIngredientRequestFrom(current)
		if item.ActionType == entity.AIActionTypeSetIngredientMinStock {
			request.MinStock = payload.MinStock
		} else {
			request.CostPerUnit = payload.CostPerUnit
		}
		_, err = port.Update(restaurantID, payload.IngredientID, request)
		return err

	case entity.AIActionTypeCreateIngredient:
		var payload AIActionItemPayload
		if err := json.Unmarshal([]byte(item.PayloadJSON), &payload); err != nil {
			return errors.New("คำสั่งเสียหาย")
		}
		_, err := port.Create(restaurantID, actorUserID, &IngredientRequest{
			Name:        payload.Name,
			Unit:        payload.Unit,
			Stock:       payload.Quantity,
			MinStock:    payload.MinStock,
			CostPerUnit: payload.CostPerUnit,
		})
		return err

	default:
		return fmt.Errorf("ยังไม่รองรับคำสั่งชนิด %q", item.ActionType)
	}
}

// aiIngredientRequestFrom copies a stored ingredient into the shape Update
// expects, so changing one field leaves the rest exactly as they were.
func aiIngredientRequestFrom(item *entity.Ingredient) *IngredientRequest {
	request := &IngredientRequest{
		Name:         item.Name,
		SKU:          item.SKU,
		ImageURL:     item.ImageURL,
		Unit:         item.Unit,
		Stock:        item.Stock,
		MinStock:     item.MinStock,
		CostPerUnit:  item.CostPerUnit,
		YieldPercent: item.YieldPercent,
		StorageType:  item.StorageType,
	}
	if item.CategoryID != nil {
		request.CategoryID = *item.CategoryID
	}
	return request
}
