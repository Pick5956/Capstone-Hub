package service

import (
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

// Joyboy has no classifier, so a tool is only as findable as its description.
// A tool offered with legacy's wording is a tool the model has to guess at, and
// the guess is silent when it goes wrong.
func TestEveryOfferedToolIsDescribedForJoyboy(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		name := AIToolName(spec.Name)
		guide, described := joyboyToolGuide[name]
		if !described {
			guide, described = joyboyExtraToolGuide[name]
		}
		if !described {
			t.Errorf("%s is offered with legacy's description, not joyboy's", spec.Name)
			continue
		}
		if spec.Description != guide {
			t.Errorf("%s did not receive its joyboy description", spec.Name)
		}
		// The point of these descriptions is the questions they name.
		if !strings.Contains(guide, "ใช้ตอบ") {
			t.Errorf("%s describes what it returns but not what it answers", spec.Name)
		}
	}
}

// A guide entry for a tool nobody offers is dead text that will drift.
func TestTheGuideDescribesNothingUnreachable(t *testing.T) {
	offered := map[string]struct{}{}
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		offered[spec.Name] = struct{}{}
	}
	for name := range joyboyToolGuide {
		if _, ok := offered[string(name)]; !ok {
			t.Errorf("%s is described but never offered", name)
		}
	}
	for name := range joyboyExtraToolGuide {
		if _, ok := offered[string(name)]; !ok {
			t.Errorf("extra tool %s is described but never offered", name)
		}
	}
}

// Withheld tools must stay runnable: they are still reachable through legacy,
// and a fact sheet rendering is still expected for them.
func TestWithheldToolsAreNotOfferedButStillWork(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		if _, withheld := joyboyToolsNotOffered[AIToolName(spec.Name)]; withheld {
			t.Fatalf("%s is withheld yet still offered", spec.Name)
		}
	}
	for name := range joyboyToolsNotOffered {
		if !isSupportedReadOnlyTool(name) {
			t.Errorf("%s is withheld from a list it was never on", name)
		}
		if _, ok := joyboyFactBody(AIToolResult{Tool: name}); !ok {
			t.Errorf("%s lost its fact sheet rendering", name)
		}
	}
}

// "เมนูขายดี" has two correct tools — top sellers by count and the revenue
// ranking — and round 12 saw the model split three ways on the identical
// question, once by count and twice by revenue. The tie is broken in the
// revenue tool's guide: it defers to the count tool unless the question names
// money, so a bare "ขายดี" resolves one way every time.
func TestRevenueRankingDefersToCountForBareBestSeller(t *testing.T) {
	guide := joyboyToolGuide[AIToolGetMenuRevenueRanking]
	if !strings.Contains(guide, "get_top_selling_menus") {
		t.Fatal("the revenue ranking no longer points a bare \"ขายดี\" at the count tool")
	}
	if !strings.Contains(guide, "เงินหรือรายได้") {
		t.Fatal("the revenue ranking stopped scoping itself to money questions")
	}
}

// A tool whose wiring reads a named period has to SAY so. The expense and profit
// tools have resolved "สัปดาห์ก่อน" / "เดือนที่แล้ว" through periodNamedIn for
// weeks, but both descriptions still opened with a flat "30 วันล่าสุด" — so asked
// "สัปดาห์ก่อนจ่ายอะไรไปบ้าง" the model judged the tool out of scope, picked
// nothing, and asked the owner which kind of spending they meant. A capability
// the description hides does not exist as far as the selection round is concerned.
func TestPeriodCapableToolsAdvertiseThatTheyTakeAPeriod(t *testing.T) {
	for _, name := range []AIToolName{joyboyToolExpenseSummary, AIToolGetProfitSummary} {
		guide := joyboyExtraToolGuide[name]
		if guide == "" {
			guide = joyboyToolGuide[name]
		}
		if !strings.Contains(guide, "เลือกช่วงเวลาได้") {
			t.Errorf("%s reads named periods but its guide does not say so:\n%s", name, guide)
		}
		if !strings.Contains(guide, "สัปดาห์ก่อน") {
			t.Errorf("%s should name a relative period it can handle, not only months:\n%s", name, guide)
		}
	}
}

// The menu tools all rank by sales, so "ร้านมีกี่เมนู / มีเมนูอะไรบ้าง" had no
// home and fell through to chat. get_menu_list is the shop's own catalogue, and
// its guide has to separate itself from the ranking tools or the model will keep
// reaching for the best-seller list.
func TestMenuListGuideSeparatesItselfFromTheSalesRankings(t *testing.T) {
	guide := joyboyExtraToolGuide[joyboyToolMenuList]
	if guide == "" {
		t.Fatal("get_menu_list has no description, so it is invisible to the model")
	}
	for _, want := range []string{"มีกี่เมนู", "มีเมนูอะไรบ้าง", "get_top_selling_menus", "get_menu_detail"} {
		if !strings.Contains(guide, want) {
			t.Errorf("the menu-list guide lost %q:\n%s", want, guide)
		}
	}
}

// get_data_coverage is a joyboy-only tool answering "how far back does the data
// reach?". Its fact sheet must carry the span as raw figures — first and last
// day, plus the count — and fall back to no-data when there are no paid sales,
// since "no sales at all" and "no sales today" are different answers.
func TestDataCoverageBodyRendersTheSpan(t *testing.T) {
	body := joyboyDataCoverageBody(repository.AISalesCoverage{
		FirstDate: "2025-08-25", LastDate: "2026-08-24", Days: 300, Orders: 14362, Revenue: 3390000,
	})
	for _, want := range []string{"first_date=2025-08-25", "last_date=2026-08-24", "days_with_data=300", "total_orders=14362"} {
		if !strings.Contains(body, want) {
			t.Errorf("data coverage body missing %q: %s", want, body)
		}
	}
	empty := joyboyDataCoverageBody(repository.AISalesCoverage{})
	if !strings.Contains(empty, "status=no_data") {
		t.Errorf("empty coverage should report no_data, got %q", empty)
	}
}

// get_menu_metrics_for_period renders every menu's figures for a named period as
// a flat sheet, stating the period so the answer never reads as the 30-day
// window, and giving all metrics so the model ranks by whichever was asked.
func TestMenuForPeriodBodyStatesPeriodAndAllMetrics(t *testing.T) {
	body := joyboyMenuForPeriodBody("เดือนกรกฎาคม 2569", []repository.AIMenuMarginSummary{
		{MenuName: "ต้มยำกุ้ง", Quantity: 120, Revenue: 16680, Profit: 11000, Margin: 65.9},
		{MenuName: "ผัดไทย", Quantity: 98, Revenue: 8820, Profit: 5800, Margin: 65.8},
	})
	for _, want := range []string{"period=เดือนกรกฎาคม 2569", "not_30day_window", "menu=ต้มยำกุ้ง", "qty=120", "profit=", "margin_pct="} {
		if !strings.Contains(body, want) {
			t.Errorf("menu-for-period body missing %q: %s", want, body)
		}
	}
	if empty := joyboyMenuForPeriodBody("เดือนที่แล้ว", nil); !strings.Contains(empty, "status=no_data") {
		t.Errorf("no sales in period should report no_data, got %q", empty)
	}
}

// get_sales_for_period states the whole-store paid-sales total for a named
// window using grand_total from the orders table, so the model reports it
// instead of summing menu lines (the mistake that produced 347,353 for a
// 347,453 month). An empty window reads as no-data, not a zero baht answer.
func TestSalesForPeriodBodyStatesWholeStoreTotal(t *testing.T) {
	body := joyboySalesForPeriodBody(AIPeriod{Label: "เดือนกรกฎาคม 2569"}, repository.AISalesRange{Orders: 1285, Revenue: 347453, Days: 31}, time.Now())
	for _, want := range []string{"period=เดือนกรกฎาคม 2569", "whole_store", "revenue=347453", "orders=1285", "selling_days=31"} {
		if !strings.Contains(body, want) {
			t.Errorf("sales-for-period body missing %q: %s", want, body)
		}
	}
	// The average bill is a division the model may not do, so Go states it:
	// 347,453 / 1,285 = 270.39. Without this "บิลเฉลี่ยเดือนที่แล้ว" had no figure
	// to read and the reconcile guard turned the model's own division into "ไม่ทราบ".
	if !strings.Contains(body, "avg_per_order=270.39") {
		t.Errorf("the average bill should be computed here: %s", body)
	}
	if empty := joyboySalesForPeriodBody(AIPeriod{Label: "ปี 2567"}, repository.AISalesRange{}, time.Now()); !strings.Contains(empty, "status=no_data") {
		t.Errorf("no paid orders should report no_data, got %q", empty)
	}
}

// A month-to-month comparison carries the percent change computed in Go, so the
// model never divides two totals by hand. Its sign drives the direction, and a
// zero baseline is flagged rather than divided by.
func TestSalesComparisonBodyComputesPercentInGo(t *testing.T) {
	a := AIPeriod{Label: "เดือนสิงหาคม 2569"}
	b := AIPeriod{Label: "เดือนกรกฎาคม 2569"}
	up := joyboySalesComparisonBody(a, repository.AISalesRange{Orders: 100, Revenue: 120}, b, repository.AISalesRange{Orders: 90, Revenue: 100}, time.Now())
	for _, want := range []string{"period_a=เดือนสิงหาคม 2569", "revenue_a=120", "revenue_b=100", "change_pct=20.00", "direction=เพิ่มขึ้น", "avg_per_order_a=1.2", "avg_per_order_b=1.11"} {
		if !strings.Contains(up, want) {
			t.Errorf("comparison body missing %q: %s", want, up)
		}
	}
	// A fall reads as a Thai word with an unsigned percentage: a bare "-20" is what
	// let the model narrate the wrong subject and keep the minus sign.
	down := joyboySalesComparisonBody(a, repository.AISalesRange{Orders: 80, Revenue: 80}, b, repository.AISalesRange{Orders: 90, Revenue: 100}, time.Now())
	if !strings.Contains(down, "direction=ลดลง") || !strings.Contains(down, "change_pct=20.00") || strings.Contains(down, "-20") {
		t.Errorf("a fall should read direction=ลดลง with an unsigned percentage: %s", down)
	}
	zero := joyboySalesComparisonBody(a, repository.AISalesRange{Orders: 5, Revenue: 50}, b, repository.AISalesRange{}, time.Now())
	if !strings.Contains(zero, "change_pct=na") {
		t.Errorf("a zero baseline must not be divided by: %s", zero)
	}
}

// "เทียบเดือนนี้กับเดือนที่แล้ว" on the 4th read "ลดลง 90.61%": four days against
// thirty-one. The sheet now says how long each window is, how much of it has
// passed, and the change per selling day, so the model can see the windows
// are unequal and say so instead of sounding the alarm.
func TestSalesComparisonBodyFlagsUnevenWindows(t *testing.T) {
	loc := bangkokLocation()
	now := time.Date(2026, time.September, 4, 15, 0, 0, 0, loc)
	thisMonth := AIPeriod{Label: "เดือนกันยายน 2569", Start: time.Date(2026, 9, 1, 0, 0, 0, 0, loc), End: time.Date(2026, 10, 1, 0, 0, 0, 0, loc)}
	lastMonth := AIPeriod{Label: "เดือนสิงหาคม 2569", Start: time.Date(2026, 8, 1, 0, 0, 0, 0, loc), End: time.Date(2026, 9, 1, 0, 0, 0, 0, loc)}
	body := joyboySalesComparisonBody(
		thisMonth, repository.AISalesRange{Orders: 97, Revenue: 27033, Days: 4},
		lastMonth, repository.AISalesRange{Orders: 1064, Revenue: 287839, Days: 26}, now)

	for _, want := range []string{
		"calendar_days_a=30",
		"period_a_incomplete=true days_elapsed_a=4 of 30",
		"calendar_days_b=31",
		"per_selling_day_a=6758.25",
		"per_selling_day_b=11070.73",
		"per_day_change_pct=38.95 per_day_direction=ลดลง",
		"uneven_windows=true",
		"change_pct=90.61", // still there: true of the totals, just not the whole story
	} {
		if !strings.Contains(body, want) {
			t.Errorf("uneven comparison missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "period_b_incomplete") {
		t.Errorf("last month is over and must not read as incomplete:\n%s", body)
	}
}

// Two whole months of different lengths are uneven too — February against
// March is 28 days against 31 — and the flag says so without either being
// incomplete.
func TestSalesComparisonBodyFlagsDifferentMonthLengths(t *testing.T) {
	loc := bangkokLocation()
	now := time.Date(2026, time.September, 4, 15, 0, 0, 0, loc)
	feb := AIPeriod{Label: "เดือนกุมภาพันธ์ 2569", Start: time.Date(2026, 2, 1, 0, 0, 0, 0, loc), End: time.Date(2026, 3, 1, 0, 0, 0, 0, loc)}
	mar := AIPeriod{Label: "เดือนมีนาคม 2569", Start: time.Date(2026, 3, 1, 0, 0, 0, 0, loc), End: time.Date(2026, 4, 1, 0, 0, 0, 0, loc)}
	body := joyboySalesComparisonBody(mar, repository.AISalesRange{Orders: 10, Revenue: 3100, Days: 31}, feb, repository.AISalesRange{Orders: 10, Revenue: 2800, Days: 28}, now)
	if !strings.Contains(body, "uneven_windows=true") || strings.Contains(body, "incomplete") {
		t.Errorf("28 vs 31 days should be flagged uneven and nothing incomplete:\n%s", body)
	}
	// Same per-day takings: the flag should not be taken as a change.
	if !strings.Contains(body, "per_day_change_pct=0.00") {
		t.Errorf("equal per-day takings should read 0.00:\n%s", body)
	}
}

// A single window that is still running says so. "ยอดขายเดือนนี้" on the 4th is
// four days, and "วันนี้ขายได้เท่าไหร่" at three in the afternoon is a day not over.
func TestSalesForPeriodBodyMarksRunningWindow(t *testing.T) {
	loc := bangkokLocation()
	now := time.Date(2026, time.September, 4, 15, 0, 0, 0, loc)
	today := AIPeriod{Label: "วันนี้", Start: time.Date(2026, 9, 4, 0, 0, 0, 0, loc), End: time.Date(2026, 9, 5, 0, 0, 0, 0, loc)}
	body := joyboySalesForPeriodBody(today, repository.AISalesRange{Orders: 18, Revenue: 4895, Days: 1}, now)
	if !strings.Contains(body, "period_incomplete=true days_elapsed=1 of 1") || !strings.Contains(body, "incomplete_means=") {
		t.Errorf("a day still running must be marked:\n%s", body)
	}
	yesterday := AIPeriod{Label: "เมื่อวาน", Start: time.Date(2026, 9, 3, 0, 0, 0, 0, loc), End: time.Date(2026, 9, 4, 0, 0, 0, 0, loc)}
	done := joyboySalesForPeriodBody(yesterday, repository.AISalesRange{Orders: 20, Revenue: 5000, Days: 1}, now)
	if strings.Contains(done, "incomplete") {
		t.Errorf("yesterday is over and must not read as incomplete:\n%s", done)
	}
}

// The money still on the tables is its own line, never part of the paid total.
// Zero open bills is still a line: "no one seated" is an answer to "แล้วที่ยัง
// ไม่ปิดบิลล่ะ", and leaving it off would send the model guessing.
func TestOpenBillsNowIsASeparateFigure(t *testing.T) {
	body := joyboyOpenBillsNow([]repository.AIActiveOrder{
		{OrderNumber: "A1", GrandTotal: 320}, {OrderNumber: "A2", GrandTotal: 802},
	})
	if !strings.Contains(body, "open_bills_now=2 open_total_now=1122.00") {
		t.Errorf("open bills not summed as their own figure:\n%s", body)
	}
	if !strings.Contains(body, "ยังไม่รวมใน revenue") {
		t.Errorf("the sheet must say the open total is outside the paid total:\n%s", body)
	}
	if none := joyboyOpenBillsNow(nil); !strings.Contains(none, "open_bills_now=0 open_total_now=0.00") {
		t.Errorf("no open bills should still be stated:\n%s", none)
	}
}

// get_sales_forecast renders the next-7-days prediction as figures for the model
// to phrase, always carrying the "this is a prediction" caveat with the data and
// the measured accuracy. A closed day shows as closed, not a zero prediction.
func TestForecastBodyStatesPredictionCaveatAndAccuracy(t *testing.T) {
	body := joyboyForecastBody(&AIForecastResult{
		Forecast: []AIForecastPoint{
			{Date: "2026-08-27", Weekday: "พฤหัสบดี", Predicted: 8062, Lower: 6800, Upper: 9300},
			{Date: "2026-08-28", Weekday: "ศุกร์", Closed: true},
		},
		MAPE: 12.5, MAE: 1400, BacktestN: 28,
	})
	for _, want := range []string{"sales_forecast_next_7_days", "note=this_is_a_prediction", "mape_pct=12.50", "predicted=8062", "weekday=ศุกร์ status=closed", "week_total_predicted=8062"} {
		if !strings.Contains(body, want) {
			t.Errorf("forecast body missing %q: %s", want, body)
		}
	}
	if empty := joyboyForecastBody(&AIForecastResult{}); !strings.Contains(empty, "status=no_data") {
		t.Errorf("no forecast points should report no_data, got %q", empty)
	}
	if nilBody := joyboyForecastBody(nil); !strings.Contains(nilBody, "status=no_data") {
		t.Errorf("nil forecast should report no_data, got %q", nilBody)
	}
}

// A two-period comparison ships a bar chart of the same two revenue figures the
// answer states, so the picture and the words never disagree.
func TestSalesComparisonChartMirrorsTheFigures(t *testing.T) {
	// Older period first: the chart reads left → right as a timeline, so the
	// caller feeds the older window as the left bar and the newer as the right.
	c := buildSalesComparisonChart("เดือนกรกฎาคม 2569", 347453, "เดือนสิงหาคม 2569", 270363)
	if c.Kind != AIChartBar {
		t.Errorf("comparison should be a bar chart, got %q", c.Kind)
	}
	if len(c.Categories) != 2 || c.Categories[0] != "เดือนกรกฎาคม 2569" {
		t.Errorf("the older period should be the left bar, got %v", c.Categories)
	}
	if len(c.Series) != 1 || len(c.Series[0].Values) != 2 || c.Series[0].Values[0] != 347453 || c.Series[0].Values[1] != 270363 {
		t.Errorf("series must carry both revenues in order, got %+v", c.Series)
	}
	if c.Unit != "บาท" {
		t.Errorf("unit should be บาท, got %q", c.Unit)
	}
}

// The daily-sales line chart draws revenue per day, sorted oldest-first with
// compact day/month labels, from the same snapshot the trend answer uses. Too
// few days makes no line.
func TestDailySalesLineChartSortsAndLabels(t *testing.T) {
	c := buildDailySalesLineChart([]repository.AISalesSummary{
		{OrderDate: "2026-08-25", Revenue: 12000},
		{OrderDate: "2026-08-23", Revenue: 9000},
		{OrderDate: "2026-08-24", Revenue: 15000},
	})
	if c == nil {
		t.Fatal("expected a chart from three days")
	}
	if c.Kind != AIChartLine {
		t.Errorf("want a line chart, got %q", c.Kind)
	}
	if len(c.Categories) != 3 || c.Categories[0] != "23/8" || c.Categories[2] != "25/8" {
		t.Errorf("labels should be day/month oldest-first, got %v", c.Categories)
	}
	if len(c.Series) != 1 || c.Series[0].Values[0] != 9000 || c.Series[0].Values[2] != 12000 {
		t.Errorf("values must follow the sorted dates, got %+v", c.Series)
	}
	if buildDailySalesLineChart([]repository.AISalesSummary{{OrderDate: "2026-08-25", Revenue: 1}}) != nil {
		t.Error("a single day is not enough to draw a line")
	}
}

// Best-sellers draw as bars (by quantity, capped) and order types as a pie (by
// revenue share, Thai labels). Both draw from the same figures their tools
// report, and both refuse to draw when there is nothing to show.
func TestTopMenusBarAndOrderTypePie(t *testing.T) {
	bar := buildTopMenusBarChart([]repository.AIMenuSummary{
		{MenuName: "น้ำเปล่า", Quantity: 431, Revenue: 2000},
		{MenuName: "ต้มยำกุ้ง", Quantity: 395, Revenue: 50000},
	})
	if bar == nil || bar.Kind != AIChartBar || bar.Categories[0] != "น้ำเปล่า" || bar.Series[0].Values[0] != 431 {
		t.Errorf("top-menus bar wrong: %+v", bar)
	}
	if buildTopMenusBarChart(nil) != nil {
		t.Error("no menus should draw no bar")
	}

	pie := buildOrderTypePieChart([]repository.AIOrderTypeSummary{
		{OrderType: "dine_in", Orders: 100, Revenue: 80000},
		{OrderType: "takeaway", Orders: 40, Revenue: 20000},
	})
	if pie == nil || pie.Kind != AIChartPie {
		t.Fatalf("order-type pie missing: %+v", pie)
	}
	if pie.Categories[0] != "กินที่ร้าน" || pie.Categories[1] != "กลับบ้าน" || pie.Series[0].Values[0] != 80000 {
		t.Errorf("order-type pie wrong labels/values: %+v", pie)
	}
	if buildOrderTypePieChart([]repository.AIOrderTypeSummary{{OrderType: "dine_in", Revenue: 0}}) != nil {
		t.Error("no revenue should draw no pie")
	}
}

// A plain "what's on the menu" question must not drag a ranking chart along; only
// a ranking/chart intent does.
func TestMenuRankingChartWanted(t *testing.T) {
	for _, q := range []string{"เมนูขายดี 5 อันดับ", "เมนูไหนขายดีสุด", "ขอกราฟเมนูขายดี", "เมนูยอดนิยม"} {
		if !menuRankingChartWanted(q) {
			t.Errorf("%q should want a ranking chart", q)
		}
	}
	for _, q := range []string{"มีเมนูอะไรบ้างในร้านเรา", "ร้านมีเมนูอะไร", "ลิสต์เมนูทั้งหมด"} {
		if menuRankingChartWanted(q) {
			t.Errorf("%q is a plain list, no chart", q)
		}
	}
}

// A whole-year total ("ยอดขายปีนี้", "ยอดขายปี 2568") is claimed only when the
// question is about a sales total; menu or per-order questions that mention a
// year keep their own tools. A month question yields no bare year, so it stays
// with the month resolver.
func TestYearSalesTotalClaimsOnlyYearSalesQuestions(t *testing.T) {
	ref := time.Date(2026, 8, 26, 12, 0, 0, 0, bangkokLocation())
	if p, ok := joyboyYearSalesTotal("ยอดขายปีนี้เท่าไหร่", ref); !ok || !strings.Contains(p.Label, "2569") {
		t.Errorf("ยอดขายปีนี้ should resolve to ปี 2569, got ok=%v label=%q", ok, p.Label)
	}
	if p, ok := joyboyYearSalesTotal("ยอดขายปี 2568", ref); !ok || !strings.Contains(p.Label, "2568") {
		t.Errorf("ยอดขายปี 2568 should resolve, got ok=%v label=%q", ok, p.Label)
	}
	if _, ok := joyboyYearSalesTotal("เมนูขายดีปีนี้", ref); ok {
		t.Error("a menu question must not be hijacked by the year-sales total")
	}
	if _, ok := joyboyYearSalesTotal("ยอดขายเดือนกรกฎาคม", ref); ok {
		t.Error("a month question names no bare year and must fall through to the month resolver")
	}
}

// search_system_docs is the other joyboy-only tool, and it no longer searches:
// it hands over the whole manual. Scoring the question against each section was
// Go deciding which part of the manual someone meant, and a single missing
// letter was enough to decide wrong. The body must carry the manual itself, and
// must say plainly that anything outside it is not to be filled in.
func TestSystemDocsHandbookBodyCarriesTheManual(t *testing.T) {
	handbook, err := systemDocsHandbook("th")
	if err != nil {
		t.Fatalf("load manual: %v", err)
	}
	body := joyboySystemDocsHandbookBody(handbook)
	for _, want := range []string{
		"ทีม บทบาท และสิทธิ์", // the article a typo used to hide
		"/staff",              // the page that answers "กดตรงไหน"
		"เชิญสมาชิก",
		"คู่มือระบบทั้งฉบับ",
		"ห้ามเดาจากความรู้ทั่วไป",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("handbook body missing %q", want)
		}
	}
	if empty := joyboySystemDocsHandbookBody(""); !strings.Contains(empty, "status=no_data") {
		t.Errorf("an empty manual should report no_data, got %q", empty)
	}
}
