package service

import (
	"strings"
	"testing"

	"Project-M/internal/repository"
)

// TestMostExpensiveAnswerHasNoIrrelevantSalesCaveat locks the exact class of bug
// we hit in the field: a pure price question ("เมนูไหนแพงสุด") must never carry a
// sales/readiness caveat. The snapshot deliberately has NO sales data — the free-
// form LLM used to bolt "ไม่มีข้อมูลการขาย 14 วัน" onto the price answer here; the
// deterministic tool answer must not.
func TestMostExpensiveAnswerHasNoIrrelevantSalesCaveat(t *testing.T) {
	snapshot := AISnapshot{
		AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{}), // no sales
		MostExpensiveMenus: []repository.AIMenuPrice{
			{Name: "ต้มยำกุ้งน้ำข้น", Price: 139},
			{Name: "แกงเขียวหวานไก่", Price: 129},
		},
	}
	result, err := executeReadOnlyTool(AIToolGetMostExpensiveMenu, snapshot)
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	answer, ok := localToolAnswer(result)
	if !ok {
		t.Fatal("most expensive menu should produce an answer")
	}
	for _, want := range []string{"ต้มยำกุ้งน้ำข้น", "139"} {
		if !strings.Contains(answer, want) {
			t.Fatalf("price answer missing %q: %s", want, answer)
		}
	}
	for _, forbidden := range []string{"ยอดขาย", "14 วัน", "ไม่มีข้อมูลการขาย", "วิเคราะห์ยอดขาย", "แนวโน้ม"} {
		if strings.Contains(answer, forbidden) {
			t.Fatalf("price answer must not drag in %q: %s", forbidden, answer)
		}
	}
}

// TestMostExpensiveMenuConciseByDefault: a singular price question answers with
// only the top item; a runner-up ranking appears only when a count is requested.
func TestMostExpensiveMenuConciseByDefault(t *testing.T) {
	snapshot := AISnapshot{MostExpensiveMenus: []repository.AIMenuPrice{
		{Name: "ต้มยำกุ้งน้ำข้น", Price: 139},
		{Name: "แกงเขียวหวานไก่", Price: 129},
		{Name: "ปีกไก่ทอดน้ำปลา", Price: 99},
	}}

	res, _ := executeReadOnlyTool(AIToolGetMostExpensiveMenu, snapshot, "เมนูไหนแพงสุด")
	ans, ok := localToolAnswer(res)
	if !ok {
		t.Fatal("expected an answer")
	}
	if !strings.Contains(ans, "ต้มยำกุ้งน้ำข้น") {
		t.Fatalf("missing top item: %s", ans)
	}
	if strings.Contains(ans, "อันดับถัดไป") || strings.Contains(ans, "แกงเขียวหวานไก่") {
		t.Fatalf("singular question should be concise (no runner-up list): %s", ans)
	}

	res2, _ := executeReadOnlyTool(AIToolGetMostExpensiveMenu, snapshot, "3 อันดับเมนูแพงสุด")
	ans2, _ := localToolAnswer(res2)
	if !strings.Contains(ans2, "อันดับถัดไป") || !strings.Contains(ans2, "แกงเขียวหวานไก่") {
		t.Fatalf("a count request should list runner-ups: %s", ans2)
	}
}

func TestFormatMoneyGroupsThousands(t *testing.T) {
	cases := map[float64]string{
		0:          "0.00",
		9.5:        "9.50",
		999:        "999.00",
		1000:       "1,000.00",
		12345.5:    "12,345.50",
		588804:     "588,804.00",
		3851244:    "3,851,244.00",
		-12345.5:   "-12,345.50",
		1234567.89: "1,234,567.89",
	}
	for in, want := range cases {
		if got := formatMoney(in); got != want {
			t.Errorf("formatMoney(%v) = %q, want %q", in, got, want)
		}
	}
}

// The window wording must be derived from the constant, so the data and the text
// can never disagree about which period a figure covers.
func TestAnalysisWindowLabelMatchesConstant(t *testing.T) {
	want := "30 วันล่าสุด"
	if analysisWindowDays != 30 {
		t.Fatalf("analysisWindowDays changed to %v — update this expectation and check every answer string", analysisWindowDays)
	}
	if got := analysisWindowLabel(); got != want {
		t.Errorf("analysisWindowLabel() = %q, want %q", got, want)
	}
}

// TestFactToolAnswersAreNonEmpty guards the deterministic-first path: every fact
// tool must return a presentable, non-empty answer from a populated snapshot, so
// AskOperations can safely skip the LLM for these.
func TestFactToolAnswersAreNonEmpty(t *testing.T) {
	snapshot := AISnapshot{
		AnalysisReadiness:  analysisReadinessFromCoverage(repository.AIAnalysisCoverage{SalesItems: 20}),
		SalesDays:          []repository.AISalesSummary{{OrderDate: "2026-07-20", Orders: 5, Revenue: 1500}},
		MostExpensiveMenus: []repository.AIMenuPrice{{Name: "ต้มยำกุ้ง", Price: 139}},
		TopMenuItems:       []repository.AIMenuSummary{{MenuName: "ผัดไทย", Quantity: 30, Revenue: 3000}},
		InventorySummary:   AIInventorySummary{TotalItems: 10, Value: 5000},
		StockRisks:         []AIStockRisk{{Name: "กุ้ง", Status: "low", Stock: 1, MinStock: 2, Unit: "กก.", RestockEstimate: 3}},
	}
	tools := []AIToolName{
		AIToolGetMostExpensiveMenu,
		AIToolGetInventoryValuation,
		AIToolGetLowStockIngredients,
		AIToolGetSalesSummary,
		AIToolGetTopSellingMenus,
	}
	for _, tool := range tools {
		result, err := executeReadOnlyTool(tool, snapshot, "")
		if err != nil {
			t.Fatalf("tool %s: %v", tool, err)
		}
		answer, ok := localToolAnswer(result)
		if !ok || strings.TrimSpace(answer) == "" {
			t.Fatalf("tool %s produced no presentable answer", tool)
		}
	}
}
