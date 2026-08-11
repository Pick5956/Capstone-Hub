package service

import "testing"

func TestKeywordBackstopTool(t *testing.T) {
	cases := map[string]AIToolName{
		"ควรสั่งวัตถุดิบอะไรเพิ่ม":   AIToolGetIngredientReorderForecast,
		"เมนูขายดีสุดคืออะไร":        AIToolGetTopSellingMenus,
		"เมนูไหนกำไรน้อยสุด":         AIToolGetLowestMarginMenu,
		"เมนูไหนกำไรดีสุด":           AIToolGetHighestMarginMenu,
		"เมนูอะไรแพงสุด":             AIToolGetMostExpensiveMenu,
		"วัตถุดิบอะไรใกล้หมด":        AIToolGetLowStockIngredients,
		"เมนูไหนขายไม่ค่อยดี":        AIToolGetSlowMovingMenus,
	}
	for q, want := range cases {
		if got, ok := keywordBackstopTool(q); !ok || got != want {
			t.Errorf("keywordBackstopTool(%q) = %q,%v; want %q", q, got, ok, want)
		}
	}
	// A genuinely vague question matches nothing → stays a clarification.
	if _, ok := keywordBackstopTool("ช่วยหน่อยสิ"); ok {
		t.Error("vague question must not match a keyword tool")
	}
}

// F-1: reorder questions must be recognised regardless of "ควร" phrasing, but a
// plain price-advice question must not be mistaken for one.
func TestIsReorderForecastQuestion(t *testing.T) {
	for _, q := range []string{"ควรสั่งวัตถุดิบอะไรเพิ่ม", "ควรเติมของอะไรบ้าง", "ต้องสั่งอะไรเพิ่มไหม", "what should I reorder"} {
		if !isReorderForecastQuestion(q) {
			t.Errorf("expected reorder question: %q", q)
		}
	}
	for _, q := range []string{"ควรขึ้นราคาเมนูนี้ไหม", "เมนูไหนขายดี", "ยอดขายเดือนนี้"} {
		if isReorderForecastQuestion(q) {
			t.Errorf("not a reorder question: %q", q)
		}
	}
}

func TestBackstopShouldApply(t *testing.T) {
	// Fires: unclear / low confidence / analytical-with-no-usable-tool.
	if !backstopShouldApply(AIRouterResult{Task: AITaskUnclear}) {
		t.Error("unclear should apply")
	}
	if !backstopShouldApply(AIRouterResult{Task: AITaskRetrieveFact, Confidence: 0.4, SuggestedTool: AIToolGetTopSellingMenus}) {
		t.Error("low confidence should apply")
	}
	if !backstopShouldApply(AIRouterResult{Task: AITaskAnalyzeData, Confidence: 0.9, SuggestedTool: ""}) {
		t.Error("analytical with no tool should apply")
	}
	// Does NOT fire: a confident, well-formed classification, or a safety/scope call.
	if backstopShouldApply(AIRouterResult{Task: AITaskRetrieveFact, Confidence: 0.9, SuggestedTool: AIToolGetTopSellingMenus}) {
		t.Error("confident tool classification must not be rescued")
	}
	if backstopShouldApply(AIRouterResult{Task: AITaskOutOfScope, Confidence: 0.9}) {
		t.Error("out-of-scope must not be rescued")
	}
	if backstopShouldApply(AIRouterResult{Task: AITaskRiskyAction, Confidence: 0.3}) {
		t.Error("risky action must not be rescued into a tool")
	}
}

// F-1: "ควรสั่งวัตถุดิบอะไรเพิ่ม" classified as analytical-with-no-tool must be
// rescued to the deterministic reorder tool (was leaking a raw "_stock" field).
func TestApplyKeywordBackstopRescuesReorder(t *testing.T) {
	in := AIRouterResult{Task: AITaskAnalyzeData, Confidence: 0.8, SuggestedTool: ""}
	out, ok := applyKeywordBackstop(in, "ควรสั่งวัตถุดิบอะไรเพิ่ม")
	if !ok {
		t.Fatal("reorder question should be rescued")
	}
	if out.Task != AITaskRetrieveFact || out.SuggestedTool != AIToolGetIngredientReorderForecast || !out.NeedsTool {
		t.Fatalf("rescue produced wrong route: %+v", out)
	}
}

// A confident, correct classification is returned untouched — the backstop must
// never hijack the happy path.
func TestApplyKeywordBackstopLeavesConfidentResult(t *testing.T) {
	in := AIRouterResult{Task: AITaskRetrieveFact, Confidence: 0.9, SuggestedTool: AIToolGetTopSellingMenus}
	out, ok := applyKeywordBackstop(in, "เมนูขายดีสุด")
	if ok {
		t.Fatalf("confident classification must not be overridden, got %+v", out)
	}
}
