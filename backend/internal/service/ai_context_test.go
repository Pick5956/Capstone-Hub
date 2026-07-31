package service

import "testing"

func TestLooksContextDependent(t *testing.T) {
	dependent := []string{
		"แล้วอันที่สองล่ะ",
		"แล้วเดือนก่อนล่ะ",
		"ทำไม",
		"ทำไมยอดตก",
		"มันกำไรเท่าไหร่",
		"เอาอันนั้นมาดูหน่อย",
		"what about last month",
		"the second one?",
	}
	for _, q := range dependent {
		if !looksContextDependent(q) {
			t.Errorf("expected %q to be context-dependent", q)
		}
	}

	selfContained := []string{
		"เมนูไหนแพงสุด",
		"ยอดขายเดือนนี้เท่าไหร่",
		"วัตถุดิบอะไรใกล้หมด",
		"เมนูไหนกำไรน้อยสุด",
		"5 อันดับเมนูขายดี",
		"which dish has the best margin",
	}
	for _, q := range selfContained {
		if looksContextDependent(q) {
			t.Errorf("expected %q to be self-contained", q)
		}
	}
}

func TestCleanRewrite(t *testing.T) {
	cases := map[string]string{
		"\"ยอดขายเดือนก่อนเท่าไหร่\"":       "ยอดขายเดือนก่อนเท่าไหร่",
		"  เมนูราคาแพงอันดับสองคืออะไร  ":   "เมนูราคาแพงอันดับสองคืออะไร",
		"ยอดขายเดือนก่อนเท่าไหร่\nอธิบายเพิ่ม": "ยอดขายเดือนก่อนเท่าไหร่",
		"“เมนูไหนกำไรดีสุด”":                "เมนูไหนกำไรดีสุด",
	}
	for in, want := range cases {
		if got := cleanRewrite(in); got != want {
			t.Errorf("cleanRewrite(%q) = %q, want %q", in, got, want)
		}
	}
}

// resolveContextualQuestion must return the original question (no provider call)
// when there is no history or the question is already self-contained.
func TestResolveContextualQuestionShortCircuits(t *testing.T) {
	svc := ProvideAIService(nil)

	if got, rewritten := svc.resolveContextualQuestion("แล้วอันที่สองล่ะ", nil); got != "แล้วอันที่สองล่ะ" || rewritten {
		t.Errorf("no history should short-circuit: got=%q rewritten=%v", got, rewritten)
	}

	history := []AIConversationMessage{{Role: "user", Content: "เมนูไหนแพงสุด"}, {Role: "assistant", Content: "ต้มยำกุ้ง 139 บาท"}}
	if got, rewritten := svc.resolveContextualQuestion("เมนูไหนกำไรน้อยสุด", history); got != "เมนูไหนกำไรน้อยสุด" || rewritten {
		t.Errorf("self-contained question should short-circuit: got=%q rewritten=%v", got, rewritten)
	}
}
