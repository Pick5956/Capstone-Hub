package service

import "strings"

// Compound-question guard for the deterministic-first path.
//
// A single read-only tool answers exactly one concern. A popularity ranking
// ("get_top_selling_menus") knows how much each menu sells and nothing about the
// stock it burns or the profit it earns. When the user asks across two concerns
// in one breath — "ขายดีและกระทบสต็อกมากที่สุด" — answering only the popularity
// half reads as the assistant ignoring part of the question.
//
// Rather than build a two-dimensional tool for every pairing, the orchestrator
// detects this narrow case and lets the question fall through to the snapshot-
// wide LLM path, which sees sales, margins, and ingredient usage together and
// can weigh both. The trigger is deliberately narrow — only popularity ranking
// tools, only when stock or profit is also named — so ordinary single-concern
// questions keep their fast, exact deterministic answers.

// popularityRankingTools rank menus purely by how much they sell.
var popularityRankingTools = map[AIToolName]bool{
	AIToolGetTopSellingMenus:    true,
	AIToolGetMenuRevenueRanking: true,
	AIToolGetSlowMovingMenus:    true,
}

// stockConcernWords / marginConcernWords name a second dimension a popularity
// ranking cannot express.
var (
	stockConcernWords  = []string{"สต็อก", "สต๊อก", "สต็อค", "สต๊อค", "กระทบสต", "วัตถุดิบ", "คงเหลือ", "stock", "ingredient", "inventory"}
	marginConcernWords = []string{"กำไร", "margin", "มาร์จิ้น", "มาจิ้น", "ต้นทุน", "cost", "profit"}
)

// questionSpansUncoveredConcern is true when a popularity ranking was chosen but
// the question also asks about stock impact or profit — the signal to fall back
// to LLM synthesis over the full snapshot instead of a half answer.
func questionSpansUncoveredConcern(question string, tool AIToolName) bool {
	if !popularityRankingTools[tool] {
		return false
	}
	n := strings.ToLower(question)
	return containsAny(n, stockConcernWords...) || containsAny(n, marginConcernWords...)
}
