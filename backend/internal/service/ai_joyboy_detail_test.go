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
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), nil, "หมูสับเหลือเท่าไหร่แล้ว", nil)

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
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), nil, "ถ้ากะเพราหมดจะกระทบเมนูไหนบ้าง", nil)

	if !strings.Contains(body, "used_by_menus=ข้าวกะเพราไก่ไข่ดาว") {
		t.Errorf("the real menu name should come from the recipe:\n%s", body)
	}
	if !strings.Contains(body, "status=หมดแล้ว") {
		t.Errorf("zero stock should be stated:\n%s", body)
	}
}

// Low stock is a different state from empty, and the owner acts differently on it.
func TestIngredientDetailFlagsBelowMinimum(t *testing.T) {
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), nil, "กุ้งสดเหลือเท่าไหร่", nil)
	if !strings.Contains(body, "status=ต่ำกว่าขั้นต่ำ") {
		t.Errorf("400 against a 1000 minimum is below minimum:\n%s", body)
	}
}

// No name in the question is a question back, not a dead end — and the sheet
// carries real names so the owner can answer in one word.
func TestIngredientDetailAsksWhichOneWhenNoNameIsGiven(t *testing.T) {
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), nil, "ของในคลังเป็นไงบ้าง", nil)
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
	body := joyboyMenuDetailBody(aiDetailMenus(), aiDetailMargins(), "period=30 วันล่าสุด", "ผัดไทยกุ้งสดขายได้กี่รายการ", nil)

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
	body := joyboyMenuDetailBody(aiDetailMenus(), aiDetailMargins(), "period=30 วันล่าสุด", "ต้มยำกุ้งน้ำข้นขายได้เท่าไหร่", nil)
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


// A question can point at a menu or an ingredient without naming it — "เมนูแรก
// ที่บอกไป กำไรดีไหม" right after the assistant said the best seller was
// ชาไทยเย็น. The selector now picks the detail tool for those, but the tool used
// to match names against the sentence alone, found none, and answered "ไม่พบ
// ข้อมูล" over data that was one lookup away.
func TestDetailToolsResolveANameFromTheConversation(t *testing.T) {
	history := []AIConversationMessage{
		{Role: "user", Content: "เมนูไหนขายดีที่สุด"},
		{Role: "assistant", Content: "เมนูขายดีที่สุดคือ ผัดไทยกุ้งสดครับ"},
	}
	body := joyboyMenuDetailBody(aiDetailMenus(), aiDetailMargins(), "period=30 วันล่าสุด",
		"เมนูแรกที่บอกไป กำไรดีไหม", history)
	if strings.Contains(body, "no_menu_named_in_question") {
		t.Fatalf("the menu named one turn earlier was not resolved: %s", body)
	}
	if !strings.Contains(body, "ผัดไทยกุ้งสด") {
		t.Fatalf("the sheet should be about the menu from the thread: %s", body)
	}

	shelfBody := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), nil, "แล้วตัวนั้นเหลือเท่าไหร่",
		[]AIConversationMessage{{Role: "assistant", Content: "หมูสับใกล้หมดแล้วครับ"}})
	if !strings.Contains(shelfBody, "หมูสับ") {
		t.Fatalf("the ingredient named one turn earlier was not resolved: %s", shelfBody)
	}
}

// A name written in THIS turn always wins over one mentioned earlier, or a
// follow-up about a different thing would silently answer about the old one.
func TestTheNameInTheQuestionBeatsTheOneInTheThread(t *testing.T) {
	body := joyboyMenuDetailBody(aiDetailMenus(), aiDetailMargins(), "period=30 วันล่าสุด",
		"ต้มยำกุ้งน้ำข้นขายได้เท่าไหร่",
		[]AIConversationMessage{{Role: "assistant", Content: "เมนูขายดีที่สุดคือ ผัดไทยกุ้งสดครับ"}})
	if !strings.Contains(body, "ต้มยำกุ้งน้ำข้น") {
		t.Fatalf("the question's own name must win: %s", body)
	}
}

// "ผัดไทย" came back as "ผัดไทยไม่ได้อยู่ในเมนูของร้านครับ" while the shop was
// selling ผัดไทยกุ้งสด three hundred times a month — the assistant telling the
// owner a fact about their own shop that was flatly untrue, three times across
// two test runs.
//
// Nobody says a whole stored name. The row lookup needed the entire name inside
// the question, so every shortened form found nothing, and a fact sheet with
// nothing in it left the model to conclude the dish did not exist.
func TestPartlyNamedRowsFindsTheDishTheOwnerMeant(t *testing.T) {
	menus := []string{"ผัดไทยกุ้งสด", "ต้มยำกุ้งน้ำข้น", "ข้าวกะเพราไก่ไข่ดาว", "ข้าวผัดปู", "ชาไทยเย็น"}

	for _, testCase := range []struct{ question, want string }{
		{"ผัดไทย", "ผัดไทยกุ้งสด"},
		{"ผัดไทยทำยังไง", "ผัดไทยกุ้งสด"},
		// The distinguishing part, not the head of the name.
		{"กะเพราเหลือเท่าไหร่", "ข้าวกะเพราไก่ไข่ดาว"},
		{"ต้มยำกุ้งต้นทุนเท่าไหร่", "ต้มยำกุ้งน้ำข้น"},
		{"ชาไทย", "ชาไทยเย็น"},
	} {
		found := aiPartlyNamedRows(menus, testCase.question)
		if len(found) == 0 {
			t.Errorf("%q matched nothing at all", testCase.question)
			continue
		}
		// First place, not merely present: the sheet is read top down, and the
		// closest match is the one the owner is most likely to have meant.
		if menus[found[0]] != testCase.want {
			t.Errorf("%q ranked %q first, expected %q (all: %v)",
				testCase.question, menus[found[0]], testCase.want, found)
		}
	}

	// A dish the shop does not sell must still match nothing, or "we don't have
	// that" becomes impossible to say when it is the true answer.
	if found := aiPartlyNamedRows(menus, "ซูชิหน้าปลาไหล"); len(found) != 0 {
		t.Errorf("a dish the shop does not sell should match nothing, got %v", found)
	}

	// Exact naming keeps going through the strict path untouched.
	if found := aiFindNamedRows(menus, "ผัดไทยกุ้งสดขายดีมั้ย"); len(found) != 1 || menus[found[0]] != "ผัดไทยกุ้งสด" {
		t.Errorf("the exact lookup must be unaffected, got %v", found)
	}
}

// "ไข่ไก่ขึ้นฟองละ 2 บาท เมนูไหนโดนหนักสุด" was answered "ทุกเมนูใช้ไข่ไก่เหมือนกันหมด":
// the sheet listed which menus use the ingredient and not how much each one
// uses, so there was nothing to rank by. The per-serving quantity has to be on
// the line.
func TestIngredientDetailSaysHowMuchEachMenuUses(t *testing.T) {
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), nil, "กะเพราขึ้นราคา เมนูไหนโดนหนักสุด", nil)
	if !strings.Contains(body, "used_by_menus=ข้าวกะเพราไก่ไข่ดาว (ใช้ 30.00 กรัม ต่อรายการ)") {
		t.Errorf("the recipe quantity is missing from the menu list:\n%s", body)
	}
}

// "อีกกี่วันต้องสั่งกุ้งสดเพิ่ม" picked this sheet (the ingredient is named) and
// the sheet had stock with no rate of use, so the model wrote "ประมาณ 10 วัน"
// where the data said 7.5. The sheet carries the forecast now, computed the same
// way the reorder tool computes it.
func TestIngredientDetailCarriesDaysLeftFromTheSameMathsAsTheForecast(t *testing.T) {
	usage := []repository.AIIngredientUsage{
		{Name: "กุ้งสด", Unit: "กรัม", Stock: 2405.66, Used: 9592.74},
		{Name: "หมูสับ", Unit: "กรัม", Stock: 5000, Used: 0},
	}
	body := joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), usage, "อีกกี่วันต้องสั่งกุ้งสดเพิ่ม", nil)
	// 9592.74 / 30 = 319.76 per day; the fixture's shrimp stock ÷ that rate.
	if !strings.Contains(body, "daily_use=319.76 กรัม days_left=") {
		t.Errorf("the sheet should carry the daily use and the days left:\n%s", body)
	}
	if !strings.Contains(body, "days_left_means=") {
		t.Errorf("the sheet should say what days_left means and that it must not be estimated:\n%s", body)
	}

	body = joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), usage, "หมูสับจะหมดเมื่อไหร่", nil)
	if !strings.Contains(body, "days_left=คำนวณไม่ได้") {
		t.Errorf("an ingredient with no use in the window must say the rate cannot be computed:\n%s", body)
	}

	// Usage not fetched at all: the sheet simply has no forecast lines.
	body = joyboyIngredientDetailBody(aiDetailShelf(), aiDetailMenus(), nil, "กุ้งสดเหลือเท่าไหร่", nil)
	if strings.Contains(body, "days_left") {
		t.Errorf("with no usage rows there must be no days_left line:\n%s", body)
	}
}

// Asked for the recipe, the model said "ในช่วง 30 วันล่าสุด ใช้กุ้งสด 150 กรัม":
// the window label headed the whole sheet, so it was read as covering the
// recipe too. The label belongs to the sales line alone.
func TestMenuDetailKeepsTheWindowOffTheRecipe(t *testing.T) {
	body := joyboyMenuDetailBody(aiDetailMenus(), aiDetailMargins(), "period=30 วันล่าสุด", "ต้มยำกุ้งน้ำข้นใช้วัตถุดิบอะไรบ้าง", nil)
	if strings.HasPrefix(body, "period=") {
		t.Errorf("the window must not head the whole sheet:\n%s", body)
	}
	if !strings.Contains(body, "period=30 วันล่าสุด qty_sold=") {
		t.Errorf("the window should sit on the sales line:\n%s", body)
	}
	if !strings.Contains(body, "recipe_means=") {
		t.Errorf("the recipe line should say it has no window:\n%s", body)
	}
}
