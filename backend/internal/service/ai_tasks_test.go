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
		"get_inventory_valuation":   true,
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
		"get_inventory_valuation":   true,
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
	result := AIToolResult{
		Tool: AIToolGetLowestMarginMenu,
	}

	// Case 1: Exact matching numbers -> No correction notice
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
	if strings.Contains(finalAnswer, "หมายเหตุความถูกต้อง") {
		t.Fatalf("Expected no correction notice for exact matches, got: %s", finalAnswer)
	}

	// Case 2: Hallucinated numbers -> Append correction notice
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
	if !strings.Contains(finalAnswer2, "หมายเหตุความถูกต้อง") {
		t.Fatal("Expected correction notice for hallucinated cost and margin, but none found")
	}
	for _, expected := range []string{"เมนู ข้าวผัดปู", "ต้นทุน 1250.00", "Margin 34.21%"} {
		if !strings.Contains(finalAnswer2, expected) {
			t.Errorf("Expected correction to mention %q in response: %s", expected, finalAnswer2)
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
	}
	result := AIToolResult{
		Tool: AIToolGetLowStockIngredients,
	}

	// Mismatched count -> correction notice
	response := AIFinalJSONResponse{
		Answer: "มีสินค้าใกล้หมด 2 รายการ และหมดสต็อก 1 รายการ",
		Verify: AIVerifyPayload{
			LowStockCount:   2,
			OutOfStockCount: 1,
		},
	}
	finalAnswer := svc.validateAndIntercept(response, result, snapshot)
	if !strings.Contains(finalAnswer, "หมายเหตุความถูกต้อง") {
		t.Fatal("Expected correction notice for stock counts, but none found")
	}
	if !strings.Contains(finalAnswer, "วัตถุดิบใกล้หมด 5 รายการ, หมดสต็อก 3 รายการ") {
		t.Fatalf("Incorrect correction text: %s", finalAnswer)
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
		Tool: AIToolGetTopSellingMenus,
	}

	response := AIFinalJSONResponse{
		Answer: "เมนูขายดีอันดับหนึ่งคือ ข้าวผัดปู ขายได้ 50 จาน",
		Verify: AIVerifyPayload{
			TopMenuName:     "ข้าวผัดปู",
			TopMenuQuantity: 50,
		},
	}
	finalAnswer := svc.validateAndIntercept(response, result, snapshot)
	if !strings.Contains(finalAnswer, "หมายเหตุความถูกต้อง") {
		t.Fatal("Expected correction notice for top seller, but none found")
	}
	if !strings.Contains(finalAnswer, "ต้มยำกุ้ง ขายได้ 45 จาน") {
		t.Fatalf("Incorrect correction text: %s", finalAnswer)
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
		Tool: AIToolGetInventoryValuation,
	}

	response := AIFinalJSONResponse{
		Answer: "มูลค่าคลังสินค้ารวม 12000 บาท มีวัตถุดิบ 35 รายการ",
		Verify: AIVerifyPayload{
			TotalItems: 35,
			TotalValue: 12000.0,
		},
	}
	finalAnswer := svc.validateAndIntercept(response, result, snapshot)
	if !strings.Contains(finalAnswer, "หมายเหตุความถูกต้อง") {
		t.Fatal("Expected correction notice for valuation, but none found")
	}
	if !strings.Contains(finalAnswer, "ทั้งหมด 42 รายการ, มูลค่ารวม 15450.50 บาท") {
		t.Fatalf("Incorrect correction text: %s", finalAnswer)
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

	if res.Task != "restaurant_data" && res.Task != AITaskAnalyzeData {
		t.Errorf("Expected live router to map %q to restaurant_data or analyze_data, got %q", question, res.Task)
	}

	if !res.NeedsRestaurantData {
		t.Errorf("Expected NeedsRestaurantData to be true for analytical query, got false")
	}

	if res.NeedsTool && res.SuggestedTool != AIToolGetLowestMarginMenu {
		t.Errorf("Expected SuggestedTool to be get_lowest_margin_menu, got %q", res.SuggestedTool)
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

	question := "เมนูไหนมีกำไรน้อยสุดในร้าน"
	res, err := svc.classifyIntent(question)
	if err != nil {
		t.Fatalf("Ollama classifyIntent failed: %v", err)
	}

	t.Logf("Ollama Router Result: task=%s confidence=%.2f needs_data=%v tool=%s",
		res.Task, res.Confidence, res.NeedsRestaurantData, res.SuggestedTool)

	if res.Task == "" {
		t.Error("Expected a non-empty task from Ollama router")
	}
	if res.Confidence <= 0 {
		t.Error("Expected confidence > 0 from Ollama router")
	}
	if !res.NeedsRestaurantData {
		t.Errorf("Expected NeedsRestaurantData=true for %q, got false", question)
	}
}
