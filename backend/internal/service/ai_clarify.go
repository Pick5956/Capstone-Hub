package service

import (
	"regexp"
	"strings"
)

// Deterministic ambiguity gate.
//
// LLM classifiers are overconfident: ask "which menu is best?" and the model
// happily returns 0.8 confidence for "top sellers" — a guess, not the answer the
// owner wanted. The keyword backstop makes it worse by bumping weak results up to
// a confident tool. So the confidence-based clarify gate almost never fires
// (measured clarify rate ~0%).
//
// This gate is the fix: a small set of *clearly* ambiguous question shapes are
// caught deterministically and answered with a question back ("which meaning did
// you mean?") instead of a guess. It is intentionally conservative — it must
// never nag on a question that is already specific, so every pattern also checks
// that the disambiguating word is absent.

// Words that already pin down which metric to rank by — their presence means the
// question is NOT ambiguous and must be left alone.
var clarifyMetricWords = []string{
	"ขาย", "กำไร", "margin", "มาร์จิ้น", "ต้นทุน", "cost", "ราคา", "price",
	"สั่ง", "reorder", "เติม", "สต๊อก", "สต็อก", "stock", "รายได้", "revenue",
	"คุ้ม", "นิยม", "popular", "เยอะ", "จำนวน", "ออเดอร์", "order", "ถูก", "แพง",
}

// A concrete subject makes an otherwise-vague request routable.
var clarifyDomainWords = []string{
	"ขาย", "ยอด", "รายได้", "revenue", "เมนู", "menu", "กำไร", "margin",
	"ต้นทุน", "cost", "สต๊อก", "สต็อก", "stock", "วัตถุดิบ", "คลัง", "inventory",
	"สั่ง", "reorder", "รายงาน", "report", "ลูกค้า", "ออเดอร์", "order",
	"ช่วง", "วัน", "เดือน", "สัปดาห์", "ปี",
}

var clarifyBestSubject = regexp.MustCompile(`(อันไหน|ตัวไหน|เมนูไหน|เมนูอะไร|อะไร)`)
var clarifyBestSuperlative = regexp.MustCompile(`ดี(ที่สุด|สุด)`)
var clarifyVagueVerb = regexp.MustCompile(`(ช่วยดู|ดูให้|ดูหน่อย|สรุปหน่อย|สรุปให้|เป็นไง|เป็นยังไง|เช็ก|เช็ค|ตรวจดู)`)

func clarifyContainsAny(s string, words []string) bool {
	for _, w := range words {
		if strings.Contains(s, w) {
			return true
		}
	}
	return false
}

// detectAmbiguousQuestion returns a clarifying question (and ok=true) when the
// input matches a recognised ambiguous shape; otherwise ok=false and the caller
// proceeds to answer normally.
func detectAmbiguousQuestion(question string) (string, bool) {
	q := strings.ToLower(strings.TrimSpace(question))
	if q == "" {
		return "", false
	}

	// A) "which one is best?" with no metric to rank by.
	if clarifyBestSubject.MatchString(q) && clarifyBestSuperlative.MatchString(q) &&
		!clarifyContainsAny(q, clarifyMetricWords) {
		return `อยากรู้ว่า "ดีสุด" ในแง่ไหนครับ — เมนูขายดีสุด, กำไรดีสุด, หรือคุ้มต้นทุนสุด? บอกผมได้เลยครับ`, true
	}

	// B) A short, vague "take a look / how is it" with no subject to look at.
	if len([]rune(q)) <= 30 && clarifyVagueVerb.MatchString(q) &&
		!clarifyContainsAny(q, clarifyDomainWords) {
		return "รบกวนบอกอีกนิดครับ อยากให้ผมช่วยดูเรื่องอะไร — ยอดขาย, กำไรเมนู, หรือสต๊อกวัตถุดิบ?", true
	}

	return "", false
}

// A referential fragment ("อันดับล่ะ", "ทำไม", "รองลงมา") only makes sense as a
// follow-up. These prefixes point back at a previous turn.
var referentialFragmentPrefix = regexp.MustCompile(`^(แล้ว|ทำไม|เพราะอะไร|เพราะ|อันดับ|อันที่|ตัวที่|รองลงมา|อันแรก|อันสอง|อันถัดไป)`)

func hasAssistantHistory(history []AIConversationMessage) bool {
	for _, m := range history {
		if m.Role == "assistant" && strings.TrimSpace(m.Content) != "" {
			return true
		}
	}
	return false
}

// detectDanglingFragment catches a referential follow-up fragment that arrives
// with NO prior conversation to resolve it against — asking what it refers to
// instead of guessing. When there IS assistant history, it returns ok=false so
// the normal context resolver can rewrite the fragment into a full question.
func detectDanglingFragment(question string, history []AIConversationMessage) (string, bool) {
	if hasAssistantHistory(history) {
		return "", false // there is context to resolve against — not dangling
	}
	q := strings.ToLower(strings.TrimSpace(question))
	rc := len([]rune(q))
	if rc == 0 || rc > 20 {
		return "", false // only short, isolated fragments qualify
	}
	if clarifyContainsAny(q, clarifyDomainWords) {
		return "", false // a concrete subject is present → not a bare reference
	}
	if referentialFragmentPrefix.MatchString(q) {
		return "ดูเหมือนคุณถามต่อจากเรื่องก่อนหน้า แต่ตอนนี้ยังไม่มีบทสนทนาก่อนครับ — อยากถามเรื่องอะไร? เช่น เมนูขายดี, กำไรเมนู, หรือยอดขายครับ", true
	}
	return "", false
}
