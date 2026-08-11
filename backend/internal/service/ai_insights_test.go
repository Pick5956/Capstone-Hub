package service

import (
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

func readySnapshot() AISnapshot {
	return AISnapshot{AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
		SalesItems: 25, MarginItems: 25, CostedMarginItems: 25, SoldMenus: 8, SoldMenusWithRecipes: 8,
	})}
}

// An ingredient running out within the threshold produces an urgent card first.
func TestProactiveInsightsFlagsRunningOutIngredient(t *testing.T) {
	snap := readySnapshot()
	// Used 15000/30 days = 500/day; 500 in stock => ~1 day left => critical.
	snap.IngredientUsage = []repository.AIIngredientUsage{
		{Name: "กุ้งสด", Unit: "กรัม", Stock: 500, Used: 15000, CostPerUnit: 0.5},
	}
	insights := computeProactiveInsights(snap)
	if len(insights) == 0 || insights[0].Kind != "ingredient_low" {
		t.Fatalf("expected an ingredient_low insight first, got %+v", insights)
	}
	if insights[0].Severity != "critical" || !strings.Contains(insights[0].Title, "กุ้งสด") {
		t.Fatalf("running-out ingredient card wrong: %+v", insights[0])
	}
}

// A sharp weekly drop is surfaced as a warning.
func TestProactiveInsightsFlagsSalesDrop(t *testing.T) {
	snap := readySnapshot()
	base := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC) // 7 prior days, then 7 recent
	days := make([]repository.AISalesSummary, 0, 14)
	for i := 0; i < 14; i++ {
		revenue := 4000.0
		if i >= 7 {
			revenue = 2000.0 // recent week halved
		}
		days = append(days, repository.AISalesSummary{
			OrderDate: base.AddDate(0, 0, i).Format("2006-01-02"), Orders: 30, Revenue: revenue,
		})
	}
	snap.SalesDays = days
	found := false
	for _, in := range computeProactiveInsights(snap) {
		if in.Kind == "sales_drop" {
			found = true
		}
	}
	if !found {
		t.Fatal("a 50% weekly drop should produce a sales_drop insight")
	}
}

// A healthy shop (no risks) produces no noisy cards.
func TestProactiveInsightsQuietWhenHealthy(t *testing.T) {
	if got := computeProactiveInsights(readySnapshot()); len(got) != 0 {
		t.Fatalf("healthy snapshot should have no insights, got %+v", got)
	}
}

func TestSeverityRankOrder(t *testing.T) {
	if !(severityRank("critical") < severityRank("warning") && severityRank("warning") < severityRank("info")) {
		t.Fatal("severity ranking must be critical < warning < info")
	}
}
