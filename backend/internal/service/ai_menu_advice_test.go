package service

import (
	"strings"
	"testing"
)

func TestIsRepriceQuestion(t *testing.T) {
	yes := []string{"เมนูไหนน่าปรับราคา", "ควรปรับราคาเมนูไหน", "เมนูอะไรควรขึ้นราคา"}
	for _, q := range yes {
		if !isRepriceQuestion(q) {
			t.Errorf("%q should be a reprice question", q)
		}
	}
	no := []string{
		"ยอดขายเท่าไหร่",
		"เมนูไหนขายดีสุด",
		"ปรับราคายังไงดี", // a how-to, names no menu subject
	}
	for _, q := range no {
		if isRepriceQuestion(q) {
			t.Errorf("%q must not be a reprice question", q)
		}
	}
}

func TestIsAddMenuQuestion(t *testing.T) {
	yes := []string{"ควรเพิ่มเมนูอะไร", "อยากได้เมนูใหม่", "ควรมีเมนูอะไรเพิ่ม"}
	for _, q := range yes {
		if !isAddMenuQuestion(q) {
			t.Errorf("%q should be an add-menu question", q)
		}
	}
	no := []string{"เมนูไหนขายดีสุด", "เพิ่มยอดขายยังไง"}
	for _, q := range no {
		if isAddMenuQuestion(q) {
			t.Errorf("%q must not be an add-menu question", q)
		}
	}
}

// The add-menu answer must admit it cannot know new menus, then ground the
// suggestion in a real best-seller — not just list current best-sellers.
func TestAddMenuAdviceIsHonestAndGrounded(t *testing.T) {
	answer, ok := (&AIService{}).answerAddMenuAdvice(bridgeSnapshot())
	if !ok {
		t.Fatal("add-menu advice should be produced from snapshot data")
	}
	if !strings.Contains(answer, "ให้ไม่ได้") {
		t.Fatalf("should admit the data limitation: %s", answer)
	}
	if !strings.Contains(answer, "ปีกไก่ทอดน้ำปลา") {
		t.Fatalf("should ground in the real best-seller: %s", answer)
	}
}
