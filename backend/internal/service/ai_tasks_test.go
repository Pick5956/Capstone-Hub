package service

import (
	"strings"
	"testing"

	"Project-M/internal/repository"
)

func TestResolveLocalTaskSeparatesConceptQuestionsFromRestaurantAnalysis(t *testing.T) {
	for _, question := range []string{
		"มาร์จิ้นคืออะไร",
		"Margin หมายถึงอะไร",
		"what is margin?",
	} {
		route, ok := resolveLocalTask(question)
		if !ok || route.Task != AITaskExplainConcept || route.Tool != "" {
			t.Fatalf("resolveLocalTask(%q) = %+v, %t; want explain_concept without a data tool", question, route, ok)
		}
	}
}

func TestConceptQuestionAnswersWithoutProviderOrSnapshot(t *testing.T) {
	svc := &AIService{}

	response, err := svc.AskOperations(1, &AIAskRequest{Question: "มาร์จิ้นคืออะไร"})
	if err != nil {
		t.Fatalf("AskOperations margin concept: %v", err)
	}
	if response.Intent != AIIntentChat || response.Task != AITaskExplainConcept || response.Model != "local-knowledge" {
		t.Fatalf("margin concept response route = intent %q, task %q, model %q", response.Intent, response.Task, response.Model)
	}
	if response.Snapshot.GeneratedAt != "" || len(response.Snapshot.LowMarginMenus) != 0 {
		t.Fatalf("margin concept loaded operational data unexpectedly: %+v", response.Snapshot)
	}
	for _, expected := range []string{"Margin", "รายได้", "ต้นทุน", "40%"} {
		if !strings.Contains(response.Answer, expected) {
			t.Fatalf("margin concept answer is missing %q: %s", expected, response.Answer)
		}
	}
	for _, unrelated := range []string{"สั่งซื้อ", "เพิ่มสต็อก", "มัสมั่น"} {
		if strings.Contains(response.Answer, unrelated) {
			t.Fatalf("margin concept answer contains unrelated action %q: %s", unrelated, response.Answer)
		}
	}
}

func TestGetGeminiToolsSchema(t *testing.T) {
	svc := &AIService{}
	tools := svc.getGeminiTools()
	if len(tools) == 0 || len(tools[0].FunctionDeclarations) != 4 {
		t.Fatalf("getGeminiTools returned invalid schema: %+v", tools)
	}
	expectedNames := map[string]bool{
		"get_lowest_margin_menu":    true,
		"get_low_stock_ingredients": true,
		"get_top_selling_menus":     true,
		"get_inventory_valuation":  true,
	}
	for _, decl := range tools[0].FunctionDeclarations {
		if !expectedNames[decl.Name] {
			t.Errorf("Unexpected tool name in Gemini schema: %s", decl.Name)
		}
		if decl.Parameters.Type != "OBJECT" {
			t.Errorf("Expected OBJECT type parameters in Gemini schema, got %s", decl.Parameters.Type)
		}
	}
}

func TestGetGroqToolsSchema(t *testing.T) {
	svc := &AIService{}
	tools := svc.getGroqTools()
	if len(tools) != 4 {
		t.Fatalf("getGroqTools returned invalid schema: %+v", tools)
	}
	expectedNames := map[string]bool{
		"get_lowest_margin_menu":    true,
		"get_low_stock_ingredients": true,
		"get_top_selling_menus":     true,
		"get_inventory_valuation":  true,
	}
	for _, tool := range tools {
		if tool.Type != "function" {
			t.Errorf("Expected tool type to be function, got %s", tool.Type)
		}
		if !expectedNames[tool.Function.Name] {
			t.Errorf("Unexpected tool name in Groq schema: %s", tool.Function.Name)
		}
		if tool.Function.Parameters.Type != "object" {
			t.Errorf("Expected object type parameters in Groq schema, got %s", tool.Function.Parameters.Type)
		}
	}
}

func TestLowestMarginToolFormatsValidatedAggregateAndAverageValues(t *testing.T) {
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

	result, err := executeReadOnlyTool(AIToolGetLowestMarginMenu, snapshot)
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	answer, ok := localToolAnswer(result)
	if !ok {
		t.Fatal("lowest-margin tool should produce an answer when validated data is available")
	}
	for _, expected := range []string{"ต้นทุนรวม 1250.00 บาท", "ต้นทุนเฉลี่ยต่อจาน 62.50 บาท", "กำไรเฉลี่ยต่อจาน 32.50 บาท"} {
		if !strings.Contains(answer, expected) {
			t.Fatalf("lowest margin answer is missing %q: %s", expected, answer)
		}
	}
}

func TestLowStockToolFormatsCorrectly(t *testing.T) {
	snapshot := AISnapshot{
		StockRisks: []AIStockRisk{
			{
				Name:            "ไข่ไก่",
				Status:          "low",
				Stock:           10.0,
				MinStock:        30.0,
				Unit:            "ฟอง",
				RestockEstimate: 50.0,
			},
			{
				Name:            "เนื้อหมู",
				Status:          "out",
				Stock:           0.0,
				MinStock:        5.0,
				Unit:            "กก.",
				RestockEstimate: 10.0,
			},
		},
	}
	result, err := executeReadOnlyTool(AIToolGetLowStockIngredients, snapshot)
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	answer, ok := localToolAnswer(result)
	if !ok {
		t.Fatal("low stock tool should produce an answer")
	}
	for _, expected := range []string{"ไข่ไก่", "ใกล้หมด ⚠️", "เนื้อหมู", "หมดสต็อก ❌", "แนะนำเติมเพิ่ม: **10.00** กก."} {
		if !strings.Contains(answer, expected) {
			t.Fatalf("low stock answer is missing %q: %s", expected, answer)
		}
	}
}

func TestTopSellingToolFormatsCorrectly(t *testing.T) {
	snapshot := AISnapshot{
		TopMenuItems: []repository.AIMenuSummary{
			{
				MenuName: "ข้าวผัดปู",
				Quantity: 50,
				Revenue:  4750.0,
			},
			{
				MenuName: "ต้มยำกุ้ง",
				Quantity: 20,
				Revenue:  3800.0,
			},
		},
	}
	result, err := executeReadOnlyTool(AIToolGetTopSellingMenus, snapshot)
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	answer, ok := localToolAnswer(result)
	if !ok {
		t.Fatal("top selling tool should produce an answer")
	}
	for _, expected := range []string{"1. **ข้าวผัดปู**", "50 จาน", "ราคาเฉลี่ย 95.00 บาท", "2. **ต้มยำกุ้ง**", "20 จาน"} {
		if !strings.Contains(answer, expected) {
			t.Fatalf("top selling answer is missing %q: %s", expected, answer)
		}
	}
}

func TestInventoryValuationToolFormatsCorrectly(t *testing.T) {
	snapshot := AISnapshot{
		InventorySummary: AIInventorySummary{
			TotalItems: 42,
			OutItems:   3,
			LowItems:   5,
			Value:      15450.50,
		},
	}
	result, err := executeReadOnlyTool(AIToolGetInventoryValuation, snapshot)
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	answer, ok := localToolAnswer(result)
	if !ok {
		t.Fatal("inventory valuation tool should produce an answer")
	}
	for _, expected := range []string{"จำนวนรายการวัตถุดิบทั้งหมด:** 42 รายการ", "วัตถุดิบที่หมดสต็อก:** 3 รายการ", "มูลค่าคลังสินค้ารวม:** **15450.50** บาท"} {
		if !strings.Contains(answer, expected) {
			t.Fatalf("inventory valuation answer is missing %q: %s", expected, answer)
		}
	}
}
