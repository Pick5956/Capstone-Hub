package service

// Bridge between the intent-schema pilots (ai_menuquery.go / ai_ingredientquery.go)
// and the live snapshot data.
//
// PHASE 1 SCOPE — deliberately narrow. The structured path only claims questions
// that ask for an explicit rank beyond the first ("รองลงมา", "อันดับสอง",
// "อันดับที่ 3"), because the one-tool-per-question flow cannot express those at
// all and answers with the #1 item instead. Every rank-1 question keeps flowing
// through the existing tools, so wiring this in cannot regress today's answers.
//
// A metric is only served when the snapshot actually carries enough rows to rank
// it correctly; otherwise we return ok=false and the normal flow continues. That
// matters because some snapshot lists are one-directional (e.g. the price list
// holds only the five most expensive menus, so it cannot answer "cheapest").

// structuredQueryAnswer tries the menu domain, then the ingredient domain.
// Returns the Thai answer, the closest existing tool name (used by the frontend
// to pick follow-up chips), and whether it handled the question.
func structuredQueryAnswer(question string, snapshot AISnapshot) (string, AIToolName, bool) {
	if q, ok := parseMenuRankQuery(question); ok && q.Rank > 1 {
		if rows, tool, hasData := menuRowsForMetric(snapshot, q.Metric, q.Direction); hasData {
			if selected := executeMenuRank(rows, q); len(selected) > 0 {
				return formatMenuRank(q, selected), tool, true
			}
		}
	}
	if q, ok := parseIngredientRankQuery(question); ok && q.Rank > 1 {
		if rows, tool, hasData := ingredientRowsForDimension(snapshot, q.Dimension, q.Direction); hasData {
			if selected := executeIngredientRank(rows, q); len(selected) > 0 {
				return formatIngredientRank(q, selected), tool, true
			}
		}
	}
	return "", "", false
}

// menuRowsForMetric maps a metric onto the snapshot list that can rank it
// correctly. It returns hasData=false when the snapshot cannot answer that
// metric/direction combination faithfully.
func menuRowsForMetric(snapshot AISnapshot, metric, direction string) ([]menuMetricRow, AIToolName, bool) {
	switch metric {
	case "price":
		// Only the top-priced menus are in the snapshot, so "cheapest" is unknown.
		if direction != "high" || len(snapshot.MostExpensiveMenus) == 0 {
			return nil, "", false
		}
		rows := make([]menuMetricRow, 0, len(snapshot.MostExpensiveMenus))
		for _, m := range snapshot.MostExpensiveMenus {
			rows = append(rows, menuMetricRow{Name: m.Name, Price: m.Price})
		}
		return rows, AIToolGetMostExpensiveMenu, true

	case "margin":
		if !snapshot.AnalysisReadiness.CanAnalyzeMargin || len(snapshot.AllMenuMargins) == 0 {
			return nil, "", false
		}
		rows := make([]menuMetricRow, 0, len(snapshot.AllMenuMargins))
		for _, m := range snapshot.AllMenuMargins {
			rows = append(rows, menuMetricRow{Name: m.MenuName, Quantity: m.Quantity, Revenue: m.Revenue, Margin: m.Margin})
		}
		tool := AIToolGetHighestMarginMenu
		if direction == "low" {
			tool = AIToolGetLowestMarginMenu
		}
		return rows, tool, true

	case "cost":
		if !snapshot.AnalysisReadiness.CanAnalyzeMargin || len(snapshot.AllMenuMargins) == 0 {
			return nil, "", false
		}
		rows := make([]menuMetricRow, 0, len(snapshot.AllMenuMargins))
		for _, m := range snapshot.AllMenuMargins {
			if m.Quantity <= 0 {
				continue
			}
			// Rank by cost per dish, matching how the cost tools report it.
			rows = append(rows, menuMetricRow{Name: m.MenuName, Quantity: m.Quantity, Cost: m.Cost / float64(m.Quantity)})
		}
		if len(rows) == 0 {
			return nil, "", false
		}
		return rows, AIToolGetLowestCostMenu, true

	case "revenue":
		// The revenue list is sorted high-first and truncated, so "lowest" is unknown.
		if direction != "high" || len(snapshot.TopMenusByRevenue) == 0 {
			return nil, "", false
		}
		rows := make([]menuMetricRow, 0, len(snapshot.TopMenusByRevenue))
		for _, m := range snapshot.TopMenusByRevenue {
			rows = append(rows, menuMetricRow{Name: m.MenuName, Quantity: m.Quantity, Revenue: m.Revenue})
		}
		return rows, AIToolGetMenuRevenueRanking, true

	case "quantity":
		// Same truncation caveat; "least sold" stays with the slow-moving tool,
		// which also knows about menus that never sold at all.
		if direction != "high" || len(snapshot.TopMenuItems) == 0 {
			return nil, "", false
		}
		rows := make([]menuMetricRow, 0, len(snapshot.TopMenuItems))
		for _, m := range snapshot.TopMenuItems {
			rows = append(rows, menuMetricRow{Name: m.MenuName, Quantity: m.Quantity, Revenue: m.Revenue})
		}
		return rows, AIToolGetTopSellingMenus, true
	}
	return nil, "", false
}

// ingredientRowsForDimension builds rows from the full ingredient-usage list, so
// both directions are rankable.
func ingredientRowsForDimension(snapshot AISnapshot, dimension, direction string) ([]ingredientMetricRow, AIToolName, bool) {
	if len(snapshot.IngredientUsage) == 0 {
		return nil, "", false
	}
	rows := make([]ingredientMetricRow, 0, len(snapshot.IngredientUsage))
	for _, u := range snapshot.IngredientUsage {
		daysLeft := 0.0
		if u.Used > 0 {
			daysLeft = u.Stock / (u.Used / analysisWindowDays)
		}
		rows = append(rows, ingredientMetricRow{
			Name: u.Name, Unit: u.Unit, Stock: u.Stock, Used: u.Used, Cost: u.Cost, DaysLeft: daysLeft,
		})
	}

	switch dimension {
	case "cost":
		return rows, AIToolGetTopCostIngredients, true
	case "usage":
		tool := AIToolGetTopCostIngredients
		if direction == "low" {
			tool = AIToolGetDeadStock
		}
		return rows, tool, true
	case "stock":
		return rows, AIToolGetLowStockIngredients, true
	case "daysleft":
		// Only ingredients with recorded usage can be forecast.
		forecastable := make([]ingredientMetricRow, 0, len(rows))
		for _, r := range rows {
			if r.Used > 0 {
				forecastable = append(forecastable, r)
			}
		}
		if len(forecastable) == 0 {
			return nil, "", false
		}
		return forecastable, AIToolGetIngredientReorderForecast, true
	}
	return nil, "", false
}
