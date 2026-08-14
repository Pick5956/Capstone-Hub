package service

import "strings"

// Compound questions ("ยอดขายเท่าไหร่ แล้วเมนูไหนขายดีสุด").
//
// The router picks one tool per question, so a two-part ask was answered for the
// first part only. This splits the question and answers each part from the same
// deterministic paths the rest of the system uses, so both halves get real
// numbers from the database.
//
// The rule is strict on purpose: it answers ONLY when every part resolves
// deterministically. If any part is uncertain it declines and lets the normal
// flow handle the question — a correct half-answer beats a confident wrong one.

// compoundConnectors join two questions in one sentence. "แล้ว" at the very start
// ("แล้วอันที่สองล่ะ") is a follow-up, not a compound, so a connector only counts
// when real text sits on both sides (enforced by the length check below).
var compoundConnectors = []string{" แล้ว", "แล้ว", " และ ", "และ"}

const compoundMinPartRunes = 5

// splitCompoundQuestion splits on the first connector that leaves a substantial
// question on both sides. It returns exactly two parts, or ok=false.
func splitCompoundQuestion(question string) (left, right string, ok bool) {
	n := strings.TrimSpace(question)
	for _, c := range compoundConnectors {
		idx := strings.Index(n, c)
		if idx <= 0 {
			continue
		}
		l := strings.TrimSpace(n[:idx])
		r := strings.TrimSpace(n[idx+len(c):])
		// A remnant "แล้ว" can survive when the connector matched without a space.
		r = strings.TrimSpace(strings.TrimPrefix(r, "แล้ว"))
		if len([]rune(l)) >= compoundMinPartRunes && len([]rune(r)) >= compoundMinPartRunes {
			return l, r, true
		}
	}
	return "", "", false
}

// answerCompoundQuestion answers a two-part question when — and only when — both
// parts resolve to deterministic answers.
func (s *AIService) answerCompoundQuestion(restaurantID uint, question string, snapshot AISnapshot) (*AIAskResponse, bool) {
	left, right, ok := splitCompoundQuestion(question)
	if !ok {
		return nil, false
	}
	leftAns, lok := s.resolveCompoundPart(restaurantID, left, snapshot)
	rightAns, rok := s.resolveCompoundPart(restaurantID, right, snapshot)
	if !lok || !rok {
		return nil, false // any uncertainty → let the normal flow answer
	}
	if leftAns == rightAns {
		return nil, false // both parts hit the same fact; no value in doubling it
	}

	return &AIAskResponse{
		Answer:   leftAns + "\n\n— — —\n\n" + rightAns,
		Intent:   AIIntentAnalysis,
		Task:     AITaskRetrieveFact,
		Model:    "local-compound",
		Snapshot: snapshot,
	}, true
}

// resolveCompoundPart answers one sub-question through the deterministic paths,
// most specific first. It returns ok=false when the part cannot be answered from
// data, which makes the whole compound decline rather than guess.
func (s *AIService) resolveCompoundPart(restaurantID uint, part string, snapshot AISnapshot) (string, bool) {
	part = strings.TrimSpace(part)
	if len([]rune(part)) < compoundMinPartRunes {
		return "", false
	}

	// Range-scoped aggregates that own their period parsing.
	if resp, handled, err := s.answerTotalProfitQuery(restaurantID, part); handled && err == nil {
		return resp.Answer, true
	}
	if resp, handled, err := s.answerTotalQuantityQuery(restaurantID, part); handled && err == nil {
		return resp.Answer, true
	}

	// Menu / ingredient / margin facts via the keyword backstop, run on the snapshot.
	if tool, ok := keywordBackstopTool(part); ok && isSupportedReadOnlyTool(tool) {
		if res, err := executeReadOnlyTool(tool, snapshot, part); err == nil {
			if ans, ok := localToolAnswer(res); ok {
				return ans, true
			}
		}
	}

	// Plain sales total ("ยอดขายเท่าไหร่").
	if containsAny(strings.ToLower(part), "ยอดขาย", "ยอดรวม", "รายได้รวม", "ขายรวม", "ยอดเท่าไหร่", "total sales") {
		if res, err := executeReadOnlyTool(AIToolGetSalesSummary, snapshot, part); err == nil {
			if ans, ok := localToolAnswer(res); ok {
				return ans, true
			}
		}
	}

	return "", false
}
