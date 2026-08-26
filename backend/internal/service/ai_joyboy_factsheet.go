package service

// Fact sheet rendering for joyboy.
//
// This exists because localToolAnswer, which legacy uses, does not return data —
// it returns a finished Thai answer, complete with "ครับ", bullet lists and
// emoji. Handing that to a model and asking for an answer asks it to reword
// someone else's writing, and it obliges: a store summary came back as legacy's
// own bullets in legacy's own order, emoji included.
//
// So joyboy renders the same AIToolResult as figures instead. There is no
// sentence to copy, so the model has to write one. The calculations are
// untouched — the values here are the values legacy would have printed, only
// without the prose around them. localToolAnswer is left exactly as it is,
// because legacy still answers users through it.
//
// The shape is one record per line, `key=value` separated by spaces. Numbers
// carry no thousands separators and no currency word: how a figure should look
// to an owner is the model's decision, and giving it a formatted string invites
// it to paste that string through.

import (
	"fmt"
	"strconv"
	"strings"

	"Project-M/internal/repository"
)

// joyboyNoData marks a tool that ran correctly but had nothing to report, with
// the reason attached — "no sales recorded" and "costs not filled in yet" call
// for different answers, and only the tool knows which one happened.
func joyboyNoData(reason string) string {
	return "status=no_data reason=" + reason
}

func joyboyNum(value float64) string {
	return strconv.FormatFloat(value, 'f', 2, 64)
}

func joyboyJoin(lines []string) string {
	return strings.Join(lines, "\n")
}

// joyboyMenuMarginLine renders the one menu shape that carries cost and profit.
func joyboyMenuMarginLine(menu *repository.AIMenuMarginSummary) string {
	quantity := float64(menu.Quantity)
	line := fmt.Sprintf("menu=%s qty=%d revenue=%s cost=%s profit=%s margin_pct=%s",
		menu.MenuName, menu.Quantity,
		joyboyNum(menu.Revenue), joyboyNum(menu.Cost), joyboyNum(menu.Profit), joyboyNum(menu.Margin))
	if quantity > 0 {
		line += fmt.Sprintf(" cost_per_dish=%s profit_per_dish=%s",
			joyboyNum(menu.Cost/quantity), joyboyNum(menu.Profit/quantity))
	}
	return line
}

// joyboyFactBody renders one tool result as figures. The second value reports
// whether this tool is rendered at all; an unrendered tool is left out of the
// fact sheet rather than shown as an empty block.
func joyboyFactBody(result AIToolResult) (string, bool) {
	window := "period=" + analysisWindowLabel()

	switch result.Tool {
	case AIToolGetLowestMarginMenu, AIToolGetHighestMarginMenu, AIToolGetLowestCostMenu:
		menu := result.LowestMarginMenu
		switch result.Tool {
		case AIToolGetHighestMarginMenu:
			menu = result.HighestMarginMenu
		case AIToolGetLowestCostMenu:
			menu = result.LowestCostMenu
		}
		if menu == nil || menu.Quantity <= 0 {
			return joyboyNoData("margin_needs_recorded_sales_and_ingredient_costs"), true
		}
		return joyboyJoin([]string{window, joyboyMenuMarginLine(menu)}), true

	case AIToolGetLowStockIngredients:
		if len(result.LowStockIngredients) == 0 {
			return joyboyNoData("no_ingredient_below_its_minimum"), true
		}
		lines := []string{"scope=current_stock_level"}
		for _, item := range result.LowStockIngredients {
			lines = append(lines, fmt.Sprintf(
				"ingredient=%s status=%s stock=%s unit=%s min_stock=%s restock_suggested=%s cost_per_unit=%s",
				item.Name, item.Status, joyboyNum(item.Stock), item.Unit,
				joyboyNum(item.MinStock), joyboyNum(item.RestockEstimate), joyboyNum(item.CostPerUnit)))
		}
		return joyboyJoin(lines), true

	case AIToolGetTopSellingMenus, AIToolGetMenuRevenueRanking, AIToolGetSlowMovingMenus:
		menus := result.TopSellingMenus
		order := "ranked_by=quantity_sold desc"
		switch result.Tool {
		case AIToolGetMenuRevenueRanking:
			menus, order = result.MenuRevenueRanking, "ranked_by=revenue desc"
		case AIToolGetSlowMovingMenus:
			menus, order = result.SlowMovingMenus, "ranked_by=quantity_sold asc"
		}
		if len(menus) == 0 {
			return joyboyNoData("no_menu_sales_recorded_in_period"), true
		}
		lines := []string{window, order}
		for index, menu := range menus {
			lines = append(lines, fmt.Sprintf("rank=%d menu=%s qty=%d revenue=%s",
				index+1, menu.MenuName, menu.Quantity, joyboyNum(menu.Revenue)))
		}
		return joyboyJoin(lines), true

	case AIToolGetInventoryValuation:
		valuation := result.InventoryValuation
		if valuation == nil {
			return joyboyNoData("no_ingredients_recorded"), true
		}
		return joyboyJoin([]string{
			"scope=current_stock_level",
			fmt.Sprintf("total_items=%d low_items=%d out_items=%d total_value=%s",
				valuation.TotalItems, valuation.LowItems, valuation.OutItems, joyboyNum(valuation.Value)),
		}), true

	case AIToolGetSalesSummary:
		summary := result.SalesSummary
		if summary == nil || summary.Orders == 0 {
			return joyboyNoData("no_orders_recorded_in_period"), true
		}
		return joyboyJoin([]string{
			window,
			fmt.Sprintf("days_with_data=%d orders=%d revenue=%s",
				summary.Days, summary.Orders, joyboyNum(summary.Revenue)),
		}), true

	case AIToolGetProfitSummary:
		profit := result.ProfitSummary
		if profit == nil || profit.Revenue == 0 {
			return joyboyNoData("no_margin_data_to_compute_profit"), true
		}
		lines := []string{
			window,
			fmt.Sprintf("revenue=%s cost=%s profit=%s margin_pct=%s",
				joyboyNum(profit.Revenue), joyboyNum(profit.Cost),
				joyboyNum(profit.Profit), joyboyNum(profit.Margin)),
		}
		// Below full coverage the cost is understated (uncosted menus add revenue
		// with no cost), so profit is a floor. Flag it so the answer can say so
		// rather than presenting a partial figure as the whole store's profit.
		if profit.CoveragePercent < 99.5 {
			lines = append(lines, fmt.Sprintf(
				"note=cost_covers_only_%s_pct_of_revenue_so_profit_is_a_floor",
				joyboyNum(profit.CoveragePercent)))
		}
		return joyboyJoin(lines), true

	case AIToolGetSalesTrend:
		trend := result.SalesTrend
		if trend == nil {
			return joyboyNoData("no_orders_recorded_in_period"), true
		}
		if !trend.HasPrior {
			return joyboyJoin([]string{
				fmt.Sprintf("recent_days=%d recent_orders=%d recent_revenue=%s",
					trend.RecentDays, trend.RecentOrders, joyboyNum(trend.RecentRevenue)),
				joyboyNoData("no_prior_week_to_compare_against"),
			}), true
		}
		return joyboyJoin([]string{
			fmt.Sprintf("recent_days=%d recent_orders=%d recent_revenue=%s",
				trend.RecentDays, trend.RecentOrders, joyboyNum(trend.RecentRevenue)),
			fmt.Sprintf("prior_days=%d prior_orders=%d prior_revenue=%s",
				trend.RecentDays, trend.PriorOrders, joyboyNum(trend.PriorRevenue)),
			fmt.Sprintf("revenue_change_pct=%s", joyboyNum(trend.RevenueChangePct)),
		}), true

	case AIToolGetAverageOrderValue:
		average := result.AverageOrderValue
		if average == nil || average.Orders == 0 {
			return joyboyNoData("no_orders_recorded_in_period"), true
		}
		return joyboyJoin([]string{
			window,
			fmt.Sprintf("days=%d orders=%d revenue=%s average_order_value=%s",
				average.Days, average.Orders, joyboyNum(average.Revenue), joyboyNum(average.AOV)),
		}), true

	case AIToolGetOrderTypeBreakdown:
		if len(result.OrderTypeBreakdown) == 0 {
			return joyboyNoData("no_orders_recorded_in_period"), true
		}
		lines := []string{window}
		for _, entry := range result.OrderTypeBreakdown {
			lines = append(lines, fmt.Sprintf("order_type=%s orders=%d revenue=%s",
				entry.OrderType, entry.Orders, joyboyNum(entry.Revenue)))
		}
		return joyboyJoin(lines), true

	case AIToolGetPeakPeriods:
		peak := result.PeakPeriods
		if peak == nil || !peak.HasData {
			return joyboyNoData("no_orders_recorded_in_period"), true
		}
		return joyboyJoin([]string{
			window,
			fmt.Sprintf("busiest_weekday=%s weekday_orders=%d",
				thaiWeekdayName(peak.TopWeekday), peak.TopWeekdayOrders),
			fmt.Sprintf("busiest_hour=%02d:00 hour_orders=%d", peak.TopHour, peak.TopHourOrders),
		}), true

	case AIToolGetMenuEngineering:
		engineering := result.MenuEngineering
		if engineering == nil {
			return joyboyNoData("menu_classification_needs_sales_and_costs"), true
		}
		// The quadrant name is the classification itself, so it stays in English
		// with its meaning spelled out beside it. Without that the model has to
		// guess what "plowhorse" means, and it guesses differently each time.
		quadrants := []struct {
			name    string
			meaning string
			menus   []string
		}{
			{"star", "popular_and_high_margin", engineering.Stars},
			{"plowhorse", "popular_but_low_margin", engineering.Plowhorses},
			{"puzzle", "unpopular_but_high_margin", engineering.Puzzles},
			{"dog", "unpopular_and_low_margin", engineering.Dogs},
		}
		lines := []string{window, "classification=popularity_vs_margin"}
		for _, quadrant := range quadrants {
			// An empty value reads as missing data rather than as an empty
			// quadrant, and the difference changes the answer.
			menus := "(none)"
			if len(quadrant.menus) > 0 {
				menus = strings.Join(quadrant.menus, ", ")
			}
			lines = append(lines, fmt.Sprintf("quadrant=%s meaning=%s menus=%s",
				quadrant.name, quadrant.meaning, menus))
		}
		return joyboyJoin(lines), true

	case AIToolGetIngredientReorderForecast:
		if len(result.ReorderForecast) == 0 {
			return joyboyNoData("no_ingredient_usage_recorded_to_project_from"), true
		}
		lines := []string{window, "projection=stock_divided_by_average_daily_use"}
		for _, item := range result.ReorderForecast {
			lines = append(lines, fmt.Sprintf(
				"ingredient=%s stock=%s unit=%s daily_use=%s days_left=%s",
				item.Name, joyboyNum(item.Stock), item.Unit,
				joyboyNum(item.DailyUse), joyboyNum(item.DaysLeft)))
		}
		return joyboyJoin(lines), true

	case AIToolGetDeadStock:
		if len(result.DeadStock) == 0 {
			return joyboyNoData("every_stocked_ingredient_was_used_in_period"), true
		}
		lines := []string{window, "meaning=held_in_stock_but_never_used_in_period"}
		for _, item := range result.DeadStock {
			lines = append(lines, fmt.Sprintf("ingredient=%s stock=%s unit=%s value=%s",
				item.Name, joyboyNum(item.Stock), item.Unit, joyboyNum(item.Value)))
		}
		return joyboyJoin(lines), true

	case AIToolGetTopCostIngredients:
		if len(result.TopCostIngredients) == 0 {
			return joyboyNoData("no_ingredient_usage_recorded_in_period"), true
		}
		lines := []string{window, "ranked_by=total_cost_consumed desc"}
		for index, item := range result.TopCostIngredients {
			lines = append(lines, fmt.Sprintf("rank=%d ingredient=%s cost=%s used=%s unit=%s",
				index+1, item.Name, joyboyNum(item.Cost), joyboyNum(item.Used), item.Unit))
		}
		return joyboyJoin(lines), true

	case AIToolGetStoreSummary:
		summary := result.StoreSummary
		if summary == nil || summary.Orders == 0 {
			return joyboyNoData("no_orders_recorded_in_period"), true
		}
		lines := []string{
			window,
			fmt.Sprintf("days_with_data=%d orders=%d revenue=%s",
				summary.Days, summary.Orders, joyboyNum(summary.Revenue)),
		}
		if summary.Trend != nil && summary.Trend.HasPrior {
			lines = append(lines, fmt.Sprintf(
				"recent_%dd_revenue=%s prior_%dd_revenue=%s revenue_change_pct=%s",
				summary.Trend.RecentDays, joyboyNum(summary.Trend.RecentRevenue),
				summary.Trend.RecentDays, joyboyNum(summary.Trend.PriorRevenue),
				joyboyNum(summary.Trend.RevenueChangePct)))
		}
		for index, menu := range summary.TopMenus {
			lines = append(lines, fmt.Sprintf("top_menu_rank=%d menu=%s qty=%d revenue=%s",
				index+1, menu.MenuName, menu.Quantity, joyboyNum(menu.Revenue)))
		}
		if summary.MarginReady && summary.BestMargin != nil {
			lines = append(lines, "best_margin_"+joyboyMenuMarginLine(summary.BestMargin))
		} else if !summary.MarginReady {
			lines = append(lines, "margin=unavailable reason=ingredient_costs_not_complete")
		}
		// This tool carries only the count, so it says so rather than letting the
		// model assume the names were withheld for brevity.
		lines = append(lines, fmt.Sprintf(
			"ingredients_below_minimum=%d names_not_included_use_get_low_stock_ingredients",
			summary.LowStockCount))
		return joyboyJoin(lines), true

	case AIToolGetSalesForPeriod:
		period := result.SalesForPeriod
		if period == nil {
			return joyboyNoData("period_not_recognised"), true
		}
		if period.Orders == 0 {
			return joyboyJoin([]string{
				"period=" + period.Label,
				joyboyNoData("no_orders_recorded_in_that_period"),
			}), true
		}
		line := fmt.Sprintf("period=%s days=%d orders=%d revenue=%s",
			period.Label, period.Days, period.Orders, joyboyNum(period.Revenue))
		if strings.TrimSpace(period.LatestDate) != "" {
			line += " latest_order_date=" + period.LatestDate
		}
		return line, true

	case AIToolGetMostExpensiveMenu:
		if len(result.MostExpensiveMenus) == 0 {
			return joyboyNoData("no_menu_items_recorded"), true
		}
		lines := []string{"ranked_by=listed_menu_price desc", "note=price_charged_per_dish_not_revenue"}
		for index, menu := range result.MostExpensiveMenus {
			lines = append(lines, fmt.Sprintf("rank=%d menu=%s price=%s",
				index+1, menu.Name, joyboyNum(menu.Price)))
		}
		return joyboyJoin(lines), true
	}

	return "", false
}

// joyboyDataCoverageBody renders the full span of real data — first and last day
// with paid sales — for "how far back does the data reach?" questions. Unlike the
// snapshot tools it is not scoped to the 30-day window; it reports the whole
// history, which is the point of the question.
func joyboyDataCoverageBody(cov repository.AISalesCoverage) string {
	if cov.FirstDate == "" || cov.Orders == 0 {
		return joyboyNoData("no_paid_sales_recorded_at_all")
	}
	return joyboyJoin([]string{
		"first_date=" + cov.FirstDate,
		"last_date=" + cov.LastDate,
		"days_with_data=" + strconv.FormatInt(cov.Days, 10),
		"total_orders=" + strconv.FormatInt(cov.Orders, 10),
		"total_revenue=" + joyboyNum(cov.Revenue),
	})
}

// joyboyMenuForPeriodBody renders every menu's figures for a named calendar
// period as a flat sheet, ordered as the query returned them (revenue desc). It
// gives the model all the metrics at once — qty, revenue, profit, margin — and
// lets it rank by whichever the question asked, rather than picking a ranking in
// Go the way legacy's finished answer does. The period label is stated so the
// answer never reads as the 30-day window.
func joyboyMenuForPeriodBody(label string, metrics []repository.AIMenuMarginSummary) string {
	if len(metrics) == 0 {
		return joyboyJoin([]string{"period=" + label, joyboyNoData("no_menu_sales_recorded_in_period")})
	}
	lines := []string{"period=" + label, "scope=named_period_not_30day_window"}
	const limit = 15
	for i, m := range metrics {
		if i >= limit {
			break
		}
		lines = append(lines, fmt.Sprintf("menu=%s qty=%d revenue=%s profit=%s margin_pct=%s",
			m.MenuName, m.Quantity, joyboyNum(m.Revenue), joyboyNum(m.Profit), joyboyNum(m.Margin)))
	}
	return joyboyJoin(lines)
}

// joyboySalesForPeriodBody renders the whole-store paid-sales total for one
// named window (a day, month, or year). Revenue is grand_total straight from
// the orders table — the authoritative figure — so the model states it rather
// than re-deriving it by summing menu lines (which drops rounding and misses
// anything that is not a menu subtotal).
func joyboySalesForPeriodBody(label string, d repository.AISalesRange) string {
	if d.Orders == 0 {
		return joyboyJoin([]string{"period=" + label, "scope=named_period_paid_sales_whole_store", joyboyNoData("no_paid_orders_in_period")})
	}
	return joyboyJoin([]string{
		"period=" + label,
		"scope=named_period_paid_sales_whole_store",
		"revenue=" + joyboyNum(d.Revenue),
		fmt.Sprintf("orders=%d", d.Orders),
		fmt.Sprintf("selling_days=%d", d.Days),
	})
}

// joyboySalesComparisonBody renders two windows plus the percent change between
// them. The percentage is computed in Go, not left to the model — a model
// dividing two totals by hand is exactly the mistake this avoids — so the figure
// lands in the fact sheet where reconcileFigures can check it.
func joyboySalesComparisonBody(a AIPeriod, da repository.AISalesRange, b AIPeriod, db repository.AISalesRange) string {
	lines := []string{
		"scope=named_period_comparison_whole_store",
		fmt.Sprintf("period_a=%s revenue_a=%s orders_a=%d", a.Label, joyboyNum(da.Revenue), da.Orders),
		fmt.Sprintf("period_b=%s revenue_b=%s orders_b=%d", b.Label, joyboyNum(db.Revenue), db.Orders),
	}
	switch {
	case db.Revenue > 0:
		pct := (da.Revenue - db.Revenue) / db.Revenue * 100
		dir := "up"
		if pct < 0 {
			dir = "down"
		}
		lines = append(lines, fmt.Sprintf("change_pct=%s direction=%s", joyboyNum(pct), dir))
	case da.Revenue > 0:
		lines = append(lines, "change_pct=na reason=period_b_has_no_sales")
	default:
		lines = append(lines, "change_pct=na reason=both_periods_have_no_sales")
	}
	return joyboyJoin(lines)
}

// joyboyForecastBody renders the next-7-days sales prediction as figures for the
// model to phrase. The numbers are computed in Go (weekday average × trend,
// bounds from a 28-day backtest); the model states them but must not invent any,
// and the same result is drawn as a chart on the frontend. The note line is
// deliberate: a forecast presented as fact is a lie, so the caveat travels with
// the data, not only in the guide.
func joyboyForecastBody(r *AIForecastResult) string {
	if r == nil || len(r.Forecast) == 0 {
		return joyboyNoData("not_enough_daily_history_to_forecast")
	}
	lines := []string{
		"scope=sales_forecast_next_7_days",
		"method=weekday_average_x_recent_trend",
		"note=this_is_a_prediction_not_actual_sales_state_the_caveat",
	}
	if r.BacktestN >= 5 {
		lines = append(lines, fmt.Sprintf("accuracy=backtest_%dd mape_pct=%s mae_baht=%s",
			r.BacktestN, joyboyNum(r.MAPE), joyboyNum(r.MAE)))
	} else {
		lines = append(lines, "accuracy=too_little_data_to_measure_use_wide_band")
	}
	if r.StaleDays > 0 {
		lines = append(lines, fmt.Sprintf("data_stale_days=%d", r.StaleDays))
	}
	// Whole baht: a forecast carries no sub-baht precision, so ".00" would be a
	// lie about how exact it is (and the model pastes whatever it is given).
	baht := func(v float64) string { return fmt.Sprintf("%.0f", v) }
	// The week total is summed here, in Go, so a question like "how much will I
	// sell next week" has an authoritative figure to state — the model must not
	// add up the seven days itself (that is the drift reconcileFigures cannot
	// catch, since a self-summed total is not in this sheet).
	var weekPredicted, weekLower, weekUpper float64
	for _, f := range r.Forecast {
		if f.Closed {
			lines = append(lines, fmt.Sprintf("day=%s weekday=%s status=closed", f.Date, f.Weekday))
			continue
		}
		weekPredicted += f.Predicted
		weekLower += f.Lower
		weekUpper += f.Upper
		lines = append(lines, fmt.Sprintf("day=%s weekday=%s predicted=%s range=%s-%s",
			f.Date, f.Weekday, baht(f.Predicted), baht(f.Lower), baht(f.Upper)))
	}
	lines = append(lines, fmt.Sprintf("week_total_predicted=%s week_total_range=%s-%s",
		baht(weekPredicted), baht(weekLower), baht(weekUpper)))
	return joyboyJoin(lines)
}

// joyboySystemDocsBody renders documentation search hits for the model to answer
// "how do I use X?" from. Unlike the figure tools this body is prose — the actual
// manual text — because the answer is explaining the system, not reporting a
// number. The model rewrites it to fit the question rather than pasting it.
func joyboySystemDocsBody(result AISystemDocsToolResult) string {
	if len(result.SearchResults) == 0 {
		return joyboyNoData("no_matching_documentation")
	}
	lines := make([]string, 0, len(result.SearchResults)*2)
	for _, hit := range result.SearchResults {
		title := strings.TrimSpace(hit.ArticleTitle)
		if section := strings.TrimSpace(hit.SectionTitle); section != "" {
			title += " — " + section
		}
		lines = append(lines, "หัวข้อ: "+title)
		if content := strings.TrimSpace(hit.RelevantContent); content != "" {
			lines = append(lines, content)
		}
		lines = append(lines, "")
	}
	return joyboyJoin(lines)
}
