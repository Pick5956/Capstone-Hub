package service

import (
	"strings"
	"testing"
)

func TestIsScopelessMetricQuestion(t *testing.T) {
	yes := []string{
		"ยอดขายเท่าไหร่",
		"กำไรเท่าไหร่",
		"ขายได้กี่จานทั้งหมด",
		"รายได้เท่าไหร่",
	}
	for _, q := range yes {
		if !isScopelessMetricQuestion(q) {
			t.Errorf("%q should be a scope-less metric question", q)
		}
	}
	no := []string{
		"ยอดขายวันนี้เท่าไหร่",     // has a scope
		"กำไรเดือนกรกฎาคมเท่าไหร่", // has a scope
		"ยอดขาย 7 วันล่าสุด",       // has a scope
		"เมนูไหนขายดีสุด",          // menu-scoped, not the store figure
		"ยอดขายเมนูต้มยำเท่าไหร่",   // one item, not the store figure
		"สวัสดีครับ",
	}
	for _, q := range no {
		if isScopelessMetricQuestion(q) {
			t.Errorf("%q must not be a scope-less metric question", q)
		}
	}
}

func TestAppendScopeHint(t *testing.T) {
	// Scope-less + today empty → names the empty day as the reason for the window.
	got, assumed := appendScopeHint("ยอดขายเท่าไหร่", "ยอดขายรวม 100 บาท", true)
	if !assumed {
		t.Fatal("scope-less question should report assumed=true")
	}
	if !strings.Contains(got, "วันนี้ยังไม่มีออเดอร์") || !strings.Contains(got, analysisWindowLabel()) {
		t.Fatalf("empty-today hint missing: %s", got)
	}
	// Scope-less, today has data → still offers to change the period.
	got, assumed = appendScopeHint("กำไรเท่าไหร่", "กำไร 50 บาท", false)
	if !assumed || !strings.Contains(got, "อยากดู") {
		t.Fatalf("default hint should invite a period change: %s (assumed=%v)", got, assumed)
	}
	// A scoped question is left untouched, and flags assumed=false.
	if got, assumed := appendScopeHint("ยอดขายวันนี้เท่าไหร่", "X", true); got != "X" || assumed {
		t.Fatalf("scoped question must not get a hint: %s (assumed=%v)", got, assumed)
	}
	// A non-metric question is left untouched.
	if got, assumed := appendScopeHint("เมนูไหนขายดีสุด", "X", true); got != "X" || assumed {
		t.Fatalf("non-metric question must not get a hint: %s (assumed=%v)", got, assumed)
	}
}
