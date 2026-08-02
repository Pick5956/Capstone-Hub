package service

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

const maxResolvedPlanCandidateTools = 5

// AIActorContext is populated by authenticated backend middleware. Values in a
// model response or request body must never be copied into this structure.
type AIActorContext struct {
	RestaurantID uint
	OwnerUserID  uint
	Role         string
}

// AICapabilityDecision is the execution boundary between an untrusted plan and
// deterministic repository code. CandidateTools is deliberately capped so a
// later provider call never receives the entire tool catalogue.
type AICapabilityDecision struct {
	CandidateTools []AIToolName
	SelectedTool   AIToolName
	ReadOnly       bool
}

type aiReadCapability struct {
	Tool    AIToolName
	Domain  ResolvedPlanDomain
	Metrics []ResolvedPlanMetric
	Order   int
}

var aiReadCapabilities = []aiReadCapability{
	{AIToolGetStoreSummary, ResolvedPlanDomainRestaurant, []ResolvedPlanMetric{ResolvedPlanMetricOverview}, 0},

	{AIToolGetSalesSummary, ResolvedPlanDomainSales, []ResolvedPlanMetric{ResolvedPlanMetricOverview, ResolvedPlanMetricRevenue, ResolvedPlanMetricOrderCount}, 0},
	{AIToolGetSalesForPeriod, ResolvedPlanDomainSales, []ResolvedPlanMetric{ResolvedPlanMetricRevenue, ResolvedPlanMetricOrderCount, ResolvedPlanMetricDataCoverage}, 1},
	{AIToolGetSalesTrend, ResolvedPlanDomainSales, []ResolvedPlanMetric{ResolvedPlanMetricSalesTrend, ResolvedPlanMetricRevenue}, 2},
	{AIToolGetAverageOrderValue, ResolvedPlanDomainSales, []ResolvedPlanMetric{ResolvedPlanMetricAverageOrder}, 3},
	{AIToolGetOrderTypeBreakdown, ResolvedPlanDomainSales, []ResolvedPlanMetric{ResolvedPlanMetricOrderTypeShare, ResolvedPlanMetricRevenue, ResolvedPlanMetricOrderCount}, 4},
	{AIToolGetPeakPeriods, ResolvedPlanDomainSales, []ResolvedPlanMetric{ResolvedPlanMetricPeakPeriod}, 5},

	{AIToolGetTopSellingMenus, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricQuantity, ResolvedPlanMetricOverview}, 0},
	{AIToolGetMenuRevenueRanking, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricRevenue}, 1},
	{AIToolGetHighestMarginMenu, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricMargin, ResolvedPlanMetricProfit}, 2},
	{AIToolGetLowestMarginMenu, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricMargin}, 3},
	{AIToolGetLowestCostMenu, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricCost}, 4},
	{AIToolGetMostExpensiveMenu, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricPrice}, 5},
	{AIToolGetSlowMovingMenus, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricQuantity}, 6},
	{AIToolGetMenuEngineering, ResolvedPlanDomainMenu, []ResolvedPlanMetric{ResolvedPlanMetricOverview, ResolvedPlanMetricMargin, ResolvedPlanMetricQuantity}, 7},

	{AIToolGetLowStockIngredients, ResolvedPlanDomainInventory, []ResolvedPlanMetric{ResolvedPlanMetricStockLevel, ResolvedPlanMetricStatus, ResolvedPlanMetricOverview}, 0},
	{AIToolGetInventoryValuation, ResolvedPlanDomainInventory, []ResolvedPlanMetric{ResolvedPlanMetricInventoryValue, ResolvedPlanMetricOverview}, 1},
	{AIToolGetIngredientReorderForecast, ResolvedPlanDomainInventory, []ResolvedPlanMetric{ResolvedPlanMetricDaysLeft, ResolvedPlanMetricUsage}, 2},
	{AIToolGetDeadStock, ResolvedPlanDomainInventory, []ResolvedPlanMetric{ResolvedPlanMetricDeadStock, ResolvedPlanMetricUsage}, 3},
	{AIToolGetTopCostIngredients, ResolvedPlanDomainInventory, []ResolvedPlanMetric{ResolvedPlanMetricCost, ResolvedPlanMetricUsage}, 4},
}

// AuthorizeResolvedPlan enforces tenant, owner, read-only, argument and tool
// policy. A schema-valid ResolvedPlan alone is never permission to query data.
func AuthorizeResolvedPlan(plan ResolvedPlan, actor AIActorContext) (AICapabilityDecision, error) {
	validated, err := NormalizeAndValidateResolvedPlan(plan)
	if err != nil {
		return AICapabilityDecision{}, err
	}
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 {
		return AICapabilityDecision{}, errors.New("AI capability: authenticated restaurant owner context is required")
	}
	if actor.Role != "owner" {
		return AICapabilityDecision{}, errors.New("AI capability: only the restaurant owner may use the assistant")
	}
	if validated.Resolution.NeedsClarification || len(validated.Resolution.MissingFields) > 0 {
		return AICapabilityDecision{}, errors.New("AI capability: an incomplete plan cannot execute")
	}
	if !validated.Policy.ReadOnly || validated.Policy.Risk != ResolvedPlanRiskLow {
		return AICapabilityDecision{}, errors.New("AI capability: write or elevated-risk plans require the action preview boundary")
	}
	if validated.Operation == ResolvedPlanOperationDraftAction || validated.Operation == ResolvedPlanOperationExecuteAction {
		return AICapabilityDecision{}, errors.New("AI capability: action operations are not read-only")
	}
	if err := validateResolvedPlanBusinessLimits(validated); err != nil {
		return AICapabilityDecision{}, err
	}

	candidates := CandidateToolsForResolvedPlan(validated)
	selected := validated.ToolHint
	if selected != "" && !containsAITool(candidates, selected) {
		return AICapabilityDecision{}, fmt.Errorf("AI capability: tool_hint %q is outside the candidate set", selected)
	}
	if selected == "" && len(candidates) > 0 {
		selected = candidates[0]
	}
	return AICapabilityDecision{
		CandidateTools: candidates,
		SelectedTool:   selected,
		ReadOnly:       true,
	}, nil
}

// CandidateToolsForResolvedPlan chooses at most five tools using only the
// validated domain and typed metrics. It does not trust free-form model text.
func CandidateToolsForResolvedPlan(plan ResolvedPlan) []AIToolName {
	type scoredCapability struct {
		capability aiReadCapability
		score      int
	}

	metrics := make(map[ResolvedPlanMetric]struct{}, len(plan.Parameters.Metrics))
	for _, metric := range plan.Parameters.Metrics {
		metrics[metric] = struct{}{}
	}
	scored := make([]scoredCapability, 0, maxResolvedPlanCandidateTools)
	for _, capability := range aiReadCapabilities {
		if capability.Domain != plan.Domain {
			continue
		}
		score := 10
		if capability.Tool == plan.ToolHint {
			score += 1000
		}
		for _, metric := range capability.Metrics {
			if _, ok := metrics[metric]; ok {
				score += 100
			}
		}
		scored = append(scored, scoredCapability{capability: capability, score: score})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].capability.Order < scored[j].capability.Order
	})
	if len(scored) > maxResolvedPlanCandidateTools {
		scored = scored[:maxResolvedPlanCandidateTools]
	}
	result := make([]AIToolName, 0, len(scored))
	for _, item := range scored {
		result = append(result, item.capability.Tool)
	}
	return result
}

func validateResolvedPlanBusinessLimits(plan ResolvedPlan) error {
	for field, value := range map[string]*ResolvedPlanTimeRange{
		"time_range":         plan.Parameters.TimeRange,
		"compare_time_range": plan.Parameters.CompareTimeRange,
	} {
		if value == nil || value.Kind == ResolvedPlanTimeRangeAllTime {
			continue
		}
		start, err := time.Parse("2006-01-02", value.StartDate)
		if err != nil {
			return fmt.Errorf("AI capability: %s has invalid start date", field)
		}
		end, err := time.Parse("2006-01-02", value.EndDate)
		if err != nil {
			return fmt.Errorf("AI capability: %s has invalid end date", field)
		}
		if end.Sub(start) > 366*24*time.Hour {
			return fmt.Errorf("AI capability: %s exceeds the 366-day query limit", field)
		}
	}
	return nil
}

func containsAITool(values []AIToolName, target AIToolName) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
