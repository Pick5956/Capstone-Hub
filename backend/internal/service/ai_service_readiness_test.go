package service

import (
	"strings"
	"testing"

	"Project-M/internal/repository"
)

func TestAnalysisReadinessWithoutSalesBlocksAnalysisAndRecommendations(t *testing.T) {
	readiness := analysisReadinessFromCoverage(repository.AIAnalysisCoverage{})

	if readiness.HasSales || readiness.CanAnalyzeRevenue || readiness.CanAnalyzeMargin || readiness.CanRecommendActions {
		t.Fatalf("readiness without sales = %+v, want all analytical capabilities disabled", readiness)
	}
	if len(readiness.Warnings) == 0 {
		t.Fatal("readiness without sales should explain that sales data is unavailable")
	}
}

func TestAnalysisReadinessWithPartialCostCoverageAllowsRevenueOnly(t *testing.T) {
	readiness := analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
		SalesItems:           10,
		MarginItems:          10,
		CostedMarginItems:    6,
		SoldMenus:            4,
		SoldMenusWithRecipes: 3,
	})

	if !readiness.CanAnalyzeRevenue || readiness.CanAnalyzeMargin || readiness.CanRecommendActions {
		t.Fatalf("partial readiness = %+v, want revenue only", readiness)
	}
	if readiness.MarginCostCoveragePercent != 60 || readiness.MenuRecipeCoveragePercent != 75 {
		t.Fatalf("partial coverage percentages = %.2f/%.2f, want 60/75", readiness.MarginCostCoveragePercent, readiness.MenuRecipeCoveragePercent)
	}
	if len(readiness.Warnings) != 2 {
		t.Fatalf("partial readiness warnings = %v, want cost and recipe warnings", readiness.Warnings)
	}
}

func TestAnalysisReadinessWithOnlyUnservedSalesDoesNotTreatMarginAsReady(t *testing.T) {
	readiness := analysisReadinessFromCoverage(repository.AIAnalysisCoverage{SalesItems: 5})

	if !readiness.HasSales || !readiness.CanAnalyzeRevenue || readiness.CanAnalyzeMargin || readiness.CanRecommendActions {
		t.Fatalf("unserved-sales readiness = %+v, want revenue without confirmed margin", readiness)
	}
	if readiness.MarginCostCoveragePercent != 0 {
		t.Fatalf("unserved-sales margin coverage = %.2f, want zero", readiness.MarginCostCoveragePercent)
	}
	if len(readiness.Warnings) != 1 || !strings.Contains(readiness.Warnings[0], "served sales") {
		t.Fatalf("unserved-sales warnings = %v, want served-sales limitation", readiness.Warnings)
	}
}

func TestAnalysisReadinessWithCompleteCoverageAllowsGuardedRecommendations(t *testing.T) {
	readiness := analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
		SalesItems:           25,
		MarginItems:          25,
		CostedMarginItems:    25,
		SoldMenus:            8,
		SoldMenusWithRecipes: 8,
	})

	if !readiness.CanAnalyzeRevenue || !readiness.CanAnalyzeMargin || !readiness.CanRecommendActions {
		t.Fatalf("complete readiness = %+v, want analytical capabilities enabled", readiness)
	}
	if len(readiness.Warnings) != 0 {
		t.Fatalf("complete readiness warnings = %v, want none", readiness.Warnings)
	}
}

func TestAnalyticalPromptMakesReadinessGuardrailsMandatory(t *testing.T) {
	prompt, err := analyticalPrompt("Should I increase prices?", nil, AISnapshot{
		AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
			SalesItems:        2,
			MarginItems:       2,
			CostedMarginItems: 1,
			SoldMenus:         1,
		}),
	})
	if err != nil {
		t.Fatalf("analyticalPrompt: %v", err)
	}

	for _, requirement := range []string{
		"analysis_readiness object is a mandatory reliability guardrail",
		"do not present profit or margin as confirmed",
		"do not recommend changing prices",
		"changes require the user to review and confirm",
		"Do not propose price changes",
		"Never describe a total cost or total profit as a per-unit value",
		`"can_analyze_margin": false`,
		// The analysis-window wording tracks analysisWindowDays (30), not a stale 14.
		"recent 30-day analysis window",
	} {
		if !strings.Contains(prompt, requirement) {
			t.Fatalf("analytical prompt is missing guardrail %q", requirement)
		}
	}
	if strings.Contains(prompt, "14-day") || strings.Contains(prompt, "14 days") {
		t.Fatalf("analytical prompt still hardcodes the old 14-day window")
	}
}

func TestLocalLowestMarginFactAnswerKeepsTotalsAndPerItemValuesSeparate(t *testing.T) {
	snapshot := AISnapshot{
		AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
			SalesItems:           20,
			MarginItems:          20,
			CostedMarginItems:    20,
			SoldMenus:            1,
			SoldMenusWithRecipes: 1,
		}),
		LowMarginMenus: []repository.AIMenuMarginSummary{{
			MenuName: "ข้าวผัดปู",
			Quantity: 20,
			Revenue:  1900,
			Cost:     1250,
			Profit:   650,
			Margin:   34.21,
		}},
	}

	answer, ok := localLowestMarginFactAnswer("เมนูไหนมี Margin ต่ำที่สุด", snapshot)
	if !ok {
		t.Fatal("lowest margin fact should use a deterministic local answer when margin data is ready")
	}
	for _, expected := range []string{"ต้นทุนรวม 1,250.00 บาท", "ต้นทุนเฉลี่ยต่อจาน 62.50 บาท", "กำไรเฉลี่ยต่อจาน 32.50 บาท"} {
		if !strings.Contains(answer, expected) {
			t.Fatalf("lowest margin answer is missing %q: %s", expected, answer)
		}
	}
	for _, unsolicited := range []string{"เพิ่มราคา", "โปรโมชั่น", "KPI", "วัตถุดิบทดแทน"} {
		if strings.Contains(answer, unsolicited) {
			t.Fatalf("lowest margin fact answer contains unsolicited decision %q: %s", unsolicited, answer)
		}
	}
}

func TestLocalAnalyticalGuardrailBlocksBusinessDecisionUntilDataComplete(t *testing.T) {
	partial := AISnapshot{AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
		SalesItems:           10,
		MarginItems:          10,
		CostedMarginItems:    5,
		SoldMenus:            2,
		SoldMenusWithRecipes: 1,
	})}

	answer, guarded := localAnalyticalGuardrailAnswer("Should I increase price for this menu?", partial)
	if !guarded || !strings.Contains(answer, "50%") {
		t.Fatalf("partial business-decision answer = %q, guarded=%t; want local coverage warning", answer, guarded)
	}
	if _, guarded := localAnalyticalGuardrailAnswer("Summarize revenue", partial); guarded {
		t.Fatal("revenue-only analysis should continue to the analytical model flow")
	}

	complete := AISnapshot{AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
		SalesItems:           10,
		MarginItems:          10,
		CostedMarginItems:    10,
		SoldMenus:            2,
		SoldMenusWithRecipes: 2,
	})}
	if _, guarded := localAnalyticalGuardrailAnswer("Should I increase price for this menu?", complete); guarded {
		t.Fatal("complete data should permit guarded recommendations through the analytical model flow")
	}
}
