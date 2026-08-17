package service

import "strings"

// Deterministic keyword backstop for the intent router.
//
// The whole system hangs on one LLM classification call. When that call hiccups
// — returns "unclear", low confidence, or an analytical intent with no usable
// tool — a crystal-clear question ("เมนูขายดีสุด") used to dead-end at "please
// rephrase" or fall to a free-form LLM answer. This maps a small set of
// unambiguous questions to a read-only tool in Go, so:
//   - a clear question never dead-ends when the model stumbles, and
//   - the answer is identical no matter which provider or key replied (routing
//     stops depending on model mood).
// It fires ONLY as a rescue (see backstopShouldApply), never overriding a
// confident classification or a risky/out-of-scope decision.

type keywordRule struct {
	tool     AIToolName
	keywords []string
}

// keywordRules are checked in order; the first whose keyword appears wins. More
// specific concerns come first so "กำไรน้อย" is not shadowed by a looser rule.
// Keywords are deliberately distinctive (e.g. "ขายดี", not bare "ขาย") to avoid
// matching unrelated text.
var keywordRules = []keywordRule{
	{AIToolGetIngredientReorderForecast, []string{"ควรสั่ง", "ควรเติม", "สั่งเพิ่ม", "สั่งของเพิ่ม", "ต้องเติมสต", "reorder", "restock"}},
	{AIToolGetDeadStock, []string{"ค้างสต", "ค้างสต๊อก", "ไม่ได้ใช้", "เงินจม", "dead stock"}},
	{AIToolGetLowStockIngredients, []string{"ใกล้หมด", "จะหมด", "สต็อกต่ำ", "สต๊อกต่ำ", "เหลือน้อย", "low stock", "ของหมด"}},
	{AIToolGetTopCostIngredients, []string{"ต้นทุนวัตถุดิบสูง", "วัตถุดิบต้นทุนสูง", "วัตถุดิบกินต้นทุน", "top cost ingredient"}},
	{AIToolGetLowestMarginMenu, []string{"กำไรน้อย", "กำไรต่ำ", "margin ต่ำ", "มาร์จิ้นต่ำ", "lowest margin"}},
	{AIToolGetHighestMarginMenu, []string{"กำไรดี", "กำไรสูง", "กำไรมาก", "margin สูง", "มาร์จิ้นสูง", "highest margin"}},
	{AIToolGetLowestCostMenu, []string{"ต้นทุนต่ำ", "ต้นทุนน้อย", "lowest cost"}},
	{AIToolGetMostExpensiveMenu, []string{"แพงสุด", "แพงที่สุด", "ราคาสูงสุด", "most expensive"}},
	{AIToolGetSlowMovingMenus, []string{"ขายไม่ดี", "ขายไม่ค่อยดี", "ขายไม่ออก", "ขายช้า", "slow moving"}},
	{AIToolGetTopSellingMenus, []string{"ขายดี", "ขายเยอะ", "ขายดีสุด", "นิยม", "เมนูฮิต", "best sell", "best-sell", "top selling"}},
	{AIToolGetInventoryValuation, []string{"มูลค่าสต", "มูลค่าคลัง", "inventory value"}},
	{AIToolGetPeakPeriods, []string{"ช่วงไหนคนเยอะ", "ช่วงพีค", "วันไหนขายดี", "peak"}},
	{AIToolGetAverageOrderValue, []string{"เฉลี่ยต่อบิล", "เฉลี่ยต่อออเดอร์", "average order"}},
}

// keywordBackstopTool returns a read-only tool for an unambiguous question, or
// ok=false when nothing matches.
func keywordBackstopTool(question string) (AIToolName, bool) {
	n := strings.ToLower(question)
	for _, rule := range keywordRules {
		if containsAny(n, rule.keywords...) {
			return rule.tool, true
		}
	}
	return "", false
}

// isRepriceQuestion recognises "which menu should I reprice" questions. The router
// tends to read them as a revenue ranking, but the useful answer is the thin-margin
// menu whose price or cost most needs attention.
func isRepriceQuestion(question string) bool {
	n := strings.ToLower(question)
	if !containsAny(n, "ปรับราคา", "ขึ้นราคา", "ตั้งราคาใหม่", "ราคาไม่เหมาะ", "ราคาเหมาะสม", "reprice") {
		return false
	}
	return containsAny(n, "เมนู", "จาน", "อะไร", "ตัวไหน", "อันไหน", "menu", "dish")
}

// isAddMenuQuestion recognises "what new menu should I add" questions. The store
// holds no data on menus it does not sell, so this cannot be answered directly —
// the honest reply grounds a suggestion in what already works instead of listing
// the current best-sellers as if they were the answer.
func isAddMenuQuestion(question string) bool {
	n := strings.ToLower(question)
	return containsAny(n, "เพิ่มเมนู", "ควรมีเมนู", "เมนูใหม่", "ออกเมนูใหม่", "เพิ่มรายการอาหาร", "add menu", "new menu", "new dish")
}

// isReorderForecastQuestion recognises "which ingredients should I reorder"
// questions. The word "ควร" makes the router classify them as a recommendation
// and sometimes pick the wrong tool, so they are intercepted and answered from
// the deterministic reorder-forecast tool regardless of the router's guess.
func isReorderForecastQuestion(question string) bool {
	n := strings.ToLower(question)
	return containsAny(n, "ควรสั่ง", "ควรเติม", "สั่งเพิ่ม", "สั่งของเพิ่ม", "ต้องสั่งอะไร", "เติมสต๊อก", "เติมสต็อก", "reorder", "restock")
}

// backstopShouldApply is true only when a data-retrieval classification failed
// to hand back a usable, confident tool. Safety (risky_action), scope
// (out_of_scope), advice (recommend_action), chat, and docs decisions are NEVER
// rescued into a fact tool, even at low confidence — the keyword net must not be
// able to turn a "delete the menu" command into a data lookup.
func backstopShouldApply(r AIRouterResult) bool {
	switch r.Task {
	case AITaskUnclear:
		// A clear metric keyword turns "please rephrase" into a real answer.
		return true
	case AITaskAnalyzeData, AITaskRetrieveFact:
		// Rescue a shaky route or an analytical intent with no usable tool (which
		// would otherwise fall to a non-deterministic free-form answer).
		return r.Confidence < 0.65 || !isSupportedReadOnlyTool(r.SuggestedTool)
	default:
		return false
	}
}

// applyKeywordBackstop rescues a failed classification with a deterministic
// keyword route, or returns the router result unchanged.
func applyKeywordBackstop(r AIRouterResult, question string) (AIRouterResult, bool) {
	if !backstopShouldApply(r) {
		return r, false
	}
	tool, ok := keywordBackstopTool(question)
	if !ok {
		return r, false
	}
	r.Task = AITaskRetrieveFact
	r.SuggestedTool = tool
	r.NeedsRestaurantData = true
	r.NeedsTool = true
	r.Risk = "low"
	if r.Confidence < 0.75 {
		r.Confidence = 0.75
	}
	return r, true
}
