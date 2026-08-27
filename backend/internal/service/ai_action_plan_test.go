package service

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"Project-M/internal/entity"
)

// fakeAIActionIngredientPort stands in for the ingredient service: it answers
// lookups from a small table and records what would have been written.
type fakeAIActionIngredientPort struct {
	items     map[uint]*entity.Ingredient
	adjusted  []AdjustStockRequest
	adjustErr error
}

func (f *fakeAIActionIngredientPort) FindIngredient(_ uint, ingredientID uint) (*entity.Ingredient, error) {
	item, ok := f.items[ingredientID]
	if !ok {
		return nil, errors.New("not found")
	}
	copied := *item
	return &copied, nil
}

func (f *fakeAIActionIngredientPort) AdjustStock(_ uint, ingredientID, _ uint, req *AdjustStockRequest) (*entity.Ingredient, error) {
	if f.adjustErr != nil {
		return nil, f.adjustErr
	}
	f.adjusted = append(f.adjusted, *req)
	return f.items[ingredientID], nil
}

func newAIActionPortFixture() *fakeAIActionIngredientPort {
	basil := &entity.Ingredient{Name: "กะเพรา", Unit: "กรัม", Stock: 500, CostPerUnit: 0.06}
	basil.ID = 1
	pork := &entity.Ingredient{Name: "หมูสับ", Unit: "กรัม", Stock: 2000, CostPerUnit: 0.18}
	pork.ID = 2
	return &fakeAIActionIngredientPort{items: map[uint]*entity.Ingredient{1: basil, 2: pork}}
}

// Stock maths must match the inventory screen exactly: "in" adds, "out" refuses
// to go negative, "adjust" replaces the level outright — the difference an owner
// would never see from the words alone, which is why the preview spells it out.
func TestValidateAdjustStockAppliesInventoryRules(t *testing.T) {
	port := newAIActionPortFixture()

	_, preview, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 1, Kind: "in", Quantity: 2000})
	if err != nil {
		t.Fatalf("stock-in should validate: %v", err)
	}
	if preview.Change != "500 → 2500" || preview.Unit != "กรัม" || preview.Title != "กะเพรา" {
		t.Errorf("stock-in preview = %+v", preview)
	}

	_, preview, err = validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 1, Kind: "adjust", Quantity: 300})
	if err != nil || preview.Change != "500 → 300" {
		t.Errorf("adjust should set the level outright, got %+v err=%v", preview, err)
	}

	if _, _, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 1, Kind: "out", Quantity: 900}); !errors.Is(err, ErrAIActionNotEnoughStock) {
		t.Errorf("taking more than the shelf holds must fail, got %v", err)
	}
	if _, _, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 99, Kind: "in", Quantity: 1}); !errors.Is(err, ErrAIActionUnknownIngredient) {
		t.Errorf("unknown ingredient must fail, got %v", err)
	}
	if _, _, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 1, Kind: "in", Quantity: 0}); !errors.Is(err, ErrAIActionBadQuantity) {
		t.Errorf("zero quantity must fail, got %v", err)
	}
	if _, _, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 1, Kind: "out", Quantity: 10, Amount: 50}); !errors.Is(err, ErrAIActionAmountOnlyForIn) {
		t.Errorf("only a stock-in may carry money, got %v", err)
	}
}

// The two side effects the system causes on its own must appear in the preview:
// a linked expense that can never be edited, and menus closing at zero stock.
func TestValidateAdjustStockShowsSideEffects(t *testing.T) {
	port := newAIActionPortFixture()

	_, preview, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 2, Kind: "in", Quantity: 1000})
	if err != nil {
		t.Fatalf("stock-in should validate: %v", err)
	}
	joined := strings.Join(preview.SideEffects, " | ")
	if !strings.Contains(joined, "บันทึกรายจ่าย") || !strings.Contains(joined, "แก้หรือลบไม่ได้") {
		t.Errorf("a valued stock-in must warn about the linked expense: %q", joined)
	}

	_, preview, err = validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 1, Kind: "out", Quantity: 500})
	if err != nil {
		t.Fatalf("emptying the shelf should validate: %v", err)
	}
	if !strings.Contains(strings.Join(preview.SideEffects, " | "), "ปิดขายอัตโนมัติ") {
		t.Errorf("hitting zero stock must warn that menus close: %+v", preview.SideEffects)
	}
}

// A batch keeps the good items and reports the bad ones — never silently drops
// part of what the owner asked for.
func TestBuildAdjustStockPlanReportsRejectedItems(t *testing.T) {
	port := newAIActionPortFixture()
	draft := BuildAdjustStockPlan(port, 1, []AIAdjustStockCommand{
		{IngredientID: 1, Kind: "in", Quantity: 100},
		{IngredientID: 99, Kind: "in", Quantity: 100},
		{IngredientID: 2, Kind: "out", Quantity: 500},
	}, []string{"กะเพรา", "ผักชี", "หมูสับ"})

	if len(draft.Items) != 2 || len(draft.Previews) != 2 {
		t.Fatalf("two items should validate, got %d", len(draft.Items))
	}
	if len(draft.Rejected) != 1 || draft.Rejected[0].Title != "ผักชี" {
		t.Fatalf("the unknown ingredient should be reported, got %+v", draft.Rejected)
	}
	for _, item := range draft.Items {
		if item.ActionType != entity.AIActionTypeAdjustIngredientStock {
			t.Errorf("unexpected action type %q", item.ActionType)
		}
		var payload AIActionItemPayload
		if err := json.Unmarshal([]byte(item.PayloadJSON), &payload); err != nil {
			t.Errorf("payload must be valid JSON: %v", err)
		}
		if payload.IngredientID == 0 || payload.Quantity <= 0 {
			t.Errorf("payload lost its values: %+v", payload)
		}
	}
}

// Executing an item goes through the normal ingredient service, so stock maths,
// the linked expense and menu auto-closing keep one implementation.
func TestExecuteAIActionItemCallsIngredientService(t *testing.T) {
	port := newAIActionPortFixture()
	payload, _ := json.Marshal(AIActionItemPayload{IngredientID: 1, Kind: "in", Quantity: 250, Amount: 15, Note: "ตลาดเช้า"})
	item := entity.AIActionPlanItem{ActionType: entity.AIActionTypeAdjustIngredientStock, PayloadJSON: string(payload)}

	if err := executeAIActionItem(port, 1, 7, item); err != nil {
		t.Fatalf("execute error = %v", err)
	}
	if len(port.adjusted) != 1 {
		t.Fatalf("expected one adjust call, got %d", len(port.adjusted))
	}
	got := port.adjusted[0]
	if got.Type != "in" || got.Quantity != 250 || got.Amount != 15 || got.Note != "ตลาดเช้า" {
		t.Errorf("service received %+v", got)
	}

	unknown := entity.AIActionPlanItem{ActionType: "delete_everything", PayloadJSON: "{}"}
	if err := executeAIActionItem(port, 1, 7, unknown); err == nil {
		t.Error("an unreviewed action type must not execute")
	}
}

// The allowlist is the Go half of the item table's check constraint.
func TestAllowedAIActionTypes(t *testing.T) {
	if !entity.IsAllowedAIActionType(entity.AIActionTypeAdjustIngredientStock) {
		t.Error("the reviewed stock action should be allowed")
	}
	for _, bad := range []string{"", "drop_table", "set_menu_availability"} {
		if entity.IsAllowedAIActionType(bad) {
			t.Errorf("%q must not be allowed in a plan", bad)
		}
	}
}
