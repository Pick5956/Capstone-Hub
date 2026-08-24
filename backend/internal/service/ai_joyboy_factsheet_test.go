package service

import (
	"strings"
	"testing"

	"Project-M/internal/repository"
)

// Every tool offered to the model must render. A tool without a case here would
// be selected, run, and then silently dropped from the fact sheet, which reads
// to the model as a tool that returns nothing — the hardest failure to notice,
// because the answer still arrives, just without the data that was asked for.
func TestEveryOfferedToolRendersAFactSheetBlock(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		if isJoyboyExtraTool(AIToolName(spec.Name)) {
			continue // joyboy-only tools render through their own path, tested separately
		}
		body, ok := joyboyFactBody(AIToolResult{Tool: AIToolName(spec.Name)})
		if !ok {
			t.Errorf("%s has no fact sheet rendering", spec.Name)
			continue
		}
		if strings.TrimSpace(body) == "" {
			t.Errorf("%s rendered an empty block", spec.Name)
		}
	}
}

// An empty result is a tool that ran and found nothing, which is not the same as
// a tool that failed. The reason travels with it so the model can say which.
func TestEmptyResultsCarryAReason(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		body, _ := joyboyFactBody(AIToolResult{Tool: AIToolName(spec.Name)})
		if !strings.Contains(body, "status=no_data") {
			continue
		}
		if !strings.Contains(body, "reason=") {
			t.Errorf("%s reports no data without saying why: %q", spec.Name, body)
		}
	}
}

// The whole point of this file is that the model receives figures rather than
// legacy's finished sentences. Thai politeness particles and emoji are the
// signature of a written answer, so their absence is the property to hold.
func TestFactSheetCarriesNoWrittenAnswer(t *testing.T) {
	results := []AIToolResult{
		{
			Tool: AIToolGetTopSellingMenus,
			TopSellingMenus: []repository.AIMenuSummary{
				{MenuName: "ต้มยำกุ้งน้ำข้น", Quantity: 109, Revenue: 15151},
			},
		},
		{
			Tool:              AIToolGetHighestMarginMenu,
			HighestMarginMenu: &repository.AIMenuMarginSummary{MenuName: "ข้าวกะเพราไก่ไข่ดาว", Quantity: 79, Revenue: 6241, Cost: 1881, Profit: 4360, Margin: 69.85},
		},
		{
			Tool:                AIToolGetLowStockIngredients,
			LowStockIngredients: []AIStockRisk{{Name: "ข้าวคั่ว", Status: "low", Stock: 40, MinStock: 100, Unit: "กรัม", RestockEstimate: 160}},
		},
		{
			Tool:               AIToolGetInventoryValuation,
			InventoryValuation: &AIInventorySummary{TotalItems: 30, LowItems: 4, Value: 12000},
		},
	}
	// "ครับ"/"ค่ะ" and the trend arrows are what legacy writes; a thumbs-up is
	// praise, which is an opinion the fact sheet has no business holding.
	forbidden := []string{"ครับ", "ค่ะ", "📈", "📉", "👍", "⚠️", "❌", "**"}

	for _, result := range results {
		body, ok := joyboyFactBody(result)
		if !ok {
			t.Fatalf("%s did not render", result.Tool)
		}
		for _, token := range forbidden {
			if strings.Contains(body, token) {
				t.Errorf("%s: fact sheet contains written-answer token %q\n%s", result.Tool, token, body)
			}
		}
	}
}

// Figures reach the model unformatted so that formatting stays the model's
// decision. A separator here would be copied through into the answer.
func TestFiguresCarryNoThousandsSeparator(t *testing.T) {
	body, _ := joyboyFactBody(AIToolResult{
		Tool:         AIToolGetSalesSummary,
		SalesSummary: &AISalesSummary{Days: 30, Orders: 308, Revenue: 82291},
	})
	if !strings.Contains(body, "revenue=82291.00") {
		t.Fatalf("revenue was reshaped before the model saw it: %q", body)
	}
}

// get_store_summary keeps only the count of at-risk ingredients, not their
// names. Saying so stops the model from reporting a bare number as though the
// names were left out for brevity.
func TestStoreSummaryAdmitsWhatItDoesNotCarry(t *testing.T) {
	body, _ := joyboyFactBody(AIToolResult{
		Tool:         AIToolGetStoreSummary,
		StoreSummary: &AIStoreSummary{Days: 30, Orders: 308, Revenue: 82291, LowStockCount: 4},
	})
	if !strings.Contains(body, "ingredients_below_minimum=4") {
		t.Fatalf("low stock count missing: %q", body)
	}
	if !strings.Contains(body, "get_low_stock_ingredients") {
		t.Fatalf("the summary does not point at the tool holding the names: %q", body)
	}
}
