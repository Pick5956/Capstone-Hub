package service

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"Project-M/internal/entity"
)

// fakeAIActionMenuPort answers menu lookups from a table and records writes.
type fakeAIActionMenuPort struct {
	items        map[uint]*entity.MenuItem
	priced       []float64
	availability []bool
}

func (f *fakeAIActionMenuPort) ListMenuItems(uint, bool, uint) ([]entity.MenuItem, error) {
	menus := make([]entity.MenuItem, 0, len(f.items))
	for _, item := range f.items {
		menus = append(menus, *item)
	}
	return menus, nil
}

func (f *fakeAIActionMenuPort) FindMenuItem(_ uint, itemID uint) (*entity.MenuItem, error) {
	item, ok := f.items[itemID]
	if !ok {
		return nil, errors.New("not found")
	}
	copied := *item
	return &copied, nil
}

func (f *fakeAIActionMenuPort) UpdateMenuItemAvailability(_ uint, itemID uint, req *MenuItemAvailabilityRequest) (*entity.MenuItem, error) {
	f.availability = append(f.availability, req.IsAvailable)
	return f.items[itemID], nil
}

func (f *fakeAIActionMenuPort) UpdateMenuItemPrice(_ uint, itemID uint, price float64) (*entity.MenuItem, error) {
	f.priced = append(f.priced, price)
	return f.items[itemID], nil
}

func newAIActionMenuFixture() *fakeAIActionMenuPort {
	tea := &entity.MenuItem{Name: "ชาไทยเย็น", Price: 49, IsAvailable: true}
	tea.ID = 7
	return &fakeAIActionMenuPort{items: map[uint]*entity.MenuItem{7: tea}}
}

// planItem builds a stored item the way BuildAdjustStockPlan would.
func planItem(t *testing.T, actionType string, payload AIActionItemPayload) entity.AIActionPlanItem {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return entity.AIActionPlanItem{ActionType: actionType, PayloadJSON: string(raw), PreviewJSON: "{}"}
}

// The owner confirms "หมูสับ 2000 → 3000" having read it. If a colleague took a
// delivery between the preview and the button — the row now says 6000 — writing
// 3000 destroys that delivery silently and reports success. The preview's
// starting figure travels with the item, and execution refuses when the row has
// moved.
func TestExecuteRefusesAnAbsoluteWriteWhenTheRowMovedSinceThePreview(t *testing.T) {
	port := newAIActionPortFixture()
	payload, _, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 2, Kind: "adjust", Quantity: 3000})
	if err != nil {
		t.Fatal(err)
	}
	if payload.ExpectedStock == nil || *payload.ExpectedStock != 2000 {
		t.Fatalf("an adjust must remember the stock it was previewed against, got %+v", payload.ExpectedStock)
	}

	// A delivery lands while the confirmation card is on screen.
	port.items[2].Stock = 6000

	err = executeAIActionItem(AIActionPorts{Ingredients: port}, 1, 1, planItem(t, entity.AIActionTypeAdjustIngredientStock, payload))
	if !errors.Is(err, ErrAIActionChangedMeanwhile) {
		t.Fatalf("expected the changed-meanwhile refusal, got %v", err)
	}
	if len(port.adjusted) != 0 {
		t.Fatalf("nothing may be written over a moved row, got %+v", port.adjusted)
	}
	// The owner reads which figure moved, and both values.
	for _, want := range []string{"หมูสับ", "2000", "6000"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the refusal should name %q: %s", want, err)
		}
	}
}

// A relative change carries no expectation: "+2000" is right whatever happened
// in between, and refusing it would block every delivery logged during a busy
// hour.
func TestExecuteStillAppliesARelativeChangeWhenTheRowMoved(t *testing.T) {
	port := newAIActionPortFixture()
	payload, _, err := validateAdjustStock(port, 1, AIAdjustStockCommand{IngredientID: 2, Kind: "in", Quantity: 2000})
	if err != nil {
		t.Fatal(err)
	}
	if payload.ExpectedStock != nil {
		t.Fatalf("a stock-in must not pin the starting level, got %v", *payload.ExpectedStock)
	}
	port.items[2].Stock = 6000
	if err := executeAIActionItem(AIActionPorts{Ingredients: port}, 1, 1, planItem(t, entity.AIActionTypeAdjustIngredientStock, payload)); err != nil {
		t.Fatalf("a relative change should still apply: %v", err)
	}
	if len(port.adjusted) != 1 {
		t.Fatalf("expected one adjust call, got %d", len(port.adjusted))
	}
}

// The same guard on the row the plan was previewed against, when it has not
// moved: the write goes through exactly as before.
func TestExecuteAppliesAnAbsoluteWriteWhenTheRowIsUnchanged(t *testing.T) {
	port := newAIActionPortFixture()
	payload, _, err := validateSetIngredientField(port, 1, 2, entity.AIActionTypeSetIngredientMinStock, 800)
	if err != nil {
		t.Fatal(err)
	}
	if err := executeAIActionItem(AIActionPorts{Ingredients: port}, 1, 1, planItem(t, entity.AIActionTypeSetIngredientMinStock, payload)); err != nil {
		t.Fatalf("an unchanged row should accept the write: %v", err)
	}
	if len(port.updated) != 1 || port.updated[0].MinStock != 800 {
		t.Fatalf("expected the min-stock update, got %+v", port.updated)
	}
}

func TestExecuteRefusesAMinStockWriteWhenSomeoneElseSetItMeanwhile(t *testing.T) {
	port := newAIActionPortFixture()
	payload, _, err := validateSetIngredientField(port, 1, 2, entity.AIActionTypeSetIngredientMinStock, 800)
	if err != nil {
		t.Fatal(err)
	}
	port.items[2].MinStock = 1500
	err = executeAIActionItem(AIActionPorts{Ingredients: port}, 1, 1, planItem(t, entity.AIActionTypeSetIngredientMinStock, payload))
	if !errors.Is(err, ErrAIActionChangedMeanwhile) || len(port.updated) != 0 {
		t.Fatalf("a moved min-stock must be refused unwritten, err=%v updates=%+v", err, port.updated)
	}
}

// Menu price: the preview said "49 → 55". If the price is 59 by the time the
// owner confirms, 55 would be a price cut nobody asked for.
func TestExecuteRefusesAPriceWriteWhenThePriceMovedSinceThePreview(t *testing.T) {
	menus := newAIActionMenuFixture()
	payload, _, err := validateSetMenuPrice(menus, 1, 7, 55)
	if err != nil {
		t.Fatal(err)
	}
	if payload.ExpectedPrice == nil || *payload.ExpectedPrice != 49 {
		t.Fatalf("a price change must remember the price it was previewed against, got %v", payload.ExpectedPrice)
	}
	menus.items[7].Price = 59
	err = executeAIActionItem(AIActionPorts{Menus: menus}, 1, 1, planItem(t, entity.AIActionTypeSetMenuPrice, payload))
	if !errors.Is(err, ErrAIActionChangedMeanwhile) || len(menus.priced) != 0 {
		t.Fatalf("a moved price must be refused unwritten, err=%v writes=%v", err, menus.priced)
	}

	// Unchanged: the write goes through.
	menus.items[7].Price = 49
	if err := executeAIActionItem(AIActionPorts{Menus: menus}, 1, 1, planItem(t, entity.AIActionTypeSetMenuPrice, payload)); err != nil {
		t.Fatalf("an unchanged price should accept the write: %v", err)
	}
	if len(menus.priced) != 1 || menus.priced[0] != 55 {
		t.Fatalf("expected one price write of 55, got %v", menus.priced)
	}
}

// Availability: previewed as "เปิดขาย → ปิดขาย". If a colleague already closed
// it, the row reads ปิดขาย and this item would only re-close it — but a plan
// that says "ปิดขาย → ปิดขาย" was not what the owner confirmed, and the reverse
// case (someone reopened a menu the owner meant to close) is a real conflict.
func TestExecuteRefusesAnAvailabilityFlipWhenTheStateMovedSinceThePreview(t *testing.T) {
	menus := newAIActionMenuFixture()
	payload, _, err := validateSetMenuAvailability(menus, 1, 7, false)
	if err != nil {
		t.Fatal(err)
	}
	if payload.ExpectedAvailable == nil || !*payload.ExpectedAvailable {
		t.Fatalf("an availability flip must remember the state it was previewed against, got %v", payload.ExpectedAvailable)
	}
	menus.items[7].IsAvailable = false
	err = executeAIActionItem(AIActionPorts{Menus: menus}, 1, 1, planItem(t, entity.AIActionTypeSetMenuAvailability, payload))
	if !errors.Is(err, ErrAIActionChangedMeanwhile) || len(menus.availability) != 0 {
		t.Fatalf("a moved state must be refused unwritten, err=%v writes=%v", err, menus.availability)
	}
}

// An item stored before this guard existed carries no expectation and must
// still run: refusing every pending plan on deploy would strand the owner.
func TestExecuteRunsAnItemStoredWithoutAnExpectation(t *testing.T) {
	port := newAIActionPortFixture()
	item := planItem(t, entity.AIActionTypeAdjustIngredientStock, AIActionItemPayload{IngredientID: 2, Kind: "adjust", Quantity: 100})
	port.items[2].Stock = 999
	if err := executeAIActionItem(AIActionPorts{Ingredients: port}, 1, 1, item); err != nil {
		t.Fatalf("an item with no expectation should run: %v", err)
	}
}
