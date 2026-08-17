package service

import (
	"strings"
	"testing"
)

func TestIsAdvisoryStrategyQuestion(t *testing.T) {
	yes := []string{
		"จะเพิ่มกำไรยังไงดี",
		"ช่วงนี้ควรโฟกัสอะไร",
		"ควรทำโปรโมชั่นอะไรดี",
		"มีอะไรแนะนำบ้าง",
		"ควรทำอะไรดี",
	}
	for _, q := range yes {
		if !isAdvisoryStrategyQuestion(q) {
			t.Errorf("%q should be an advisory strategy question", q)
		}
	}
	no := []string{
		"ยอดขายวันนี้เท่าไหร่",
		"เมนูไหนกำไรน้อยสุด",
		"ต้องสั่งของอะไรด่วน",
		"สั่งของยังไง", // app how-to, not strategy
	}
	for _, q := range no {
		if isAdvisoryStrategyQuestion(q) {
			t.Errorf("%q must not be an advisory strategy question", q)
		}
	}
}

// The advice must name a real menu and number from the snapshot, not generic text.
func TestStrategyAdviceIsGrounded(t *testing.T) {
	resp, ok := (&AIService{}).answerStrategyAdvice("จะเพิ่มกำไรยังไงดี", bridgeSnapshot())
	if !ok {
		t.Fatal("advisory question should be answered from grounded data")
	}
	if resp.Model != "local-strategy-advice" {
		t.Fatalf("model = %q, want local-strategy-advice", resp.Model)
	}
	// bridgeSnapshot: best-seller ปีกไก่ทอดน้ำปลา; thinnest margin ต้มยำกุ้งน้ำข้น (56.8%).
	if !strings.Contains(resp.Answer, "ปีกไก่ทอดน้ำปลา") {
		t.Fatalf("advice should promote the real best-seller: %s", resp.Answer)
	}
	if !strings.Contains(resp.Answer, "ต้มยำกุ้งน้ำข้น") {
		t.Fatalf("advice should flag the real thinnest-margin menu: %s", resp.Answer)
	}
}
