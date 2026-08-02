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

// structuredQueryAnswerForTest covers the simple case where the user's wording is
// already self-contained and there is no conversation to inherit from.
func structuredQueryAnswerForTest(question string, snapshot AISnapshot) (string, AIToolName, bool) {
	return structuredQueryAnswer(question, question, nil, snapshot)
}

// The exact field bug: the runner-up question must now name the SECOND menu.
func TestStructuredQueryAnswersRunnerUpPrice(t *testing.T) {
	answer, tool, ok := structuredQueryAnswerForTest("แล้วเมนูไหนขายราคาแพงรองลงมา", bridgeSnapshot())
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
		if _, _, ok := structuredQueryAnswerForTest(q, bridgeSnapshot()); ok {
			t.Errorf("%q should be left to the existing tool flow", q)
		}
	}
}

func TestStructuredQueryRunnerUpMarginAndOrdinal(t *testing.T) {
	answer, tool, ok := structuredQueryAnswerForTest("เมนูกำไรดีอันดับสอง", bridgeSnapshot())
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

	third, _, ok := structuredQueryAnswerForTest("เมนูราคาแพงอันดับที่ 3", bridgeSnapshot())
	if !ok || !strings.Contains(third, "ปีกไก่ทอดน้ำปลา") {
		t.Fatalf("price rank 3 wrong: ok=%v %s", ok, third)
	}
}

func TestStructuredQueryRunnerUpIngredient(t *testing.T) {
	answer, tool, ok := structuredQueryAnswerForTest("วัตถุดิบต้นทุนแพงรองลงมา", bridgeSnapshot())
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

// --- Real conversation the user reported: a rank-only follow-up -------------
//
// "เมนูไหนขายแพงที่สุดภายในร้านของเรา" → "อันดับรองลงมาล่ะครับ"
// The follow-up names no metric, so it must inherit "price/high" from the
// previous turn and answer with rank 2.

func priceConversation() []AIConversationMessage {
	return []AIConversationMessage{
		{Role: "user", Content: "เมนูไหนขายแพงที่สุดภายในร้านของเรา"},
		{Role: "assistant", Content: "เมนูที่ตั้งราคาสูงที่สุดคือ ต้มยำกุ้งน้ำข้น ราคา 139.00 บาทต่อจานครับ"},
	}
}

func TestStructuredQueryRankOnlyFollowUpInheritsSubject(t *testing.T) {
	for _, asked := range []string{"อันดับรองลงมาล่ะครับ", "อันดับรองลงมา", "แล้วอันดับสองล่ะ"} {
		answer, tool, ok := structuredQueryAnswer(asked, asked, priceConversation(), bridgeSnapshot())
		if !ok {
			t.Errorf("%q: rank-only follow-up should be handled", asked)
			continue
		}
		if !strings.Contains(answer, "แกงเขียวหวานไก่") {
			t.Errorf("%q: expected the #2 menu, got: %s", asked, answer)
		}
		if tool != AIToolGetMostExpensiveMenu {
			t.Errorf("%q: tool = %q, want most-expensive", asked, tool)
		}
	}
}

// Even if the context rewrite drops the ordinal and hands back the earlier
// question verbatim, the rank read from the user's own words must survive.
func TestStructuredQueryKeepsRankWhenRewriteDropsIt(t *testing.T) {
	rewritten := "เมนูไหนขายแพงที่สุดภายในร้านของเรา" // ordinal lost by the rewrite
	asked := "อันดับรองลงมาล่ะครับ"

	answer, _, ok := structuredQueryAnswer(rewritten, asked, priceConversation(), bridgeSnapshot())
	if !ok {
		t.Fatal("should still be handled using the rank from the user's wording")
	}
	if !strings.Contains(answer, "แกงเขียวหวานไก่") {
		t.Fatalf("expected the #2 menu despite the rewrite: %s", answer)
	}
}

// A rank-only follow-up after an ingredient question inherits that domain.
func TestStructuredQueryRankOnlyFollowUpIngredient(t *testing.T) {
	history := []AIConversationMessage{
		{Role: "user", Content: "วัตถุดิบอะไรกินต้นทุนเยอะสุด"},
		{Role: "assistant", Content: "วัตถุดิบที่กินต้นทุนมากที่สุดคือ กุ้งสด ครับ"},
	}
	answer, _, ok := structuredQueryAnswer("อันดับรองลงมา", "อันดับรองลงมา", history, bridgeSnapshot())
	if !ok {
		t.Fatal("ingredient rank follow-up should be handled")
	}
	if !strings.Contains(answer, "ข้าวสาร") {
		t.Fatalf("expected the #2 ingredient by cost: %s", answer)
	}
}

// Field bug #2: "แล้วอันดับ 40 ล่ะ" on a menu with only a few items used to fall
// through to the #1 answer. It must instead say how deep the ranking goes.
func TestStructuredQueryRankBeyondDataAnswersHonestly(t *testing.T) {
	asked := "แล้วอันดับ 40 ล่ะ"
	answer, _, ok := structuredQueryAnswer(asked, asked, priceConversation(), bridgeSnapshot())
	if !ok {
		t.Fatal("out-of-range rank must be handled (not fall through to the #1 tool)")
	}
	if strings.Contains(answer, "ต้มยำกุ้งน้ำข้น") {
		t.Fatalf("must not answer with the #1 menu: %s", answer)
	}
	// bridgeSnapshot has 3 priced menus → the honest ceiling is 3.
	if !strings.Contains(answer, "อันดับที่ 3") {
		t.Fatalf("should state the actual ranking depth (3): %s", answer)
	}
}

// Same guard when the rank arrives via the rewritten question instead.
func TestStructuredQueryRankBeyondDataViaRewrite(t *testing.T) {
	rewritten := "เมนูไหนที่ขายแพงที่สุดอันดับที่ 40 ภายในร้านของเรา"
	asked := "แล้วอันดับ 40 ล่ะ"
	answer, _, ok := structuredQueryAnswer(rewritten, asked, priceConversation(), bridgeSnapshot())
	if !ok {
		t.Fatal("out-of-range rank via rewrite must be handled")
	}
	if strings.Contains(answer, "ต้มยำกุ้งน้ำข้น") {
		t.Fatalf("must not answer with the #1 menu: %s", answer)
	}
}

// Without a conversation there is nothing to inherit, so it must decline rather
// than guess a subject.
func TestStructuredQueryRankOnlyWithoutHistoryDeclines(t *testing.T) {
	if _, _, ok := structuredQueryAnswer("อันดับรองลงมา", "อันดับรองลงมา", nil, bridgeSnapshot()); ok {
		t.Error("a rank-only question with no history must not be answered")
	}
}

// The clarify gate must stand aside for a resolvable rank follow-up, but stay in
// force for genuinely vague messages.
func TestHasStructuredRankFollowUp(t *testing.T) {
	conv := priceConversation()

	resolvable := []string{"อันดับรองลงมา", "อันดับรองลงมาล่ะครับ", "แล้วอันดับสองล่ะ", "อันดับที่ 3"}
	for _, q := range resolvable {
		if !hasStructuredRankFollowUp(q, q, conv) {
			t.Errorf("%q should be recognised as a resolvable rank follow-up", q)
		}
	}

	vague := []string{"เมนูไหนดีสุด", "ok", "แล้วไงต่อ", "สวัสดี"}
	for _, q := range vague {
		if hasStructuredRankFollowUp(q, q, conv) {
			t.Errorf("%q must still go through the clarify gate", q)
		}
	}

	// No history to inherit from → not resolvable, so the gate stays in force.
	if hasStructuredRankFollowUp("อันดับรองลงมา", "อันดับรองลงมา", nil) {
		t.Error("a rank follow-up with no history is not resolvable")
	}
}

// When the snapshot cannot rank a metric faithfully, the structured path must
// decline instead of inventing an answer from a truncated list.
func TestStructuredQueryDeclinesWhenDataCannotRank(t *testing.T) {
	// "cheapest price" — the snapshot only holds the most expensive menus.
	if _, _, ok := structuredQueryAnswerForTest("เมนูราคาถูกอันดับสอง", bridgeSnapshot()); ok {
		t.Error("cheapest-price ranking must be declined (snapshot holds only top prices)")
	}
	// margin without cost coverage
	noMargin := bridgeSnapshot()
	noMargin.AnalysisReadiness = analysisReadinessFromCoverage(repository.AIAnalysisCoverage{SalesItems: 10})
	if _, _, ok := structuredQueryAnswerForTest("เมนูกำไรดีอันดับสอง", noMargin); ok {
		t.Error("margin ranking must be declined when margin data is not ready")
	}
}
