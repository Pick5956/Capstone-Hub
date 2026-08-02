package service

import (
	"strings"
	"testing"

	"Project-M/internal/repository"
)

func bridgeSnapshot() AISnapshot {
	return AISnapshot{
		AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
			SalesItems: 100, MarginItems: 100, CostedMarginItems: 100, SoldMenus: 4, SoldMenusWithRecipes: 4,
		}),
		MostExpensiveMenus: []repository.AIMenuPrice{
			{Name: "ต้มยำกุ้งน้ำข้น", Price: 139},
			{Name: "แกงเขียวหวานไก่", Price: 129},
			{Name: "ปีกไก่ทอดน้ำปลา", Price: 99},
		},
		TopMenuItems: []repository.AIMenuSummary{
			{MenuName: "ปีกไก่ทอดน้ำปลา", Quantity: 200, Revenue: 19800},
			{MenuName: "ต้มยำกุ้งน้ำข้น", Quantity: 120, Revenue: 16680},
		},
		TopMenusByRevenue: []repository.AIMenuSummary{
			{MenuName: "ปีกไก่ทอดน้ำปลา", Quantity: 200, Revenue: 19800},
			{MenuName: "ต้มยำกุ้งน้ำข้น", Quantity: 120, Revenue: 16680},
		},
		AllMenuMargins: []repository.AIMenuMarginSummary{
			{MenuName: "ปีกไก่ทอดน้ำปลา", Quantity: 200, Revenue: 19800, Cost: 7000, Margin: 64.6},
			{MenuName: "ต้มยำกุ้งน้ำข้น", Quantity: 120, Revenue: 16680, Cost: 7200, Margin: 56.8},
			{MenuName: "แกงเขียวหวานไก่", Quantity: 90, Revenue: 11610, Cost: 4950, Margin: 57.4},
		},
		IngredientUsage: []repository.AIIngredientUsage{
			{Name: "กุ้งสด", Unit: "กก.", Stock: 3, CostPerUnit: 200, Used: 40, Cost: 8000},
			{Name: "ข้าวสาร", Unit: "กก.", Stock: 5, CostPerUnit: 50, Used: 60, Cost: 3000},
			{Name: "กะทิ", Unit: "กล่อง", Stock: 50, CostPerUnit: 50, Used: 30, Cost: 1500},
			{Name: "พริกแกง", Unit: "กก.", Stock: 12, CostPerUnit: 100, Used: 0, Cost: 0},
		},
	}
}

// The exact field bug: the runner-up question must now name the SECOND menu.
func TestStructuredQueryAnswersRunnerUpPrice(t *testing.T) {
	answer, tool, ok := structuredQueryAnswer("แล้วเมนูไหนขายราคาแพงรองลงมา", bridgeSnapshot())
	if !ok {
		t.Fatal("runner-up price question should be handled by the structured path")
	}
	if !strings.Contains(answer, "แกงเขียวหวานไก่") {
		t.Fatalf("expected the second-most-expensive menu: %s", answer)
	}
	if strings.Contains(answer, "ต้มยำกุ้งน้ำข้น") {
		t.Fatalf("must not answer with the #1 menu: %s", answer)
	}
	if tool != AIToolGetMostExpensiveMenu {
		t.Fatalf("tool = %q, want %q (drives the frontend chips)", tool, AIToolGetMostExpensiveMenu)
	}
}

// Rank-1 questions must stay with the existing flow — this is what makes wiring
// the pilot in a no-regression change.
func TestStructuredQueryIgnoresRankOne(t *testing.T) {
	for _, q := range []string{
		"เมนูไหนแพงสุด",
		"เมนูไหนกำไรดีสุด",
		"เมนูไหนขายดีสุด",
		"วัตถุดิบอะไรกินต้นทุนเยอะสุด",
		"ยอดขายรวมเท่าไหร่",
	} {
		if _, _, ok := structuredQueryAnswer(q, bridgeSnapshot()); ok {
			t.Errorf("%q should be left to the existing tool flow", q)
		}
	}
}

func TestStructuredQueryRunnerUpMarginAndOrdinal(t *testing.T) {
	answer, tool, ok := structuredQueryAnswer("เมนูกำไรดีอันดับสอง", bridgeSnapshot())
	if !ok {
		t.Fatal("margin rank-2 should be handled")
	}
	// margins: ปีกไก่ 64.6 > แกงเขียวหวาน 57.4 > ต้มยำ 56.8  → #2 is แกงเขียวหวานไก่
	if !strings.Contains(answer, "แกงเขียวหวานไก่") {
		t.Fatalf("margin rank 2 wrong: %s", answer)
	}
	if tool != AIToolGetHighestMarginMenu {
		t.Fatalf("tool = %q, want highest-margin", tool)
	}

	third, _, ok := structuredQueryAnswer("เมนูราคาแพงอันดับที่ 3", bridgeSnapshot())
	if !ok || !strings.Contains(third, "ปีกไก่ทอดน้ำปลา") {
		t.Fatalf("price rank 3 wrong: ok=%v %s", ok, third)
	}
}

func TestStructuredQueryRunnerUpIngredient(t *testing.T) {
	answer, tool, ok := structuredQueryAnswer("วัตถุดิบต้นทุนแพงรองลงมา", bridgeSnapshot())
	if !ok {
		t.Fatal("ingredient cost rank-2 should be handled")
	}
	// costs: กุ้งสด 8000 > ข้าวสาร 3000 > กะทิ 1500 → #2 is ข้าวสาร
	if !strings.Contains(answer, "ข้าวสาร") {
		t.Fatalf("ingredient rank 2 wrong: %s", answer)
	}
	if tool != AIToolGetTopCostIngredients {
		t.Fatalf("tool = %q, want top-cost-ingredients", tool)
	}
}

// When the snapshot cannot rank a metric faithfully, the structured path must
// decline instead of inventing an answer from a truncated list.
func TestStructuredQueryDeclinesWhenDataCannotRank(t *testing.T) {
	// "cheapest price" — the snapshot only holds the most expensive menus.
	if _, _, ok := structuredQueryAnswer("เมนูราคาถูกอันดับสอง", bridgeSnapshot()); ok {
		t.Error("cheapest-price ranking must be declined (snapshot holds only top prices)")
	}
	// margin without cost coverage
	noMargin := bridgeSnapshot()
	noMargin.AnalysisReadiness = analysisReadinessFromCoverage(repository.AIAnalysisCoverage{SalesItems: 10})
	if _, _, ok := structuredQueryAnswer("เมนูกำไรดีอันดับสอง", noMargin); ok {
		t.Error("margin ranking must be declined when margin data is not ready")
	}
}
