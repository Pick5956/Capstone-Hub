package service

import (
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

// Every tool offered to the model must render. A tool without a case here would
// be selected, run, and then silently dropped from the fact sheet, which reads
// to the model as a tool that returns nothing — the hardest failure to notice,
// because the answer still arrives, just without the data that was asked for.
func TestEveryOfferedToolRendersAFactSheetBlock(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		if isJoyboyExtraTool(AIToolName(spec.Name)) {
			continue // joyboy-only tools render through their own path, tested separately
		}
		body, ok := joyboyFactBody(AIToolResult{Tool: AIToolName(spec.Name)})
		if !ok {
			t.Errorf("%s has no fact sheet rendering", spec.Name)
			continue
		}
		if strings.TrimSpace(body) == "" {
			t.Errorf("%s rendered an empty block", spec.Name)
		}
	}
}

// An empty result is a tool that ran and found nothing, which is not the same as
// a tool that failed. The reason travels with it so the model can say which.
func TestEmptyResultsCarryAReason(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		body, _ := joyboyFactBody(AIToolResult{Tool: AIToolName(spec.Name)})
		if !strings.Contains(body, "status=no_data") {
			continue
		}
		if !strings.Contains(body, "reason=") {
			t.Errorf("%s reports no data without saying why: %q", spec.Name, body)
		}
	}
}

// The whole point of this file is that the model receives figures rather than
// legacy's finished sentences. Thai politeness particles and emoji are the
// signature of a written answer, so their absence is the property to hold.
func TestFactSheetCarriesNoWrittenAnswer(t *testing.T) {
	results := []AIToolResult{
		{
			Tool: AIToolGetTopSellingMenus,
			TopSellingMenus: []repository.AIMenuSummary{
				{MenuName: "ต้มยำกุ้งน้ำข้น", Quantity: 109, Revenue: 15151},
			},
		},
		{
			Tool:              AIToolGetHighestMarginMenu,
			HighestMarginMenu: &repository.AIMenuMarginSummary{MenuName: "ข้าวกะเพราไก่ไข่ดาว", Quantity: 79, Revenue: 6241, Cost: 1881, Profit: 4360, Margin: 69.85},
		},
		{
			Tool:                AIToolGetLowStockIngredients,
			LowStockIngredients: []AIStockRisk{{Name: "ข้าวคั่ว", Status: "low", Stock: 40, MinStock: 100, Unit: "กรัม", RestockEstimate: 160}},
		},
		{
			Tool:               AIToolGetInventoryValuation,
			InventoryValuation: &AIInventorySummary{TotalItems: 30, LowItems: 4, Value: 12000},
		},
	}
	// "ครับ"/"ค่ะ" and the trend arrows are what legacy writes; a thumbs-up is
	// praise, which is an opinion the fact sheet has no business holding.
	forbidden := []string{"ครับ", "ค่ะ", "📈", "📉", "👍", "⚠️", "❌", "**"}

	for _, result := range results {
		body, ok := joyboyFactBody(result)
		if !ok {
			t.Fatalf("%s did not render", result.Tool)
		}
		for _, token := range forbidden {
			if strings.Contains(body, token) {
				t.Errorf("%s: fact sheet contains written-answer token %q\n%s", result.Tool, token, body)
			}
		}
	}
}

// Figures reach the model unformatted so that formatting stays the model's
// decision. A separator here would be copied through into the answer.
func TestFiguresCarryNoThousandsSeparator(t *testing.T) {
	body, _ := joyboyFactBody(AIToolResult{
		Tool:         AIToolGetSalesSummary,
		SalesSummary: &AISalesSummary{Days: 30, Orders: 308, Revenue: 82291},
	})
	if !strings.Contains(body, "revenue=82291.00") {
		t.Fatalf("revenue was reshaped before the model saw it: %q", body)
	}
}

// get_store_summary keeps only the count of at-risk ingredients, not their
// names. Saying so stops the model from reporting a bare number as though the
// names were left out for brevity.
func TestStoreSummaryAdmitsWhatItDoesNotCarry(t *testing.T) {
	body, _ := joyboyFactBody(AIToolResult{
		Tool:         AIToolGetStoreSummary,
		StoreSummary: &AIStoreSummary{Days: 30, Orders: 308, Revenue: 82291, LowStockCount: 4},
	})
	if !strings.Contains(body, "ingredients_below_minimum=4") {
		t.Fatalf("low stock count missing: %q", body)
	}
	if !strings.Contains(body, "get_low_stock_ingredients") {
		t.Fatalf("the summary does not point at the tool holding the names: %q", body)
	}
}

// The failure this replaces: asked "กำไรเดือนที่แล้วเท่าไหร่", the assistant read
// the fixed 30-day snapshot and reported that figure as last month's profit.
func TestProfitForPeriodTotalsTheNamedWindow(t *testing.T) {
	metrics := []repository.AIMenuMarginSummary{
		{MenuName: "ผัดไทยกุ้งสด", Quantity: 100, Revenue: 8900, Cost: 2700, Profit: 6200},
		{MenuName: "ลาบหมู", Quantity: 50, Revenue: 3950, Cost: 1200, Profit: 2750},
	}
	body := joyboyProfitForPeriodBody("เดือนกรกฎาคม 2569", metrics)

	for _, want := range []string{"period=เดือนกรกฎาคม 2569", "revenue=12850", "profit=8950", "scope=named_period_not_30day_window"} {
		if !strings.Contains(body, want) {
			t.Errorf("sheet is missing %q:\n%s", want, body)
		}
	}
}

// An uncosted menu understates the cost, so the profit is a floor and the sheet
// has to say so — the same rule the 30-day snapshot follows.
func TestProfitForPeriodFlagsPartialCostCoverage(t *testing.T) {
	metrics := []repository.AIMenuMarginSummary{
		{MenuName: "มีต้นทุน", Quantity: 10, Revenue: 1000, Cost: 400, Profit: 600},
		{MenuName: "ยังไม่ผูกต้นทุน", Quantity: 10, Revenue: 1000, Cost: 0, Profit: 1000},
	}
	if body := joyboyProfitForPeriodBody("เดือนนี้", metrics); !strings.Contains(body, "profit_is_a_floor") {
		t.Errorf("half the revenue is uncosted, the sheet must flag it:\n%s", body)
	}
}

// A named period with no sales is a stated empty period, not a zero-baht profit.
func TestProfitForPeriodReportsAnEmptyWindow(t *testing.T) {
	if body := joyboyProfitForPeriodBody("เมื่อวาน", nil); !strings.Contains(body, "no_paid_sales_in_period") {
		t.Errorf("an empty window must be reported as empty:\n%s", body)
	}
}

// An empty expense window is where the worst answer came from: with nothing
// recorded for July the model took the spend as zero and reported a month of
// revenue as "กำไรสุทธิ". The warning has to be on the empty sheet too.
func TestExpenseSummarySaysItIsNotTheCostBaseEvenWhenEmpty(t *testing.T) {
	empty := joyboyExpenseSummaryBody("เดือนกรกฎาคม 2569", "2026-07-01", "2026-07-31", &ExpenseListResponse{})
	if !strings.Contains(empty, "ห้ามถือว่าต้นทุนเป็นศูนย์") {
		t.Errorf("an empty window must still say the recipes hold the real cost:\n%s", empty)
	}

	populated := joyboyExpenseSummaryBody("เดือนนี้", "2026-08-01", "2026-08-28", &ExpenseListResponse{
		Entries: 1, Total: 300,
	})
	if !strings.Contains(populated, "ห้ามเอาไปลบกับยอดขาย") {
		t.Errorf("the populated sheet lost its warning:\n%s", populated)
	}
}

// "ร้านเราชื่ออะไร" had no tool and came back as a sales total. The profile sheet
// answers it from the shop's own row, and deliberately omits address/phone/tax.
func TestShopProfileBodyStatesIdentityNotSalesOrContact(t *testing.T) {
	r := &entity.Restaurant{
		Name: "ครัวคุณย่า", BranchName: "สาขาหลัก", RestaurantType: "ตามสั่ง",
		OpenTime: "10:00", CloseTime: "22:00", TableCount: 12,
		Phone: "0812345678", Address: "123 ถนนสุขุมวิท",
	}
	body := joyboyShopProfileBody(r)
	for _, want := range []string{"shop_name=ครัวคุณย่า", "branch=สาขาหลัก", "type=ตามสั่ง", "hours=10:00-22:00", "table_count=12"} {
		if !strings.Contains(body, want) {
			t.Errorf("profile sheet missing %q:\n%s", want, body)
		}
	}
	// Contact details are the shop's, but this sheet leaves the system, so they
	// stay out of it.
	if strings.Contains(body, "0812345678") || strings.Contains(body, "สุขุมวิท") {
		t.Errorf("phone/address must not be on the sheet:\n%s", body)
	}
	if nd := joyboyShopProfileBody(nil); !strings.Contains(nd, "no_restaurant_profile") {
		t.Errorf("a missing profile should report no-data, got %q", nd)
	}
}

// "อาทิตย์ก่อนช่วงไหนคนเยอะสุด" used to be answered from the fixed 30-day
// snapshot, and the two lines are separate rankings the model once glued into
// one ("11:00 was the busiest hour of Monday").
func TestPeakForPeriodStatesTheWindowAndKeepsTheAxesApart(t *testing.T) {
	body := joyboyPeakForPeriodBody("สัปดาห์ที่แล้ว",
		[]repository.AIPeriodSummary{{Period: 1, Orders: 188}},
		[]repository.AIPeriodSummary{{Period: 11, Orders: 161}})

	for _, want := range []string{"period=สัปดาห์ที่แล้ว", "scope=named_period_not_30day_window",
		"weekday_orders=188", "busiest_hour_across_all_days=11:00"} {
		if !strings.Contains(body, want) {
			t.Errorf("peak sheet missing %q:\n%s", want, body)
		}
	}
	if !strings.Contains(body, "นับคนละแกน") {
		t.Errorf("the sheet must say the two lines are separate rankings:\n%s", body)
	}
	if empty := joyboyPeakForPeriodBody("เมื่อวาน", nil, nil); !strings.Contains(empty, "no_orders_recorded_in_period") {
		t.Errorf("an empty window must be reported as empty:\n%s", empty)
	}
}

// The order-type split had the same fixed window, so "เดือนที่แล้วสั่งกลับกี่ที่"
// was answered about the last 30 days instead.
func TestOrderTypeForPeriodStatesTheWindow(t *testing.T) {
	body := joyboyOrderTypeForPeriodBody("เดือนกรกฎาคม 2569", []repository.AIOrderTypeSummary{
		{OrderType: "dine_in", Orders: 900, Revenue: 250000},
		{OrderType: "takeaway", Orders: 385, Revenue: 97453},
	})
	for _, want := range []string{"period=เดือนกรกฎาคม 2569", "order_type=dine_in orders=900", "order_type=takeaway orders=385"} {
		if !strings.Contains(body, want) {
			t.Errorf("order-type sheet missing %q:\n%s", want, body)
		}
	}
}

// "ตอนนี้บิลไหนยังไม่จ่าย" had no source at all — every other tool reports
// history. The sheet also computes the waiting time, because the model may not
// do arithmetic and a timestamp is not an answer to "who has waited longest".
func TestActiveOrdersBodyReportsTheFloorRightNow(t *testing.T) {
	now := time.Date(2026, 8, 29, 19, 30, 0, 0, time.UTC)
	orders := []repository.AIActiveOrder{
		{OrderNumber: "A012", TableNumber: "A2", OrderType: "dine_in", Status: entity.OrderStatusCooking,
			PaymentStatus: "unpaid", GrandTotal: 480, CustomerCount: 3,
			OpenedAt: now.Add(-25 * time.Minute)},
		{OrderNumber: "A013", TableNumber: "B2", OrderType: "dine_in", Status: entity.OrderStatusServed,
			PaymentStatus: "unpaid", GrandTotal: 320, CustomerCount: 2,
			OpenedAt: now.Add(-70 * time.Minute)},
		{OrderNumber: "T004", OrderType: "takeaway", Status: entity.OrderStatusReady,
			PaymentStatus: "paid", GrandTotal: 150, CustomerCount: 1,
			OpenedAt: now.Add(-5 * time.Minute)},
	}
	body := joyboyActiveOrdersBody(orders, now)

	for _, want := range []string{
		"active_orders=3", "in_kitchen_now=1", "unpaid_bills=2 unpaid_total=800",
		"order=A012 โต๊ะ A2", "สถานะ=ครัวกำลังทำ", "เปิดมาแล้ว=70 นาที",
		"order=T004 สั่งกลับบ้าน", "capability=read_only",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("active-orders sheet missing %q:\n%s", want, body)
		}
	}
	// Status codes must be translated once, here, not by the model each time.
	if strings.Contains(body, "sent_to_kitchen") || strings.Contains(body, "cooking") {
		t.Errorf("raw status codes leaked to the model:\n%s", body)
	}
}

// An empty floor is a real state worth stating plainly, not a missing tool.
func TestActiveOrdersBodyReportsAnEmptyFloor(t *testing.T) {
	body := joyboyActiveOrdersBody(nil, time.Now())
	if !strings.Contains(body, "no_active_orders_right_now") {
		t.Errorf("an empty floor should say so:\n%s", body)
	}
	if !strings.Contains(body, "capability=read_only") {
		t.Errorf("the read-only warning must travel with the empty sheet too:\n%s", body)
	}
}

// Totals the model cannot compute itself. "ต้องใช้เงินเท่าไหร่ถ้าเติมของที่
// ใกล้หมดทั้งหมด" is a multiply-then-sum, and "เงินจมรวมเท่าไหร่" is a sum —
// both were unanswerable over sheets that listed the parts and no total.
func TestStockSheetsCarryTheTotalsTheModelCannotCompute(t *testing.T) {
	low, _ := joyboyFactBody(AIToolResult{
		Tool: AIToolGetLowStockIngredients,
		LowStockIngredients: []AIStockRisk{
			{Name: "ข้าวคั่ว", Status: "low", Stock: 40, MinStock: 100, Unit: "กรัม", RestockEstimate: 160, CostPerUnit: 0.5},
			{Name: "ใบกะเพรา", Status: "out", Stock: 0, MinStock: 300, Unit: "กรัม", RestockEstimate: 600, CostPerUnit: 0.15},
		},
	})
	// 160×0.5 + 600×0.15 = 170
	if !strings.Contains(low, "restock_all_cost=170") {
		t.Errorf("low-stock sheet should total the restock cost:\n%s", low)
	}

	dead, _ := joyboyFactBody(AIToolResult{
		Tool: AIToolGetDeadStock,
		DeadStock: []AIDeadStockItem{
			{Name: "มะละกอดิบ", Stock: 5, Unit: "กก.", Value: 250},
			{Name: "หมึกกล้วย", Stock: 2, Unit: "กก.", Value: 400},
		},
	})
	if !strings.Contains(dead, "dead_value_total=650") {
		t.Errorf("dead-stock sheet should total the money sitting idle:\n%s", dead)
	}
}

// The top-cost list is cut to eight upstream. Unsaid, the model reads it as the
// whole set — the mistake the menu rankings already made — and then the total
// below it reads as the shop's entire ingredient spend.
func TestTopCostSheetAdmitsItIsAPartialListBeforeTotalling(t *testing.T) {
	body, _ := joyboyFactBody(AIToolResult{
		Tool: AIToolGetTopCostIngredients,
		TopCostIngredients: []AICostIngredient{
			{Name: "เนื้อหมู", Unit: "กก.", Cost: 5000, Used: 25},
			{Name: "กุ้งสด", Unit: "กก.", Cost: 3000, Used: 10},
		},
	})
	if !strings.Contains(body, "อันดับต้นเพียง 2 ตัว") {
		t.Errorf("the sheet must say the list is partial:\n%s", body)
	}
	if !strings.Contains(body, "listed_items_cost_total=8000") {
		t.Errorf("the total of the listed rows should be stated:\n%s", body)
	}
	if !strings.Contains(body, "ไม่ใช่ต้นทุนวัตถุดิบทั้งร้าน") {
		t.Errorf("the total must be scoped to the listed rows only:\n%s", body)
	}
}

// A gap that means "not entered yet" must never read as "the real value is
// zero". That confusion is exactly how a month of revenue got reported as
// "กำไรสุทธิ" when no expenses had been recorded.
func TestNotSetUpGapsDoNotReadAsZero(t *testing.T) {
	cases := []struct {
		tool   AIToolName
		result AIToolResult
		forbid string
	}{
		{AIToolGetInventoryValuation, AIToolResult{Tool: AIToolGetInventoryValuation}, "มูลค่าสต๊อกเป็น 0"},
		{AIToolGetProfitSummary, AIToolResult{Tool: AIToolGetProfitSummary}, "กำไรเป็น 0"},
		{AIToolGetMostExpensiveMenu, AIToolResult{Tool: AIToolGetMostExpensiveMenu}, "ไม่มีเมนูขาย"},
	}
	for _, c := range cases {
		body, ok := joyboyFactBody(c.result)
		if !ok {
			t.Fatalf("%s did not render", c.tool)
		}
		if !strings.Contains(body, "ไม่ได้แปลว่าค่าจริงเป็นศูนย์") {
			t.Errorf("%s: an unfilled gap must say it is not a zero:\n%s", c.tool, body)
		}
		if !strings.Contains(body, "ห้าม") {
			t.Errorf("%s: the sheet should say what not to answer:\n%s", c.tool, body)
		}
	}

	// A shop with no tables set up is not a shop with no free tables.
	tables := joyboyTableStatusBody(nil)
	if !strings.Contains(tables, "ห้ามตอบว่าร้านไม่มีโต๊ะว่าง") {
		t.Errorf("an unconfigured floor must not read as a full one:\n%s", tables)
	}
}

// The two-period comparison already states direction in Thai with an unsigned
// percentage, because a bare "-0.32" let the model narrate the wrong subject and
// keep the minus. The weekly trend sheet had the same bare figure.
func TestSalesTrendStatesDirectionInsteadOfASignedPercent(t *testing.T) {
	down, _ := joyboyFactBody(AIToolResult{
		Tool:       AIToolGetSalesTrend,
		SalesTrend: &AISalesTrend{HasPrior: true, RecentDays: 7, RecentOrders: 80, RecentRevenue: 80, PriorOrders: 90, PriorRevenue: 100, RevenueChangePct: -20},
	})
	if !strings.Contains(down, "direction=ลดลง") {
		t.Errorf("a fall should be a Thai word:\n%s", down)
	}
	if strings.Contains(down, "-20") {
		t.Errorf("the percentage must not carry a sign as well as a direction:\n%s", down)
	}
	up, _ := joyboyFactBody(AIToolResult{
		Tool:       AIToolGetSalesTrend,
		SalesTrend: &AISalesTrend{HasPrior: true, RecentDays: 7, RecentOrders: 100, RecentRevenue: 120, PriorOrders: 90, PriorRevenue: 100, RevenueChangePct: 20},
	})
	if !strings.Contains(up, "direction=เพิ่มขึ้น") {
		t.Errorf("a rise should be a Thai word:\n%s", up)
	}
}

// Raw service-type codes get translated by the model, differently each time.
func TestOrderTypeIsTranslatedBeforeTheModelSeesIt(t *testing.T) {
	body, _ := joyboyFactBody(AIToolResult{
		Tool: AIToolGetOrderTypeBreakdown,
		OrderTypeBreakdown: []repository.AIOrderTypeSummary{
			{OrderType: "dine_in", Orders: 900, Revenue: 250000},
			{OrderType: "takeaway", Orders: 385, Revenue: 97453},
		},
	})
	for _, want := range []string{"order_type=กินที่ร้าน", "order_type=สั่งกลับบ้าน"} {
		if !strings.Contains(body, want) {
			t.Errorf("order type should reach the model in Thai, missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "dine_in") || strings.Contains(body, "takeaway") {
		t.Errorf("raw codes leaked to the model:\n%s", body)
	}
}
