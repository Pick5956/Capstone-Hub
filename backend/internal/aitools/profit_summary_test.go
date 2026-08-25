package aitools

import (
	"testing"

	"Project-M/internal/repository"
)

// ComputeProfitSummary must sum the same per-menu margin rows the margin tools
// report, so the store total always reconciles with them. It must not run a
// second aggregate that could drift from the per-menu numbers the owner sees.
func TestComputeProfitSummarySumsTheMenuMargins(t *testing.T) {
	snapshot := AISnapshot{
		SalesDays: make([]repository.AISalesSummary, 30),
		AllMenuMargins: []repository.AIMenuMarginSummary{
			{MenuName: "ต้มยำ", Revenue: 15000, Cost: 6000, Profit: 9000},
			{MenuName: "ผัดไทย", Revenue: 5000, Cost: 2000, Profit: 3000},
		},
	}
	snapshot.AnalysisReadiness.MarginCostCoveragePercent = 100

	got := ComputeProfitSummary(snapshot)
	if got.Revenue != 20000 || got.Cost != 8000 || got.Profit != 12000 {
		t.Fatalf("sum wrong: revenue=%v cost=%v profit=%v", got.Revenue, got.Cost, got.Profit)
	}
	// margin = profit / revenue * 100 = 12000 / 20000 * 100 = 60
	if got.Margin != 60 {
		t.Fatalf("margin = %v, want 60", got.Margin)
	}
	if got.Days != 30 {
		t.Fatalf("days = %d, want 30", got.Days)
	}
	if got.CoveragePercent != 100 {
		t.Fatalf("coverage carried wrong: %v", got.CoveragePercent)
	}
}

// With no revenue there is no margin to divide by; the result must be zeroed
// rather than dividing by zero.
func TestComputeProfitSummaryHandlesNoRevenue(t *testing.T) {
	got := ComputeProfitSummary(AISnapshot{})
	if got.Revenue != 0 || got.Margin != 0 {
		t.Fatalf("empty snapshot should be zero, got revenue=%v margin=%v", got.Revenue, got.Margin)
	}
}
