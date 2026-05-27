package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

func newOllamaRouterTestService(t *testing.T, answers ...string) (*AIService, *int) {
	t.Helper()
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls >= len(answers) {
			t.Fatalf("received unexpected Ollama request %d", calls+1)
		}
		answer := answers[calls]
		calls++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"content": answer}}},
		})
	}))
	t.Cleanup(server.Close)
	t.Setenv("AI_PROVIDER", "ollama")
	t.Setenv("OLLAMA_BASE_URL", server.URL)
	t.Setenv("OLLAMA_MODEL", "test-ollama")
	t.Setenv("GROQ_API_KEYS", "")
	t.Setenv("GEMINI_API_KEYS", "")
	return &AIService{httpClient: server.Client()}, &calls
}

func TestAIRouterScopeQuestionUsesConversationFlowWithoutSnapshot(t *testing.T) {
	svc, calls := newOllamaRouterTestService(t,
		`{"task":"scope_question","confidence":0.97,"needs_restaurant_data":false,"needs_tool":false,"risk":"low","suggested_tool":""}`,
		"ผมเป็นผู้ช่วย AI ของระบบจัดการร้านอาหารครับ ช่วยดูยอดขาย สต๊อก เมนู และการใช้งานระบบได้ครับ",
	)

	response, err := svc.AskOperations(1, &AIAskRequest{Question: "คุณคือใคร"})
	if err != nil {
		t.Fatalf("AskOperations identity question: %v", err)
	}
	if response.Intent != AIIntentCapability || response.Task != AITaskScopeQuestion || response.Model != "test-ollama" {
		t.Fatalf("identity route = intent %q, task %q, model %q", response.Intent, response.Task, response.Model)
	}
	if response.Snapshot.GeneratedAt != "" || len(response.Snapshot.StockRisks) != 0 {
		t.Fatalf("identity question loaded operational data unexpectedly: %+v", response.Snapshot)
	}
	if *calls != 2 {
		t.Fatalf("identity question made %d Ollama requests, want router plus conversation response", *calls)
	}
}

func TestAIRouterOutOfScopeUsesConfiguredOllamaRefusal(t *testing.T) {
	svc, calls := newOllamaRouterTestService(t,
		`{"task":"out_of_scope","confidence":0.99,"needs_restaurant_data":false,"needs_tool":false,"risk":"low","suggested_tool":""}`,
		"เรื่องนี้อยู่นอกขอบเขตผู้ช่วยร้านอาหารครับ ผมช่วยดูยอดขายหรือคลังวัตถุดิบให้ได้ครับ",
	)

	response, err := svc.AskOperations(1, &AIAskRequest{Question: "ช่วยแต่งกลอนความรักให้หน่อย"})
	if err != nil {
		t.Fatalf("AskOperations out-of-scope request: %v", err)
	}
	if response.Intent != AIIntentOutOfScope || response.Task != AITaskOutOfScope || response.Model != "test-ollama" {
		t.Fatalf("out-of-scope route = intent %q, task %q, model %q", response.Intent, response.Task, response.Model)
	}
	if response.Snapshot.GeneratedAt != "" {
		t.Fatalf("out-of-scope request loaded operational data unexpectedly: %+v", response.Snapshot)
	}
	if *calls != 2 {
		t.Fatalf("out-of-scope request made %d Ollama requests, want router plus refusal response", *calls)
	}
}

func TestAIRouterMarginConceptUsesAuthoritativeDefinitionWithoutSnapshot(t *testing.T) {
	svc, calls := newOllamaRouterTestService(t,
		`{"task":"explain_concept","confidence":0.99,"needs_restaurant_data":false,"needs_tool":false,"risk":"low","suggested_tool":""}`,
	)

	response, err := svc.AskOperations(1, &AIAskRequest{Question: "มาร์จิ้นคืออะไร"})
	if err != nil {
		t.Fatalf("AskOperations margin concept: %v", err)
	}
	if response.Task != AITaskExplainConcept || response.Model != "local-concept-policy" {
		t.Fatalf("margin concept route = task %q model %q, want authoritative concept response", response.Task, response.Model)
	}
	if response.Snapshot.GeneratedAt != "" || !strings.Contains(response.Answer, "%") || !strings.Contains(response.Answer, "มาร์จิ้น") {
		t.Fatalf("margin concept answer/snapshot = %q / %+v", response.Answer, response.Snapshot)
	}
	if *calls != 1 {
		t.Fatalf("margin concept made %d Ollama requests, want router only", *calls)
	}
}

func TestSecondRoundUsesConfiguredOllamaProvider(t *testing.T) {
	svc, calls := newOllamaRouterTestService(t, `{"answer":"ผลจากข้อมูลจริงครับ","verify":{}}`)

	answer, model, err := svc.askSecondRoundWithRotation("second-round tool result prompt")
	if err != nil {
		t.Fatalf("askSecondRoundWithRotation with Ollama: %v", err)
	}
	if model != "test-ollama" || !strings.Contains(answer, "ผลจากข้อมูลจริง") {
		t.Fatalf("second round answer/model = %q/%q", answer, model)
	}
	if *calls != 1 {
		t.Fatalf("second round made %d requests, want one Ollama request", *calls)
	}
}

func TestOllamaRequestsDisableThinkingAndLimitContext(t *testing.T) {
	var requests []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode Ollama request: %v", err)
		}
		requests = append(requests, request)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"content": `{"task":"general_chat"}`}}},
		})
	}))
	t.Cleanup(server.Close)
	t.Setenv("OLLAMA_BASE_URL", server.URL)
	t.Setenv("OLLAMA_MODEL", "test-ollama")
	t.Setenv("OLLAMA_CONTEXT_LENGTH", "2048")

	svc := &AIService{httpClient: server.Client()}
	if _, err := svc.executeClassifierOllama("สวัสดี"); err != nil {
		t.Fatalf("executeClassifierOllama: %v", err)
	}
	if _, _, err := svc.executeOllamaConversation("สวัสดี", nil); err != nil {
		t.Fatalf("executeOllamaConversation: %v", err)
	}
	if _, _, err := svc.executeOllama("ยอดขายวันนี้", nil, AISnapshot{}); err != nil {
		t.Fatalf("executeOllama: %v", err)
	}
	if _, _, err := svc.executeSecondRoundOllama("tool result prompt"); err != nil {
		t.Fatalf("executeSecondRoundOllama: %v", err)
	}

	if len(requests) != 4 {
		t.Fatalf("captured %d Ollama requests, want 4", len(requests))
	}
	for i, request := range requests {
		think, ok := request["think"].(bool)
		if !ok || think {
			t.Fatalf("Ollama request %d think = %#v, want explicit false", i+1, request["think"])
		}
		options, ok := request["options"].(map[string]any)
		if !ok || options["num_ctx"] != float64(2048) {
			t.Fatalf("Ollama request %d options = %#v, want num_ctx 2048", i+1, request["options"])
		}
	}
}

func TestGetGeminiToolsSchema(t *testing.T) {
	svc := &AIService{}
	tools := svc.getGeminiTools()
	if len(tools) == 0 || len(tools[0].FunctionDeclarations) != 5 {
		t.Fatalf("getGeminiTools returned invalid schema: %+v", tools)
	}
	expectedNames := map[string]bool{
		"get_lowest_margin_menu":    true,
		"get_low_stock_ingredients": true,
		"get_top_selling_menus":     true,
		"get_inventory_valuation":   true,
		"get_sales_summary":         true,
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
	if len(tools) != 5 {
		t.Fatalf("getGroqTools returned invalid schema: %+v", tools)
	}
	expectedNames := map[string]bool{
		"get_lowest_margin_menu":    true,
		"get_low_stock_ingredients": true,
		"get_top_selling_menus":     true,
		"get_inventory_valuation":   true,
		"get_sales_summary":         true,
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

func TestSalesSummaryToolFormatsVerifiedTotal(t *testing.T) {
	snapshot := AISnapshot{
		SalesDays: []repository.AISalesSummary{
			{OrderDate: "2026-05-25", Orders: 3, Revenue: 1200},
			{OrderDate: "2026-05-26", Orders: 2, Revenue: 800.50},
		},
	}
	result, err := executeReadOnlyTool(AIToolGetSalesSummary, snapshot)
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	answer, ok := localToolAnswer(result)
	if !ok {
		t.Fatal("sales summary tool should produce an answer")
	}
	for _, expected := range []string{"2000.50 บาท", "5 ออเดอร์", "2 วัน"} {
		if !strings.Contains(answer, expected) {
			t.Fatalf("sales summary answer is missing %q: %s", expected, answer)
		}
	}
}

func TestCleanAndParseJSONResponse(t *testing.T) {
	rawMarkdown := "```json\n{\n  \"answer\": \"ทดสอบ\",\n  \"verify\": {\n    \"lowest_margin_menu_name\": \"ข้าวผัดปู\"\n  }\n}\n```"
	res, err := cleanAndParseJSONResponse(rawMarkdown)
	if err != nil {
		t.Fatalf("Failed to parse markdown wrapped JSON: %v", err)
	}
	if res.Answer != "ทดสอบ" || res.Verify.LowestMarginMenuName != "ข้าวผัดปู" {
		t.Fatalf("Incorrect parsed values: %+v", res)
	}

	rawClean := "{\n  \"answer\": \"ทดสอบที่สอง\",\n  \"verify\": {\n    \"quantity\": 12\n  }\n}"
	res2, err := cleanAndParseJSONResponse(rawClean)
	if err != nil {
		t.Fatalf("Failed to parse clean JSON: %v", err)
	}
	if res2.Answer != "ทดสอบที่สอง" || res2.Verify.Quantity != 12 {
		t.Fatalf("Incorrect parsed values: %+v", res2)
	}
}

func TestValidationInterceptorCorrectsLowestMarginHallucinations(t *testing.T) {
	svc := &AIService{}
	snapshot := AISnapshot{
		LowMarginMenus: []repository.AIMenuMarginSummary{{
			MenuName: "ข้าวผัดปู",
			Quantity: 20,
			Revenue:  1900.0,
			Cost:     1250.0,
			Profit:   650.0,
			Margin:   34.21,
		}},
	}
	lowest := snapshot.LowMarginMenus[0]
	result := AIToolResult{
		Tool:             AIToolGetLowestMarginMenu,
		LowestMarginMenu: &lowest,
	}

	// Even a matching model explanation is replaced by the authoritative
	// backend rendering for a fact tool.
	responseExact := AIFinalJSONResponse{
		Answer: "เมนูข้าวผัดปูขายดีที่สุดและมีมาร์จิ้นต่ำที่สุดที่ 34.21% มีต้นทุน 1250.00 บาท",
		Verify: AIVerifyPayload{
			LowestMarginMenuName: "ข้าวผัดปู",
			Quantity:             20,
			Revenue:              1900.0,
			Cost:                 1250.0,
			Profit:               650.0,
			Margin:               34.21,
		},
	}
	finalAnswer := svc.validateAndIntercept(responseExact, result, snapshot)
	if !strings.Contains(finalAnswer, "ต้นทุนเฉลี่ยต่อจาน 62.50 บาท") {
		t.Fatalf("Expected deterministic backend rendering for exact result, got: %s", finalAnswer)
	}

	// Hallucinated numbers never reach the user; backend tool facts replace them.
	responseHallucinated := AIFinalJSONResponse{
		Answer: "เมนูข้าวผัดปูขายดีที่สุดและมีมาร์จิ้นต่ำที่สุดที่ 45% มีต้นทุน 1500 บาท",
		Verify: AIVerifyPayload{
			LowestMarginMenuName: "ข้าวผัดปู",
			Quantity:             20,
			Revenue:              1900.0,
			Cost:                 1500.0, // Hallucinated cost
			Profit:               650.0,
			Margin:               45.0, // Hallucinated margin
		},
	}
	finalAnswer2 := svc.validateAndIntercept(responseHallucinated, result, snapshot)
	if strings.Contains(finalAnswer2, "1500") || strings.Contains(finalAnswer2, "45%") {
		t.Fatalf("Hallucinated numbers leaked into final tool answer: %s", finalAnswer2)
	}
	for _, expected := range []string{"ข้าวผัดปู", "ต้นทุนรวม 1250.00", "Margin 34.21%"} {
		if !strings.Contains(finalAnswer2, expected) {
			t.Errorf("Expected authoritative answer to mention %q: %s", expected, finalAnswer2)
		}
	}
}

func TestValidationInterceptorCorrectsLowStockHallucinations(t *testing.T) {
	svc := &AIService{}
	snapshot := AISnapshot{
		InventorySummary: AIInventorySummary{
			OutItems: 3,
			LowItems: 5,
		},
		StockRisks: []AIStockRisk{{
			Name: "ไข่ไก่", Status: "low", Stock: 2, MinStock: 10, Unit: "ฟอง", RestockEstimate: 8,
		}},
	}
	result := AIToolResult{
		Tool:                AIToolGetLowStockIngredients,
		LowStockIngredients: snapshot.StockRisks,
	}

	// Mismatched count -> deterministic tool rendering.
	response := AIFinalJSONResponse{
		Answer: "มีสินค้าใกล้หมด 2 รายการ และหมดสต็อก 1 รายการ",
		Verify: AIVerifyPayload{
			LowStockCount:   2,
			OutOfStockCount: 1,
		},
	}
	finalAnswer := svc.validateAndIntercept(response, result, snapshot)
	if strings.Contains(finalAnswer, "มีสินค้าใกล้หมด 2 รายการ") || !strings.Contains(finalAnswer, "ไข่ไก่") {
		t.Fatalf("Hallucinated low-stock answer was not replaced: %s", finalAnswer)
	}
}

func TestValidationInterceptorCorrectsTopSellingHallucinations(t *testing.T) {
	svc := &AIService{}
	snapshot := AISnapshot{
		TopMenuItems: []repository.AIMenuSummary{{
			MenuName: "ต้มยำกุ้ง",
			Quantity: 45,
		}},
	}
	result := AIToolResult{
		Tool:            AIToolGetTopSellingMenus,
		TopSellingMenus: snapshot.TopMenuItems,
	}

	response := AIFinalJSONResponse{
		Answer: "เมนูขายดีอันดับหนึ่งคือ ข้าวผัดปู ขายได้ 50 จาน",
		Verify: AIVerifyPayload{
			TopMenuName:     "ข้าวผัดปู",
			TopMenuQuantity: 50,
		},
	}
	finalAnswer := svc.validateAndIntercept(response, result, snapshot)
	if strings.Contains(finalAnswer, "ข้าวผัดปู") || !strings.Contains(finalAnswer, "ต้มยำกุ้ง") || !strings.Contains(finalAnswer, "45 จาน") {
		t.Fatalf("Hallucinated top seller was not replaced: %s", finalAnswer)
	}
}

func TestValidationInterceptorCorrectsInventoryValuationHallucinations(t *testing.T) {
	svc := &AIService{}
	snapshot := AISnapshot{
		InventorySummary: AIInventorySummary{
			TotalItems: 42,
			Value:      15450.50,
		},
	}
	result := AIToolResult{
		Tool:               AIToolGetInventoryValuation,
		InventoryValuation: &snapshot.InventorySummary,
	}

	response := AIFinalJSONResponse{
		Answer: "มูลค่าคลังสินค้ารวม 12000 บาท มีวัตถุดิบ 35 รายการ",
		Verify: AIVerifyPayload{
			TotalItems: 35,
			TotalValue: 12000.0,
		},
	}
	finalAnswer := svc.validateAndIntercept(response, result, snapshot)
	if strings.Contains(finalAnswer, "12000") || !strings.Contains(finalAnswer, "42 รายการ") || !strings.Contains(finalAnswer, "15450.50") {
		t.Fatalf("Hallucinated valuation was not replaced: %s", finalAnswer)
	}
}

func TestParseRouterJSON(t *testing.T) {
	cases := []struct {
		name     string
		raw      string
		wantTask AITask
		wantErr  bool
	}{
		{
			name:     "Clean JSON",
			raw:      `{"task": "general_chat", "confidence": 0.95, "needs_restaurant_data": false}`,
			wantTask: AITaskGeneralChat,
			wantErr:  false,
		},
		{
			name:     "Markdown Wrapped JSON",
			raw:      "```json\n{\n  \"task\": \"restaurant_content\",\n  \"confidence\": 0.88,\n  \"needs_restaurant_data\": false\n}\n```",
			wantTask: AITaskRestaurantContent,
			wantErr:  false,
		},
		{
			name:     "Invalid JSON",
			raw:      `{invalid-json}`,
			wantTask: "",
			wantErr:  true,
		},
		{
			name:     "Out of Scope JSON",
			raw:      `{"task": "out_of_scope", "confidence": 0.99, "needs_restaurant_data": false}`,
			wantTask: AITaskOutOfScope,
			wantErr:  false,
		},
		{
			name:     "Data Tool Normalizes To Retrieve Fact",
			raw:      `{"task":"restaurant_data","confidence":0.99,"needs_restaurant_data":true,"needs_tool":true,"risk":"low","suggested_tool":"get_lowest_margin_menu"}`,
			wantTask: AITaskRetrieveFact,
			wantErr:  false,
		},
		{
			name:    "Reject Unknown Task",
			raw:     `{"task":"delete_everything","confidence":0.99,"risk":"low"}`,
			wantErr: true,
		},
		{
			name:    "Reject Requested Unsupported Tool",
			raw:     `{"task":"restaurant_data","confidence":0.99,"needs_restaurant_data":true,"needs_tool":true,"risk":"low","suggested_tool":"drop_database"}`,
			wantErr: true,
		},
		{
			name:    "Reject Tool Requirement Without Tool",
			raw:     `{"task":"restaurant_data","confidence":0.99,"needs_restaurant_data":true,"needs_tool":true,"risk":"low","suggested_tool":""}`,
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := parseRouterJSON(tc.raw)
			if (err != nil) != tc.wantErr {
				t.Fatalf("parseRouterJSON() error = %v, wantErr %v", err, tc.wantErr)
			}
			if !tc.wantErr && res.Task != tc.wantTask {
				t.Fatalf("parseRouterJSON() res.Task = %q, want %q", res.Task, tc.wantTask)
			}
		})
	}
}

func TestLiveAITaskRouterIntegration(t *testing.T) {
	groqKey := strings.TrimSpace(os.Getenv("GROQ_API_KEYS"))
	geminiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEYS"))
	if groqKey == "" && geminiKey == "" {
		t.Skip("Skipping Live Task Router integration test: no API keys configured in environment")
	}

	svc := &AIService{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}

	question := "เมนูไหนมีกำไรน้อยสุดในร้าน"

	res, err := svc.classifyIntent(question)
	if err != nil {
		t.Fatalf("classifyIntent live API call failed: %v", err)
	}

	t.Logf("Live Router Result: %+v", res)

	if res.Task != AITaskRetrieveFact {
		t.Errorf("Expected live router to normalize %q to retrieve_fact, got %q", question, res.Task)
	}

	if !res.NeedsRestaurantData {
		t.Errorf("Expected NeedsRestaurantData to be true for analytical query, got false")
	}

	if !res.NeedsTool || res.SuggestedTool != AIToolGetLowestMarginMenu {
		t.Errorf("Expected lowest-margin fact to require get_lowest_margin_menu, got needsTool=%t tool=%q", res.NeedsTool, res.SuggestedTool)
	}
}

func TestLiveAITaskRouterOutOfScopeIntegration(t *testing.T) {
	groqKey := strings.TrimSpace(os.Getenv("GROQ_API_KEYS"))
	geminiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEYS"))
	if groqKey == "" && geminiKey == "" {
		t.Skip("Skipping Live Task Router Out of Scope integration test: no API keys configured")
	}

	svc := &AIService{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}

	question := "ช่วยแต่งกลอน 8 เกี่ยวกับความรักให้หน่อย"

	res, err := svc.classifyIntent(question)
	if err != nil {
		t.Fatalf("classifyIntent live API call failed: %v", err)
	}

	t.Logf("Live Out-of-Scope Router Result: %+v", res)

	if res.Task != AITaskOutOfScope {
		t.Errorf("Expected live router to map %q to out_of_scope, got %q", question, res.Task)
	}
}

func TestLiveOllamaRouterIntegration(t *testing.T) {
	ollamaURL := strings.TrimSpace(os.Getenv("OLLAMA_BASE_URL"))
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))
	if ollamaURL == "" || provider != "ollama" {
		t.Skip("Skipping Ollama integration test: set AI_PROVIDER=ollama and OLLAMA_BASE_URL to run")
	}

	svc := &AIService{
		httpClient: &http.Client{
			Timeout: 60 * time.Second, // Ollama on CPU can be slow
		},
	}

	cases := []struct {
		name     string
		question string
		tool     AIToolName
	}{
		{name: "lowest margin", question: "เมนูไหนมีกำไรน้อยสุดในร้าน", tool: AIToolGetLowestMarginMenu},
		{name: "low stock", question: "วัตถุดิบอะไรใกล้หมดบ้าง", tool: AIToolGetLowStockIngredients},
		{name: "top selling", question: "เมนูไหนขายดีที่สุด", tool: AIToolGetTopSellingMenus},
		{name: "inventory value", question: "มูลค่าคลังวัตถุดิบทั้งหมดเท่าไหร่", tool: AIToolGetInventoryValuation},
		{name: "sales summary", question: "ยอดขายรวมช่วง 14 วันล่าสุดเท่าไหร่", tool: AIToolGetSalesSummary},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := svc.classifyIntent(tc.question)
			if err != nil {
				t.Fatalf("Ollama classifyIntent failed: %v", err)
			}

			t.Logf("Ollama Router Result: task=%s confidence=%.2f needs_data=%v tool=%s",
				res.Task, res.Confidence, res.NeedsRestaurantData, res.SuggestedTool)

			if res.Task != AITaskRetrieveFact {
				t.Errorf("Expected Ollama to normalize %q to retrieve_fact, got %q", tc.question, res.Task)
			}
			if res.Confidence <= 0 || !res.NeedsRestaurantData {
				t.Errorf("Expected valid data route for %q, got confidence=%.2f needsData=%t", tc.question, res.Confidence, res.NeedsRestaurantData)
			}
			if !res.NeedsTool || res.SuggestedTool != tc.tool {
				t.Errorf("Expected Ollama to choose %q, got needsTool=%t tool=%q", tc.tool, res.NeedsTool, res.SuggestedTool)
			}
		})
	}
}
