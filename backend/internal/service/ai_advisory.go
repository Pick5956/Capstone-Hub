package service

import (
	"fmt"
	"strings"
)

// Open-ended strategy advice ("จะเพิ่มกำไรยังไงดี", "ช่วงนี้ควรโฟกัสอะไร",
// "ควรทำโปรโมชั่นอะไรดี").
//
// These have no single tool, so they used to fall through to the LLM, which
// answered with generic textbook advice that named no real menu and cited no
// real number. This grounds the answer in the deterministic insights the shop
// already computes (low stock, sales moves, thin-margin best-sellers, dead
// stock) plus two levers read straight from the snapshot — so the advice points
// at this restaurant's actual menus and figures, not a generic list.

// isAdvisoryStrategyQuestion matches the open-ended asks that otherwise get
// generic advice. It deliberately excludes "how do I <use the app>" phrasings and
// anything a specific tool already answers (those never reach this point).
func isAdvisoryStrategyQuestion(question string) bool {
	n := strings.ToLower(strings.TrimSpace(question))
	return containsAny(n,
		"โฟกัสอะไร", "ควรโฟกัส", "โฟกัสเรื่องไหน",
		"เพิ่มกำไรยังไง", "เพิ่มกำไรอย่างไร", "เพิ่มกำไรไง", "ทำกำไรยังไง", "กำไรดีขึ้น",
		"เพิ่มยอดยังไง", "เพิ่มยอดขายยังไง", "เพิ่มรายได้ยังไง", "ยอดขายดีขึ้น",
		"ทำโปรโมชั่นอะไร", "โปรโมชั่นอะไร", "ควรทำโปร", "จัดโปรอะไร", "โปรอะไรดี",
		"ควรทำอะไรดี", "ทำอะไรดี", "ควรทำอะไรต่อ", "ควรเริ่มตรงไหน",
		"แนะนำอะไร", "มีอะไรแนะนำ", "ปรับปรุงอะไร", "ควรปรับปรุง")
}

func (s *AIService) answerStrategyAdvice(question string, snapshot AISnapshot) (*AIAskResponse, bool) {
	if !isAdvisoryStrategyQuestion(question) {
		return nil, false
	}

	var b strings.Builder
	b.WriteString("แนะนำจากข้อมูลจริงของร้านตอนนี้ครับ")

	// Lead with the profit/sales levers — they directly answer "เพิ่มกำไร/โปรโมชั่น"
	// and are read straight from the snapshot.
	levers := strategyLevers(snapshot)
	if len(levers) > 0 {
		b.WriteString("\n\nเพิ่มกำไร/ยอดขาย:")
		for _, l := range levers {
			b.WriteString("\n- " + l)
		}
	}

	// Then a short, severity-sorted list of urgent items to check (capped so a shop
	// low on many ingredients does not bury the advice under stock warnings).
	insights := computeProactiveInsights(snapshot)
	shown := 0
	for _, in := range insights {
		if shown >= 2 {
			break
		}
		if shown == 0 {
			b.WriteString("\n\nเรื่องเร่งด่วนที่ควรเช็คด้วยครับ:")
		}
		shown++
		b.WriteString(fmt.Sprintf("\n- %s (%s) — %s", in.Title, in.Metric, in.Detail))
	}

	// Nothing grounded to say → let the LLM try rather than emit an empty shell.
	if len(levers) == 0 && shown == 0 {
		return nil, false
	}

	b.WriteString("\n\n(อิงตัวเลขจริงจากข้อมูลร้าน ไม่ใช่การเดา)")
	return &AIAskResponse{
		Answer:   b.String(),
		Intent:   AIIntentAnalysis,
		Task:     AITaskRecommendAction,
		Model:    "local-strategy-advice",
		Snapshot: snapshot,
	}, true
}

// strategyLevers returns the always-available profit/sales levers: promote the
// best-seller, and fix the thinnest margin. Both come straight from snapshot rows.
func strategyLevers(snapshot AISnapshot) []string {
	var out []string
	if snapshot.AnalysisReadiness.CanAnalyzeRevenue && len(snapshot.TopMenuItems) > 0 {
		t := snapshot.TopMenuItems[0]
		out = append(out, fmt.Sprintf(
			"เมนูขายดีสุดคือ %s (%s จาน) — ต่อยอดด้วยเซ็ต/โปรโมชั่นจับคู่เพื่อดันยอด",
			t.MenuName, formatInt(t.Quantity)))
	}
	if snapshot.AnalysisReadiness.CanAnalyzeMargin && len(snapshot.AllMenuMargins) > 0 {
		low := snapshot.AllMenuMargins[0]
		for _, m := range snapshot.AllMenuMargins {
			if m.Margin < low.Margin {
				low = m
			}
		}
		out = append(out, fmt.Sprintf(
			"เมนูมาร์จิ้นต่ำสุดคือ %s (Margin %.1f%%) — ทบทวนต้นทุนหรือปรับราคาเพื่อเพิ่มกำไรรวม",
			low.MenuName, low.Margin))
	}
	return out
}
