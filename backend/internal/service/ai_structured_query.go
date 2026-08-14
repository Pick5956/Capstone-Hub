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

import (
	"fmt"
	"strings"
)

// structuredQueryAnswer tries the menu domain, then the ingredient domain.
//
// question is the (possibly context-rewritten) text; askedQuestion is what the
// user actually typed. The rank is always read from askedQuestion, because a
// rewrite can silently drop the ordinal — "อันดับรองลงมาล่ะครับ" must stay rank 2
// even if the rewrite collapses it back into the earlier question.
//
// A follow-up that states only a rank ("อันดับรองลงมา") carries no metric, so the
// metric is inherited from the most recent question in history that had one. That
// resolution is deterministic and needs no LLM, which is what makes the follow-up
// reliable rather than dependent on how the rewrite happened to phrase things.
//
// Returns the Thai answer, the closest existing tool name (used by the frontend to
// pick follow-up chips), and whether it handled the question.
func structuredQueryAnswer(question, askedQuestion string, history []AIConversationMessage, snapshot AISnapshot) (string, AIToolName, bool) {
	rank := explicitRank(askedQuestion)
	if r := explicitRank(question); r > rank {
		rank = r
	}

	// A pure ordinal follow-up ("แล้วอันที่สองล่ะ") names no metric of its own. The
	// rewritten `question` cannot be trusted for the metric here: the context rewrite
	// can absorb a metric word from the previous ANSWER — a best-seller list also
	// prints รายได้/ราคา — and silently switch the axis (ขายดี → รายได้/ราคา). So when
	// the user's own words carry no metric, the metric is inherited from history and
	// the rewrite-derived metric is ignored. If history cannot supply it, fall
	// through to a clarify rather than guessing.
	if rank > 1 && !hasMetricWord(askedQuestion) {
		return inheritedRankAnswer(history, askedQuestion, rank, snapshot)
	}

	if q, ok := parseMenuRankQuery(question); ok {
		if rank > 1 && q.Rank <= 1 {
			q.Rank, q.Limit = rank, 1
		}
		if q.Rank > 1 {
			if answer, tool, done := answerMenuRank(q, snapshot); done {
				return answer, tool, true
			}
		}
	}
	if q, ok := parseIngredientRankQuery(question); ok {
		if rank > 1 && q.Rank <= 1 {
			q.Rank, q.Limit = rank, 1
		}
		if q.Rank > 1 {
			if answer, tool, done := answerIngredientRank(q, snapshot); done {
				return answer, tool, true
			}
		}
	}

	// Rank-only follow-up whose own wording did carry a metric but no parseable
	// subject: still fall back to the conversation.
	if rank > 1 {
		if answer, tool, done := inheritedRankAnswer(history, askedQuestion, rank, snapshot); done {
			return answer, tool, true
		}
	}
	return "", "", false
}

// inheritedRankAnswer resolves a rank-only follow-up from the most recent user
// question in history that named a metric, trying the menu domain then the
// ingredient one. The metric comes from what the user actually asked, never from
// the previous answer's wording.
//
// Only the raw current question is excluded from the history scan. The rewritten
// text must NOT be excluded: a good rewrite reconstructs the earlier question, so
// it can equal the very history entry the metric should be inherited from.
func inheritedRankAnswer(history []AIConversationMessage, askedQuestion string, rank int, snapshot AISnapshot) (string, AIToolName, bool) {
	if q, ok := inheritRankQueryFromHistory(history, askedQuestion); ok {
		q.Rank, q.Limit = rank, 1
		if answer, tool, done := answerMenuRank(q, snapshot); done {
			return answer, tool, true
		}
	}
	if q, ok := inheritIngredientQueryFromHistory(history, askedQuestion); ok {
		q.Rank, q.Limit = rank, 1
		if answer, tool, done := answerIngredientRank(q, snapshot); done {
			return answer, tool, true
		}
	}
	return "", "", false
}

// hasStructuredRankFollowUp reports whether the message is a rank request we can
// resolve deterministically. It needs no snapshot, so AskOperations can check it
// before the confidence gate: "อันดับรองลงมา" looks vague to the router and would
// otherwise be answered with "please be more specific", even though the previous
// turn tells us exactly what is being ranked.
func hasStructuredRankFollowUp(question, askedQuestion string, history []AIConversationMessage) bool {
	if explicitRank(askedQuestion) <= 1 && explicitRank(question) <= 1 {
		return false
	}
	if _, ok := parseMenuRankQuery(question); ok {
		return true
	}
	if _, ok := parseIngredientRankQuery(question); ok {
		return true
	}
	if _, ok := inheritRankQueryFromHistory(history, askedQuestion, question); ok {
		return true
	}
	_, ok := inheritIngredientQueryFromHistory(history, askedQuestion, question)
	return ok
}

func answerMenuRank(q menuRankQuery, snapshot AISnapshot) (string, AIToolName, bool) {
	rows, tool, hasData := menuRowsForMetric(snapshot, q.Metric, q.Direction)
	if !hasData {
		return "", "", false
	}
	selected := executeMenuRank(rows, q)
	if len(selected) == 0 {
		// The rank was understood but exceeds what exists ("อันดับ 40" of an
		// 11-item menu). Answering the #1 item here would be wrong; say how deep
		// the ranking actually goes instead.
		if q.Rank > len(rows) {
			return fmt.Sprintf(
				"ตอนนี้จัดอันดับเมนูตาม%sได้ถึงอันดับที่ %d เท่านั้นครับ (มี %d เมนู) ลองถามอันดับ 1-%d ได้เลยครับ",
				menuMetricNoun(q.Metric), len(rows), len(rows), len(rows),
			), tool, true
		}
		return "", "", false
	}
	return formatMenuRank(q, selected), tool, true
}

// menuMetricNoun names the metric in Thai for out-of-range messages.
func menuMetricNoun(metric string) string {
	switch metric {
	case "price":
		return "ราคา"
	case "margin":
		return "กำไร"
	case "revenue":
		return "รายได้"
	case "quantity":
		return "ยอดขาย"
	case "cost":
		return "ต้นทุน"
	}
	return "ข้อมูล"
}

func answerIngredientRank(q ingredientRankQuery, snapshot AISnapshot) (string, AIToolName, bool) {
	rows, tool, hasData := ingredientRowsForDimension(snapshot, q.Dimension, q.Direction)
	if !hasData {
		return "", "", false
	}
	selected := executeIngredientRank(rows, q)
	if len(selected) == 0 {
		if q.Rank > len(rows) {
			return fmt.Sprintf(
				"ตอนนี้จัดอันดับวัตถุดิบได้ถึงอันดับที่ %d เท่านั้นครับ (มี %d รายการ) ลองถามอันดับ 1-%d ได้เลยครับ",
				len(rows), len(rows), len(rows),
			), tool, true
		}
		return "", "", false
	}
	return formatIngredientRank(q, selected), tool, true
}

// inheritRankQueryFromHistory walks the user's earlier messages newest-first and
// returns the most recent one that named a menu metric.
func inheritRankQueryFromHistory(history []AIConversationMessage, exclude ...string) (menuRankQuery, bool) {
	for i := len(history) - 1; i >= 0; i-- {
		content, ok := historyUserQuestion(history[i], exclude)
		if !ok {
			continue
		}
		if q, ok := parseMenuRankQuery(content); ok && hasMetricWord(content) {
			return q, true
		}
	}
	return menuRankQuery{}, false
}

func inheritIngredientQueryFromHistory(history []AIConversationMessage, exclude ...string) (ingredientRankQuery, bool) {
	for i := len(history) - 1; i >= 0; i-- {
		content, ok := historyUserQuestion(history[i], exclude)
		if !ok {
			continue
		}
		if q, ok := parseIngredientRankQuery(content); ok && hasMetricWord(content) {
			return q, true
		}
	}
	return ingredientRankQuery{}, false
}

// historyUserQuestion returns a past user message, skipping the current question
// in case the client included it in the history it sent.
func historyUserQuestion(msg AIConversationMessage, exclude []string) (string, bool) {
	if msg.Role != "user" {
		return "", false
	}
	content := strings.TrimSpace(msg.Content)
	if content == "" {
		return "", false
	}
	for _, ex := range exclude {
		if strings.EqualFold(content, strings.TrimSpace(ex)) {
			return "", false
		}
	}
	return content, true
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
