package service

// The ceiling of deterministic tool selection.
//
// Live measurement says the planner routes 60% of the golden set correctly and
// the legacy router 85%, but that one number hides two very different defects:
// the model can describe the question wrongly, or the model can describe it
// perfectly and our own mapping can still pick the wrong tool. Only the first
// is fixed by prompts or by a better provider.
//
// This test removes the model. Each case carries the plan a competent planner
// should produce for the question - domain, metrics, operation and ranking -
// written by hand, with tool_hint deliberately left empty because the migration
// plan is for Go to route from typed fields alone. Whatever this test cannot
// reach is unreachable no matter how good the model gets.

import (
	"testing"
)

type toolCeilingCase struct {
	question  string
	expected  AIToolName
	domain    ResolvedPlanDomain
	operation ResolvedPlanOperation
	metrics   []ResolvedPlanMetric
	groupBy   []ResolvedPlanGroupDimension
	direction ResolvedPlanRankDirection
	compare   bool
}

// Every data tool the golden set expects, with the plan its question deserves.
var toolCeilingCases = []toolCeilingCase{
	{
		question: "สรุปสถานการณ์ร้านช่วงนี้หน่อย", expected: AIToolGetStoreSummary,
		domain: ResolvedPlanDomainRestaurant, operation: ResolvedPlanOperationSummarize,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricOverview},
	},
	{
		question: "ยอดขายรวมช่วงนี้เท่าไหร่", expected: AIToolGetSalesSummary,
		domain: ResolvedPlanDomainSales, operation: ResolvedPlanOperationSummarize,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricOverview, ResolvedPlanMetricRevenue, ResolvedPlanMetricOrderCount},
	},
	{
		question: "เมื่อวานขายได้เท่าไหร่", expected: AIToolGetSalesForPeriod,
		domain: ResolvedPlanDomainSales, operation: ResolvedPlanOperationRetrieve,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricRevenue},
	},
	{
		question: "ยอดขายดีขึ้นหรือแย่ลงเทียบสัปดาห์ก่อน", expected: AIToolGetSalesTrend,
		domain: ResolvedPlanDomainSales, operation: ResolvedPlanOperationTrend,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricRevenue}, compare: true,
	},
	{
		question: "ลูกค้าจ่ายเฉลี่ยต่อบิลเท่าไหร่", expected: AIToolGetAverageOrderValue,
		domain: ResolvedPlanDomainSales, operation: ResolvedPlanOperationRetrieve,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricAverageOrder},
	},
	{
		question: "กินที่ร้านกับสั่งกลับบ้านอย่างไหนเยอะกว่า", expected: AIToolGetOrderTypeBreakdown,
		domain: ResolvedPlanDomainSales, operation: ResolvedPlanOperationBreakdown,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricOrderTypeShare, ResolvedPlanMetricOrderCount},
		groupBy: []ResolvedPlanGroupDimension{ResolvedPlanGroupOrderType},
	},
	{
		question: "ช่วงเวลาไหนคนเยอะสุด", expected: AIToolGetPeakPeriods,
		domain: ResolvedPlanDomainSales, operation: ResolvedPlanOperationBreakdown,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricPeakPeriod},
		groupBy: []ResolvedPlanGroupDimension{ResolvedPlanGroupHour},
	},
	{
		question: "เมนูไหนขายดีที่สุด", expected: AIToolGetTopSellingMenus,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricQuantity}, direction: ResolvedPlanRankHigh,
	},
	{
		question: "เมนูไหนขายไม่ค่อยออก ควรถอดไหม", expected: AIToolGetSlowMovingMenus,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricQuantity}, direction: ResolvedPlanRankLow,
	},
	{
		question: "เมนูไหนทำเงินให้ร้านมากสุด", expected: AIToolGetMenuRevenueRanking,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricRevenue}, direction: ResolvedPlanRankHigh,
	},
	{
		question: "เมนูไหนตั้งราคาแพงสุด", expected: AIToolGetMostExpensiveMenu,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricPrice}, direction: ResolvedPlanRankHigh,
	},
	{
		question: "เมนูไหนกำไรดีสุด", expected: AIToolGetHighestMarginMenu,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricMargin}, direction: ResolvedPlanRankHigh,
	},
	{
		question: "เมนูไหนกำไรน้อยสุด ควรตรวจสอบ", expected: AIToolGetLowestMarginMenu,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricMargin}, direction: ResolvedPlanRankLow,
	},
	{
		question: "เมนูไหนต้นทุนต่อจานถูกสุด", expected: AIToolGetLowestCostMenu,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricCost}, direction: ResolvedPlanRankLow,
	},
	{
		question: "วิเคราะห์เมนูให้หน่อย ตัวไหนดาวเด่นตัวไหนตัวถ่วง", expected: AIToolGetMenuEngineering,
		domain: ResolvedPlanDomainMenu, operation: ResolvedPlanOperationAnalyze,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricOverview, ResolvedPlanMetricMargin, ResolvedPlanMetricQuantity},
	},
	{
		question: "วัตถุดิบอะไรใกล้หมดบ้าง", expected: AIToolGetLowStockIngredients,
		domain: ResolvedPlanDomainInventory, operation: ResolvedPlanOperationList,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricStockLevel, ResolvedPlanMetricStatus},
	},
	{
		question: "ตอนนี้มูลค่าของในคลังเท่าไหร่", expected: AIToolGetInventoryValuation,
		domain: ResolvedPlanDomainInventory, operation: ResolvedPlanOperationRetrieve,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricInventoryValue},
	},
	{
		question: "ของไหนใกล้หมด ควรสั่งเพิ่มเมื่อไหร่", expected: AIToolGetIngredientReorderForecast,
		domain: ResolvedPlanDomainInventory, operation: ResolvedPlanOperationForecast,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricDaysLeft, ResolvedPlanMetricUsage},
	},
	{
		question: "มีของค้างสต๊อกที่ซื้อมาแล้วไม่ได้ใช้ไหม", expected: AIToolGetDeadStock,
		domain: ResolvedPlanDomainInventory, operation: ResolvedPlanOperationList,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricDeadStock},
	},
	{
		question: "วัตถุดิบอะไรกินต้นทุนเยอะสุด", expected: AIToolGetTopCostIngredients,
		domain: ResolvedPlanDomainInventory, operation: ResolvedPlanOperationRank,
		metrics: []ResolvedPlanMetric{ResolvedPlanMetricCost, ResolvedPlanMetricUsage}, direction: ResolvedPlanRankHigh,
	},
}

func (c toolCeilingCase) plan() ResolvedPlan {
	plan := ResolvedPlan{
		SchemaVersion:    ResolvedPlanSchemaVersion,
		OriginalQuestion: c.question,
		ResolvedQuestion: c.question,
		Task:             AITaskAnalyzeData,
		Domain:           c.domain,
		Operation:        c.operation,
		Parameters: ResolvedPlanParameters{
			Metrics:  c.metrics,
			GroupBy:  c.groupBy,
			Entities: []ResolvedPlanEntityRef{},
			Filters:  []ResolvedPlanFilter{},
			TimeRange: &ResolvedPlanTimeRange{
				Kind: ResolvedPlanTimeRangeMonth, Label: "เดือนนี้",
				StartDate: "2026-08-01", EndDate: "2026-09-01", Timezone: ResolvedPlanTimezone,
			},
		},
		Resolution: ResolvedPlanResolution{
			InheritedFields: []ResolvedPlanInheritedField{},
			MissingFields:   []ResolvedPlanField{},
			Confidence:      0.9,
		},
		Policy:        ResolvedPlanPolicy{Risk: ResolvedPlanRiskLow, ReadOnly: true},
		ResponseStyle: ResolvedPlanResponseNormal,
	}
	if c.direction != "" {
		plan.Parameters.Ranking = &ResolvedPlanRanking{
			Metric: c.metrics[0], Direction: c.direction, Rank: 1, Limit: 5,
		}
	}
	if c.compare {
		plan.Parameters.CompareTimeRange = &ResolvedPlanTimeRange{
			Kind: ResolvedPlanTimeRangeMonth, Label: "เดือนก่อน",
			StartDate: "2026-07-01", EndDate: "2026-08-01", Timezone: ResolvedPlanTimezone,
		}
	}
	return plan
}

func TestDeterministicToolSelectionCeiling(t *testing.T) {
	correct := 0
	for _, testCase := range toolCeilingCases {
		validated, err := NormalizeAndValidateResolvedPlan(testCase.plan())
		if err != nil {
			t.Errorf("%s: แผนที่เขียนเป็นเฉลยไว้ยังไม่ผ่าน validate เอง: %v", testCase.question, err)
			continue
		}
		candidates := CandidateToolsForResolvedPlan(validated)
		if len(candidates) == 0 {
			t.Errorf("%s: ไม่ได้ผู้สมัครสักตัว", testCase.question)
			continue
		}
		if candidates[0] == testCase.expected {
			correct++
			continue
		}
		rank := 0
		for index, candidate := range candidates {
			if candidate == testCase.expected {
				rank = index + 1
				break
			}
		}
		t.Errorf("%s\n      ควรได้ : %s\n      ได้    : %s (เฉลยอยู่อันดับ %d จาก %v)",
			testCase.question, testCase.expected, candidates[0], rank, candidates)
	}
	t.Logf("เพดานของการเลือก tool จาก domain+metrics ล้วนๆ: %d/%d", correct, len(toolCeilingCases))
}
