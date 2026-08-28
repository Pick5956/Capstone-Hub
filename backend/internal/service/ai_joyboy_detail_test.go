package service

import (
	"strings"
	"testing"

	"gorm.io/gorm"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

func aiDetailShelf() []entity.Ingredient {
	basil := entity.Ingredient{Name: "กะเพรา", Unit: "กรัม", Stock: 0, MinStock: 600, CostPerUnit: 0.15}
	basil.ID = 1
	pork := entity.Ingredient{Name: "หมูสับ", Unit: "กรัม", Stock: 5000, MinStock: 1500, CostPerUnit: 0.18}
	pork.ID = 2
	shrimp := entity.Ingredient{Name: "กุ้งสด", Unit: "กรัม", Stock: 400, MinStock: 1000, CostPerUnit: 0.35}
	shrimp.ID = 3
	return []entity.Ingredient{basil, pork, shrimp}
}

func aiDetailMenus() []entity.MenuItem {
	basilRice := entity.MenuItem{
		Name: "ข้าวกะเพราไก่ไข่ดาว", Price: 79, IsAvailable: true,
		Ingredients: []entity.MenuItemIngredient{
			{IngredientID: 1, Quantity: 30, Unit: "กรัม", Ingredient: &entity.Ingredient{Name: "กะเพรา"}},
		},
	}
	basilRice.ID = 1
	tomYum := entity.MenuItem{
		Name: "ต้มยำกุ้งน้ำข้น", Price: 139, IsAvailable: false,
		Ingredients: []entity.MenuItemIngredient{
			{IngredientID: 3, Quantity: 120, Unit: "กรัม", Ingredient: &entity.Ingredient{Name: "กุ้งสด"}},
		},
	}
	tomYum.ID = 2
	padThai := entity.MenuItem{Name: "ผัดไทยกุ้งสด", Price: 89, IsAvailable: true}
	padThai.ID = 3
	return []entity.MenuItem{basilRice, tomYum, padThai}
}

// "หมูสับเหลือเท่าไหร่" is the question an owner asks most, and before this tool
// existed the assistant answered "ไม่มีข้อมูล" over a shelf row it could see.
func TestIngredientDetailAnswersANamedIngredient(t *testing.T) {
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), "หมูสับเหลือเท่าไหร่แล้ว")

	for _, want := range []string{"ingredient=หมูสับ", "stock=5000", "unit=กรัม", "min_stock=1500", "status=ปกติ"} {
		if !strings.Contains(body, want) {
			t.Errorf("sheet is missing %q:\n%s", want, body)
		}
	}
	// Only the ingredient that was asked about.
	if strings.Contains(body, "ingredient=กุ้งสด") {
		t.Errorf("an unrelated ingredient leaked in:\n%s", body)
	}
}

// The recipe link is the whole point of the tool for this question: the model
// used to answer it by inventing a menu name out of the ingredient's name
// ("กะเพราไก่" for a shop selling "ข้าวกะเพราไก่ไข่ดาว").
func TestIngredientDetailNamesTheMenusFromTheStoredRecipe(t *testing.T) {
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), "ถ้ากะเพราหมดจะกระทบเมนูไหนบ้าง")

	if !strings.Contains(body, "used_by_menus=ข้าวกะเพราไก่ไข่ดาว") {
		t.Errorf("the real menu name should come from the recipe:\n%s", body)
	}
	if !strings.Contains(body, "status=หมดแล้ว") {
		t.Errorf("zero stock should be stated:\n%s", body)
	}
}

// Low stock is a different state from empty, and the owner acts differently on it.
func TestIngredientDetailFlagsBelowMinimum(t *testing.T) {
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), "กุ้งสดเหลือเท่าไหร่")
	if !strings.Contains(body, "status=ต่ำกว่าขั้นต่ำ") {
		t.Errorf("400 against a 1000 minimum is below minimum:\n%s", body)
	}
}

// No name in the question is a question back, not a dead end — and the sheet
// carries real names so the owner can answer in one word.
func TestIngredientDetailAsksWhichOneWhenNoNameIsGiven(t *testing.T) {
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), "ของในคลังเป็นไงบ้าง")
	if !strings.Contains(body, "no_ingredient_named_in_question") {
		t.Errorf("should report that no ingredient was named:\n%s", body)
	}
	if !strings.Contains(body, "หมูสับ") {
		t.Errorf("the sheet should offer real names to pick from:\n%s", body)
	}
}

func aiDetailMargins() []repository.AIMenuMarginSummary {
	return []repository.AIMenuMarginSummary{
		{MenuName: "ผัดไทยกุ้งสด", Quantity: 313, Revenue: 27857, Cost: 8441, Profit: 19416, Margin: 69.7},
	}
}

// The failure this replaces: asked about a menu outside the top five, the
// assistant reported it had no sales at all.
func TestMenuDetailAnswersAMenuOutsideTheTopRanking(t *testing.T) {
	body := joyboyMenuDetailBody(aiDetailMenus(), aiDetailMargins(), "period=30 วันล่าสุด", "ผัดไทยกุ้งสดขายได้กี่รายการ")

	for _, want := range []string{"menu=ผัดไทยกุ้งสด", "qty_sold=313", "price=89", "selling_status=เปิดขายอยู่"} {
		if !strings.Contains(body, want) {
			t.Errorf("sheet is missing %q:\n%s", want, body)
		}
	}
	// "กำไรต่อจานเท่าไหร่" is a division, and the model is forbidden to do
	// arithmetic — so it answered "ผมไม่ทราบ" over a sheet holding both numbers.
	// Go divides; 19,416 / 313 = 62.03.
	if !strings.Contains(body, "profit_per_unit=62.03") {
		t.Errorf("per-plate profit must be computed here:\n%s", body)
	}
}

// A menu with no sales in the window is a real zero, and must not read the same
// as a menu the system does not know.
func TestMenuDetailSeparatesZeroSalesFromUnknownMenu(t *testing.T) {
	body := joyboyMenuDetailBody(aiDetailMenus(), aiDetailMargins(), "period=30 วันล่าสุด", "ต้มยำกุ้งน้ำข้นขายได้เท่าไหร่")
	if !strings.Contains(body, "qty_sold=0") {
		t.Errorf("no sales in the window is zero, not missing:\n%s", body)
	}
	if !strings.Contains(body, "selling_status=ปิดขายอยู่") {
		t.Errorf("a closed menu should say so:\n%s", body)
	}
	if !strings.Contains(body, "recipe=กุ้งสด") {
		t.Errorf("the recipe should be reported:\n%s", body)
	}
}

// "ต้มยำกุ้งน้ำข้น" contains "ต้มยำกุ้ง"; reporting both would read as two menus.
func TestNamedRowMatchingPrefersTheLongestName(t *testing.T) {
	names := []string{"ต้มยำกุ้ง", "ต้มยำกุ้งน้ำข้น"}
	found := aiFindNamedRows(names, "ต้มยำกุ้งน้ำข้นขายดีไหม")
	if len(found) != 1 || names[found[0]] != "ต้มยำกุ้งน้ำข้น" {
		t.Fatalf("matched %v, want only the longest name", found)
	}
}

// Guard against the fixture drifting away from the entity: the recipe link is
// read through IngredientID, so a rename of that field must break here loudly.
func TestRecipeLinkUsesIngredientID(t *testing.T) {
	menu := entity.MenuItem{Model: gorm.Model{ID: 9}, Name: "ทดสอบ", Ingredients: []entity.MenuItemIngredient{{IngredientID: 42}}}
	if got := aiMenusUsingIngredient([]entity.MenuItem{menu}, 42); len(got) != 1 {
		t.Fatalf("menus using ingredient 42 = %v", got)
	}
	if got := aiMenusUsingIngredient([]entity.MenuItem{menu}, 7); len(got) != 0 {
		t.Fatalf("unrelated ingredient matched: %v", got)
	}
}
