package service

import (
	"strings"
	"testing"

	"Project-M/internal/entity"
)

func menuCreateFixture() ([]entity.MenuItem, []entity.Category) {
	padThai := entity.MenuItem{Name: "ผัดไทยกุ้งสด", Price: 89}
	padThai.ID = 1
	rice := entity.Category{Name: "ข้าว", IsActive: true}
	rice.ID = 10
	drinks := entity.Category{Name: "เครื่องดื่ม", IsActive: true}
	drinks.ID = 11
	retired := entity.Category{Name: "เมนูเก่า", IsActive: false}
	retired.ID = 12
	return []entity.MenuItem{padThai}, []entity.Category{rice, drinks, retired}
}

// "เพิ่มเมนูข้าวผัดปู ราคา 120 หมวดข้าว" is ready as said; each missing piece
// is one question; a dish the menu already has is nothing to do.
func TestResolveMenuCreateCommand(t *testing.T) {
	menus, categories := menuCreateFixture()

	ready := ResolveMenuCreateCommand(menus, categories, AIStockCommandDraft{Name: "ข้าวผัดปู", Kind: "menu_create", Quantity: 120, Category: "ข้าว"})
	if ready.Kind != AICommandOutcomeReady || ready.Command.CategoryID != 10 || ready.Command.CategoryName != "ข้าว" || ready.Command.Name != "ข้าวผัดปู" {
		t.Fatalf("ready = %+v", ready)
	}

	noPrice := ResolveMenuCreateCommand(menus, categories, AIStockCommandDraft{Name: "ข้าวผัดปู", Kind: "menu_create"})
	if noPrice.Kind != AICommandOutcomeAsk || !strings.Contains(noPrice.Question, "ราคาเท่าไหร่") {
		t.Fatalf("no price = %+v", noPrice)
	}

	noCategory := ResolveMenuCreateCommand(menus, categories, AIStockCommandDraft{Name: "ข้าวผัดปู", Kind: "menu_create", Quantity: 120})
	if noCategory.Kind != AICommandOutcomeAsk || !strings.Contains(noCategory.Question, "ข้าว / เครื่องดื่ม") || strings.Contains(noCategory.Question, "เมนูเก่า") {
		t.Fatalf("no category = %+v", noCategory)
	}

	// A partial category name that fits one category is that category.
	near := ResolveMenuCreateCommand(menus, categories, AIStockCommandDraft{Name: "ชาเขียว", Kind: "menu_create", Quantity: 45, Category: "ดื่ม"})
	if near.Kind != AICommandOutcomeReady || near.Command.CategoryID != 11 {
		t.Fatalf("near category = %+v", near)
	}

	// The only category is not a choice to ask about.
	only := ResolveMenuCreateCommand(menus, categories[:1], AIStockCommandDraft{Name: "ข้าวผัดปู", Kind: "menu_create", Quantity: 120})
	if only.Kind != AICommandOutcomeReady || only.Command.CategoryID != 10 {
		t.Fatalf("only category = %+v", only)
	}

	exists := ResolveMenuCreateCommand(menus, categories, AIStockCommandDraft{Name: "ผัดไทยกุ้งสด", Kind: "menu_create", Quantity: 120, Category: "ข้าว"})
	if exists.Kind != AICommandOutcomeNothingToDo || !strings.Contains(exists.Question, "อยู่แล้ว") {
		t.Fatalf("exists = %+v", exists)
	}

	noName := ResolveMenuCreateCommand(menus, categories, AIStockCommandDraft{Kind: "menu_create", Note: "เมนูใหม่ที่คุยกันเมื่อวาน"})
	if noName.Kind != AICommandOutcomeAsk || !strings.Contains(noName.Question, "ชื่ออะไร") {
		t.Fatalf("no name = %+v", noName)
	}
}

// The plan validator refuses a port that cannot create, and a fake that can
// gets a card that says what the row will and will not have.
type fakeMenuCreatorPort struct {
	fakeAIActionMenuPort
	created []MenuItemRequest
}

func (f *fakeMenuCreatorPort) ListCategories(uint, bool) ([]entity.Category, error) {
	_, categories := menuCreateFixture()
	return categories, nil
}

func (f *fakeMenuCreatorPort) CreateMenuItem(_ uint, req *MenuItemRequest) (*entity.MenuItem, error) {
	f.created = append(f.created, *req)
	item := &entity.MenuItem{Name: req.Name, Price: req.Price, CategoryID: req.CategoryID}
	item.ID = uint(100 + len(f.created))
	return item, nil
}

func TestCreateMenuItemPlanValidatesAndExecutes(t *testing.T) {
	command := AIAdjustStockCommand{Kind: "menu_create", Name: "ข้าวผัดปู", Quantity: 120, CategoryID: 10, CategoryName: "ข้าว"}

	if _, _, _, err := aiValidateCommand(AIActionPorts{Menus: newAIActionMenuFixture()}, 1, command); err == nil {
		t.Fatal("a port that cannot create menus must refuse")
	}

	port := &fakeMenuCreatorPort{fakeAIActionMenuPort: *newAIActionMenuFixture()}
	payload, preview, actionType, err := aiValidateCommand(AIActionPorts{Menus: port}, 1, command)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if actionType != entity.AIActionTypeCreateMenuItem || payload.Name != "ข้าวผัดปู" || payload.Amount != 120 || payload.CategoryID != 10 {
		t.Fatalf("payload = %+v type = %s", payload, actionType)
	}
	if !strings.Contains(preview.Change, "120") || !strings.Contains(preview.Change, "ข้าว") || len(preview.SideEffects) == 0 {
		t.Fatalf("preview = %+v", preview)
	}

	if err := executeAIActionItem(AIActionPorts{Menus: port}, 1, 1, planItem(t, entity.AIActionTypeCreateMenuItem, payload)); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(port.created) != 1 || port.created[0].CategoryID != 10 || port.created[0].Price != 120 {
		t.Fatalf("created = %+v", port.created)
	}

	// Meanwhile someone added the dish: the button refuses instead of doubling it.
	dup := &entity.MenuItem{Name: "ข้าวผัดปู", Price: 120}
	dup.ID = 99
	port.items[99] = dup
	if err := executeAIActionItem(AIActionPorts{Menus: port}, 1, 1, planItem(t, entity.AIActionTypeCreateMenuItem, payload)); err == nil || !strings.Contains(err.Error(), "อยู่แล้ว") {
		t.Fatalf("a duplicate at the button should refuse, got %v", err)
	}
}
