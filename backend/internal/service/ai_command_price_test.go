package service

import (
	"strings"
	"testing"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

// A price is money PER unit, so it converts the opposite way to a quantity:
// 2 กก. of stock is 2,000 grams, but 180 บาท/กก. is 0.18 บาท/กรัม. Reading it the
// wrong way is a thousand-fold error in every menu that uses the ingredient.
func TestConvertPricePerUnit(t *testing.T) {
	cases := []struct {
		price  float64
		spoken string
		stock  string
		want   float64
		wantOK bool
		reason string
	}{
		{180, "กก.", "กรัม", 0.18, true, "baht per kilo onto a shelf kept in grams"},
		{180, "กิโล", "กรัม", 0.18, true, "spoken alias"},
		{0.18, "กรัม", "กรัม", 0.18, true, "already per stock unit"},
		{5, "ฟอง", "ฟอง", 5, true, "counting unit matches itself"},
		{5, "", "ฟอง", 5, true, "a bare price is clear for a counting unit"},
		{60, "ลิตร", "มล.", 0.06, true, "litres onto millilitres"},
		{180, "", "กรัม", 0, false, "a bare price cannot mean per gram — ask"},
		{20, "มัด", "กรัม", 0, false, "a bunch has no fixed weight — ask"},
	}
	for _, test := range cases {
		got, ok := ConvertPricePerUnit(test.price, test.spoken, test.stock)
		if ok != test.wantOK {
			t.Errorf("%s: ok = %v, want %v", test.reason, ok, test.wantOK)
			continue
		}
		if ok && (got < test.want-1e-9 || got > test.want+1e-9) {
			t.Errorf("%s: got %v, want %v", test.reason, got, test.want)
		}
	}
}

// The whole command has to carry that conversion through, and ask when the unit
// leaves the price ambiguous.
func TestResolveStockCommandConvertsPrice(t *testing.T) {
	shelf := aiCommandTestShelf()

	ready := ResolveStockCommand(shelf, AIStockCommandDraft{Name: "หมูสับ", Kind: "cost", Quantity: 180, Unit: "กก."})
	if ready.Kind != AICommandOutcomeReady {
		t.Fatalf("a priced command should be ready: %+v", ready)
	}
	if ready.Command.Quantity < 0.1799 || ready.Command.Quantity > 0.1801 {
		t.Errorf("180 บาท/กก. onto grams should be 0.18, got %v", ready.Command.Quantity)
	}

	bare := ResolveStockCommand(shelf, AIStockCommandDraft{Name: "หมูสับ", Kind: "cost", Quantity: 180})
	if bare.Kind != AICommandOutcomeAsk || !strings.Contains(bare.Question, "ต่อหน่วยอะไร") {
		t.Errorf("a bare price on a gram shelf must ask: %+v", bare)
	}

	egg := ResolveStockCommand(shelf, AIStockCommandDraft{Name: "ไข่ไก่", Kind: "cost", Quantity: 5})
	if egg.Kind != AICommandOutcomeReady || egg.Command.Quantity != 5 {
		t.Errorf("a bare price on a counting shelf is unambiguous: %+v", egg)
	}
}

// The headline must name what the plan does. Calling a price change "ปรับสต๊อก"
// made the summary disagree with the line under it.
func TestPlanSummaryNamesTheAction(t *testing.T) {
	stock := []repository.CreateAIActionPlanItemParams{{ActionType: entity.AIActionTypeAdjustIngredientStock}}
	minStock := []repository.CreateAIActionPlanItemParams{{ActionType: entity.AIActionTypeSetIngredientMinStock}}
	cost := []repository.CreateAIActionPlanItemParams{{ActionType: entity.AIActionTypeSetIngredientCost}}
	create := []repository.CreateAIActionPlanItemParams{{ActionType: entity.AIActionTypeCreateIngredient}}
	mixed := []repository.CreateAIActionPlanItemParams{
		{ActionType: entity.AIActionTypeAdjustIngredientStock},
		{ActionType: entity.AIActionTypeSetIngredientCost},
	}
	menuOff := []repository.CreateAIActionPlanItemParams{
		{ActionType: entity.AIActionTypeSetMenuAvailability, PayloadJSON: `{"menu_item_id":3,"available":false}`},
	}
	menuOn := []repository.CreateAIActionPlanItemParams{
		{ActionType: entity.AIActionTypeSetMenuAvailability, PayloadJSON: `{"menu_item_id":3,"available":true}`},
	}
	menuBoth := []repository.CreateAIActionPlanItemParams{
		{ActionType: entity.AIActionTypeSetMenuAvailability, PayloadJSON: `{"menu_item_id":3,"available":false}`},
		{ActionType: entity.AIActionTypeSetMenuAvailability, PayloadJSON: `{"menu_item_id":4,"available":true}`},
	}
	one := []AIActionItemPreview{{Title: "กะเพรา"}}
	two := []AIActionItemPreview{{Title: "กะเพรา"}, {Title: "หมูสับ"}}
	oneMenu := []AIActionItemPreview{{Title: "ผัดไทย"}}
	twoMenus := []AIActionItemPreview{{Title: "ผัดไทย"}, {Title: "ชาไทยเย็น"}}

	for _, test := range []struct {
		items    []repository.CreateAIActionPlanItemParams
		previews []AIActionItemPreview
		want     string
	}{
		{stock, one, "ปรับสต๊อก “กะเพรา”"},
		{minStock, one, "ตั้งขั้นต่ำ “กะเพรา”"},
		{cost, one, "ตั้งราคา “กะเพรา”"},
		{create, one, "เพิ่มวัตถุดิบ “กะเพรา”"},
		{mixed, two, "แก้ข้อมูลร้าน 2 รายการ"},
		// A menu plan is named by the direction its items carry, read back from the
		// payloads — never by the sentence that produced it.
		{menuOff, oneMenu, "ปิดขายเมนู “ผัดไทย”"},
		{menuOn, oneMenu, "เปิดขายเมนู “ผัดไทย”"},
		{menuBoth, twoMenus, "เปลี่ยนสถานะขายเมนู 2 รายการ"},
	} {
		if got := aiStockPlanSummary(test.items, test.previews); got != test.want {
			t.Errorf("summary = %q, want %q", got, test.want)
		}
	}
}
