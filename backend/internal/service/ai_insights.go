package service

import (
	"errors"
	"fmt"
	"sort"
)

// Proactive Insights — the "things you should know today" an owner sees without
// asking. Every card is computed deterministically in Go from the snapshot (never
// from an LLM), so the figures are exact and never hallucinated. This is the step
// from a reactive Q&A box to an assistant that watches the shop for you.

// AIInsight is one proactive card. Metric is a short, punchy value ("พออีก 1 วัน",
// "-50%") shown prominently so the card is scannable at a glance; Detail is the
// fuller one-line explanation shown smaller beneath it.
type AIInsight struct {
	Kind     string `json:"kind"`     // ingredient_low | sales_drop | sales_up | plowhorse | dead_stock
	Severity string `json:"severity"` // critical | warning | info
	Title    string `json:"title"`
	Metric   string `json:"metric"`
	Detail   string `json:"detail"`
}

const (
	insightSalesChangePct       = 10.0 // flag a weekly move of at least this %
	insightReorderDaysThreshold = 3.0  // flag ingredients with this many days left or fewer
	insightMaxPerKind           = 3    // cap one kind so it cannot bury the others
	insightMaxCards             = 5
)

// computeProactiveInsights surfaces the few most actionable facts, most urgent
// first, capped at insightMaxCards.
func computeProactiveInsights(snapshot AISnapshot) []AIInsight {
	insights := make([]AIInsight, 0, insightMaxCards)

	// 1) Ingredients about to run out — the most operationally urgent. Capped so a
	// shop that is low on many items does not bury every other kind of insight.
	lowCount := 0
	for _, it := range computeReorderForecast(snapshot.IngredientUsage) {
		if it.DaysLeft > insightReorderDaysThreshold {
			continue
		}
		if lowCount >= insightMaxPerKind {
			break
		}
		lowCount++
		severity := "warning"
		if it.DaysLeft <= 1 {
			severity = "critical"
		}
		metric := fmt.Sprintf("พออีก %.0f วัน", it.DaysLeft)
		if it.DaysLeft < 1 {
			metric = "พออีกไม่ถึงวัน"
		}
		insights = append(insights, AIInsight{
			Kind:     "ingredient_low",
			Severity: severity,
			Title:    fmt.Sprintf("%s ใกล้หมด", it.Name),
			Metric:   metric,
			Detail: fmt.Sprintf("เหลือ %.2f %s ใช้เฉลี่ย %.2f %s/วัน ควรสั่งเพิ่มครับ",
				it.Stock, it.Unit, it.DailyUse, it.Unit),
		})
	}

	// 2) Weekly sales anomaly (7 days vs the prior 7 days).
	if snapshot.AnalysisReadiness.CanAnalyzeRevenue {
		trend := computeSalesTrend(snapshot.SalesDays)
		if trend.HasPrior {
			switch {
			case trend.RevenueChangePct <= -insightSalesChangePct:
				insights = append(insights, AIInsight{
					Kind:     "sales_drop",
					Severity: "warning",
					Title:    "ยอดขายตก (7 วัน)",
					Metric:   fmt.Sprintf("-%.0f%%", -trend.RevenueChangePct),
					Detail: fmt.Sprintf("7 วันล่าสุด %s บาท เทียบ 7 วันก่อนหน้า %s บาท",
						formatMoney(trend.RecentRevenue), formatMoney(trend.PriorRevenue)),
				})
			case trend.RevenueChangePct >= insightSalesChangePct:
				insights = append(insights, AIInsight{
					Kind:     "sales_up",
					Severity: "info",
					Title:    "ยอดขายโต (7 วัน)",
					Metric:   fmt.Sprintf("+%.0f%%", trend.RevenueChangePct),
					Detail: fmt.Sprintf("7 วันล่าสุด %s บาท เทียบ 7 วันก่อนหน้า %s บาท",
						formatMoney(trend.RecentRevenue), formatMoney(trend.PriorRevenue)),
				})
			}
		}
	}

	// 3) Plowhorse — a popular menu with a thin margin (fix cost or price).
	if snapshot.AnalysisReadiness.CanAnalyzeMargin {
		if eng := computeMenuEngineering(snapshot.AllMenuMargins); len(eng.Plowhorses) > 0 {
			insights = append(insights, AIInsight{
				Kind:     "plowhorse",
				Severity: "info",
				Title:    fmt.Sprintf("%s ขายดี", eng.Plowhorses[0]),
				Metric:   "กำไรบาง",
				Detail:   "ขายดีแต่มาร์จิ้นต่ำ ลองทบทวนต้นทุนหรือปรับราคาเพื่อเพิ่มกำไรรวมครับ",
			})
		}
	}

	// 4) Dead stock — cash tied up in ingredients that are not moving.
	if dead := computeDeadStock(snapshot.IngredientUsage); len(dead) > 0 {
		top := dead[0]
		insights = append(insights, AIInsight{
			Kind:     "dead_stock",
			Severity: "info",
			Title:    fmt.Sprintf("%s ค้างสต็อก", top.Name),
			Metric:   fmt.Sprintf("~%s บาทจม", formatMoney(top.Value)),
			Detail: fmt.Sprintf("คงเหลือ %.2f %s ไม่ถูกใช้เลยในช่วง %s",
				top.Stock, top.Unit, analysisWindowLabel()),
		})
	}

	sort.SliceStable(insights, func(i, j int) bool {
		return severityRank(insights[i].Severity) < severityRank(insights[j].Severity)
	})
	if len(insights) > insightMaxCards {
		insights = insights[:insightMaxCards]
	}
	return insights
}

func severityRank(severity string) int {
	switch severity {
	case "critical":
		return 0
	case "warning":
		return 1
	default:
		return 2
	}
}

// ProactiveInsightsForOwner builds the snapshot and returns the deterministic
// insight cards for the owner's restaurant.
func (s *AIService) ProactiveInsightsForOwner(actor AIActorContext) ([]AIInsight, error) {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return nil, errors.New("authenticated restaurant owner context is required")
	}
	snapshot, err := s.buildSnapshot(actor.RestaurantID)
	if err != nil {
		return nil, err
	}
	return computeProactiveInsights(snapshot), nil
}
