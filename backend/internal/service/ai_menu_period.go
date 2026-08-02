package service

import (
	"fmt"

	"Project-M/internal/repository"
)

// Period-scoped menu ranking.
//
// The snapshot only covers the rolling analysis window, so "เมนูไหนกำไรดีสุด
// เดือนที่ผ่านมา" used to be answered from the last 30 days — the wrong period,
// and (because the router reached for a revenue tool) often the wrong metric too.
// When a question names both a menu metric and a calendar period, the numbers are
// queried for exactly that period instead.
//
// Only metrics that are meaningful over a period are served here. A menu's price
// is not time-scoped, so a price question keeps using the current menu.

// answerPeriodMenuQuery handles "<menu metric> + <named period>" questions.
// handled=false means the question is not of that shape (or the data cannot
// support it), and the normal snapshot flow should continue.
func (s *AIService) answerPeriodMenuQuery(restaurantID uint, question, askedQuestion string) (*AIAskResponse, bool, error) {
	if s.repo == nil {
		return nil, false, nil
	}
	q, ok := parseMenuRankQuery(question)
	if !ok {
		return nil, false, nil
	}
	// Price is a property of the current menu, not of a past month.
	if q.Metric == "price" {
		return nil, false, nil
	}
	if rank := explicitRank(askedQuestion); rank > 1 && q.Rank <= 1 {
		q.Rank, q.Limit = rank, 1
	}

	periods := extractPeriods(question, repository.BangkokNow())
	if len(periods) == 0 {
		return nil, false, nil
	}
	period := periods[0]

	metrics, err := s.repo.MenuMetricsForRange(restaurantID, period.Start, period.End)
	if err != nil {
		return nil, false, err
	}
	if len(metrics) == 0 {
		return &AIAskResponse{
			Answer:   "ใน" + period.Label + " ยังไม่มีรายการขายที่ชำระเงินแล้วสำหรับจัดอันดับเมนูครับ",
			Intent:   AIIntentAnalysis,
			Task:     AITaskRetrieveFact,
			Model:    "local-menu-period",
			Snapshot: AISnapshot{},
		}, true, nil
	}

	rows := make([]menuMetricRow, 0, len(metrics))
	var totalCost float64
	for _, m := range metrics {
		totalCost += m.Cost
		row := menuMetricRow{
			Name:     m.MenuName,
			Quantity: m.Quantity,
			Revenue:  m.Revenue,
			Profit:   m.Profit,
			Margin:   m.Margin,
		}
		if m.Quantity > 0 {
			row.Cost = m.Cost / float64(m.Quantity) // cost per dish, as the cost tools report it
		}
		rows = append(rows, row)
	}

	// Without recorded ingredient cost, "margin" would read as 100% profit and
	// "cost" as zero. Decline so the usual readiness guardrail explains why.
	if (q.Metric == "margin" || q.Metric == "cost") && totalCost <= 0 {
		return nil, false, nil
	}

	selected := executeMenuRank(rows, q)
	if len(selected) == 0 {
		if q.Rank > len(rows) {
			return &AIAskResponse{
				Answer: fmt.Sprintf("ใน%s จัดอันดับเมนูได้ถึงอันดับที่ %d เท่านั้นครับ (มี %d เมนูที่มีการขาย)",
					period.Label, len(rows), len(rows)),
				Intent:   AIIntentAnalysis,
				Task:     AITaskRetrieveFact,
				Model:    "local-menu-period",
				Snapshot: AISnapshot{},
			}, true, nil
		}
		return nil, false, nil
	}

	return &AIAskResponse{
		Answer:   formatMenuRankInPeriod(q, selected, period.Label),
		Intent:   AIIntentAnalysis,
		Task:     AITaskRetrieveFact,
		Tool:     menuMetricTool(q.Metric, q.Direction),
		Model:    "local-menu-period",
		Snapshot: AISnapshot{},
	}, true, nil
}

// menuMetricTool maps the metric onto the closest existing tool name, which the
// frontend uses to choose follow-up chips.
func menuMetricTool(metric, direction string) AIToolName {
	switch metric {
	case "margin":
		if direction == "low" {
			return AIToolGetLowestMarginMenu
		}
		return AIToolGetHighestMarginMenu
	case "cost":
		return AIToolGetLowestCostMenu
	case "revenue":
		return AIToolGetMenuRevenueRanking
	case "quantity":
		return AIToolGetTopSellingMenus
	}
	return ""
}
