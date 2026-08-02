package service

import (
	"strings"
	"testing"
)

func TestAuthorizeResolvedPlanAllowsScopedOwnerRead(t *testing.T) {
	plan := validResolvedPlan()
	decision, err := AuthorizeResolvedPlan(plan, AIActorContext{
		RestaurantID: 12,
		OwnerUserID:  34,
		Role:         "owner",
	})
	if err != nil {
		t.Fatalf("AuthorizeResolvedPlan: %v", err)
	}
	if !decision.ReadOnly || decision.SelectedTool != AIToolGetTopSellingMenus {
		t.Fatalf("decision = %+v", decision)
	}
	if len(decision.CandidateTools) == 0 || len(decision.CandidateTools) > maxResolvedPlanCandidateTools {
		t.Fatalf("candidate tools = %v", decision.CandidateTools)
	}
}

func TestAuthorizeResolvedPlanRejectsNonOwnerAndMissingScope(t *testing.T) {
	plan := validResolvedPlan()
	tests := []struct {
		name  string
		actor AIActorContext
	}{
		{"manager", AIActorContext{RestaurantID: 1, OwnerUserID: 2, Role: "manager"}},
		{"missing restaurant", AIActorContext{OwnerUserID: 2, Role: "owner"}},
		{"missing owner", AIActorContext{RestaurantID: 1, Role: "owner"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := AuthorizeResolvedPlan(plan, test.actor); err == nil {
				t.Fatal("expected authorization error")
			}
		})
	}
}

func TestAuthorizeResolvedPlanRejectsIncompleteAndOversizedQueries(t *testing.T) {
	actor := AIActorContext{RestaurantID: 1, OwnerUserID: 2, Role: "owner"}

	incomplete := validResolvedPlan()
	incomplete.Task = AITaskUnclear
	incomplete.Domain = ResolvedPlanDomainGeneral
	incomplete.Operation = ResolvedPlanOperationClarify
	incomplete.Parameters = emptyResolvedPlanParameters()
	incomplete.ToolHint = ""
	incomplete.Resolution.NeedsClarification = true
	incomplete.Resolution.MissingFields = []ResolvedPlanField{ResolvedPlanFieldTask}
	incomplete.Resolution.ClarificationQuestion = "ต้องการดูข้อมูลส่วนใดครับ"
	if _, err := AuthorizeResolvedPlan(incomplete, actor); err == nil || !strings.Contains(err.Error(), "incomplete") {
		t.Fatalf("incomplete plan error = %v", err)
	}

	oversized := validResolvedPlan()
	oversized.Parameters.TimeRange.StartDate = "2025-01-01"
	oversized.Parameters.TimeRange.EndDate = "2026-08-01"
	if _, err := AuthorizeResolvedPlan(oversized, actor); err == nil || !strings.Contains(err.Error(), "366-day") {
		t.Fatalf("oversized plan error = %v", err)
	}
}

func TestCandidateToolsForResolvedPlanAreDomainScopedAndCapped(t *testing.T) {
	plan := validResolvedPlan()
	plan.ToolHint = ""
	plan.Parameters.Metrics = []ResolvedPlanMetric{ResolvedPlanMetricRevenue}

	menuTools := CandidateToolsForResolvedPlan(plan)
	if len(menuTools) != maxResolvedPlanCandidateTools {
		t.Fatalf("menu candidate count = %d, want %d (%v)", len(menuTools), maxResolvedPlanCandidateTools, menuTools)
	}
	if menuTools[0] != AIToolGetMenuRevenueRanking {
		t.Fatalf("first revenue candidate = %q, want %q", menuTools[0], AIToolGetMenuRevenueRanking)
	}
	for _, tool := range menuTools {
		if !toolSupportsResolvedPlanDomain(tool, ResolvedPlanDomainMenu) {
			t.Fatalf("menu candidate %q is not menu-scoped", tool)
		}
	}

	plan.Domain = ResolvedPlanDomainInventory
	plan.Parameters.Metrics = []ResolvedPlanMetric{ResolvedPlanMetricStockLevel}
	inventoryTools := CandidateToolsForResolvedPlan(plan)
	if len(inventoryTools) != maxResolvedPlanCandidateTools || inventoryTools[0] != AIToolGetLowStockIngredients {
		t.Fatalf("inventory candidates = %v", inventoryTools)
	}
	for _, tool := range inventoryTools {
		if !toolSupportsResolvedPlanDomain(tool, ResolvedPlanDomainInventory) {
			t.Fatalf("inventory candidate %q is not inventory-scoped", tool)
		}
	}
}

func TestCandidateToolsPinsValidatedToolHintInsideFiveToolLimit(t *testing.T) {
	plan := validResolvedPlan()
	plan.ToolHint = AIToolGetMenuEngineering
	tools := CandidateToolsForResolvedPlan(plan)
	if len(tools) > maxResolvedPlanCandidateTools || tools[0] != AIToolGetMenuEngineering {
		t.Fatalf("candidate tools = %v", tools)
	}
}
