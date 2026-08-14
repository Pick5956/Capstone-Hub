package service

import (
	"reflect"
	"testing"

	"Project-M/internal/repository"
)

func TestWeekdaysNamedIn(t *testing.T) {
	cases := []struct {
		q    string
		want []int
	}{
		{"เทียบวันจันทร์กับวันเสาร์", []int{1, 6}},
		{"เทียบจันทร์กับอาทิตย์", []int{1, 0}},
		{"ยอดวันศุกร์กับวันอังคารอันไหนดีกว่า", []int{5, 2}},
		{"compare monday and saturday", []int{1, 6}},
		{"ยอดขายวันนี้เท่าไหร่", nil},
		{"ยอดขายอาทิตย์นี้", nil},               // "week", not Sunday
		{"เทียบอาทิตย์นี้กับอาทิตย์ที่แล้ว", nil}, // week vs week, not a weekday
	}
	for _, c := range cases {
		if got := weekdaysNamedIn(c.q); !reflect.DeepEqual(got, c.want) {
			t.Errorf("weekdaysNamedIn(%q) = %v, want %v", c.q, got, c.want)
		}
	}
}

func TestHasCompareCue(t *testing.T) {
	for _, q := range []string{"อันไหนขายดีกว่า", "ต้มยำกับแกง", "เทียบ a และ b", "x หรือ y"} {
		if !hasCompareCue(q) {
			t.Errorf("%q should read as a comparison cue", q)
		}
	}
	for _, q := range []string{"ยอดขายวันนี้เท่าไหร่", "เมนูขายดีสุด"} {
		if hasCompareCue(q) {
			t.Errorf("%q must not read as a comparison", q)
		}
	}
}

func TestLongestCommonRunMatchesPartialMenuName(t *testing.T) {
	// A partial name in the question still matches the stored full name.
	if got := longestCommonRun("ต้มยำกุ้งกับชาไทยอันไหนขายดีกว่า", "ต้มยำกุ้งน้ำข้น"); got < 5 {
		t.Errorf("partial menu name should share a long run, got %d", got)
	}
	if got := longestCommonRun("ต้มยำกุ้งกับชาไทยอันไหนขายดีกว่า", "ชาไทยเย็น"); got < 5 {
		t.Errorf("second menu should also match, got %d", got)
	}
	// Unrelated names do not.
	if got := longestCommonRun("ต้มยำกุ้งกับชาไทย", "ข้าวผัดหมู"); got >= 5 {
		t.Errorf("unrelated menu should not match, got %d", got)
	}
}

func TestMenuCompareMetricAxis(t *testing.T) {
	a := repository.AIMenuMarginSummary{MenuName: "A", Quantity: 10, Revenue: 100, Profit: 40}
	c := repository.AIMenuMarginSummary{MenuName: "C", Quantity: 20, Revenue: 200, Profit: 80}
	if m, u, _, _ := menuCompareMetric("อันไหนขายดีกว่า", a, c); m != "ยอดขาย" || u != "จาน" {
		t.Errorf("default axis should be units sold, got %q/%q", m, u)
	}
	if m, u, _, _ := menuCompareMetric("อันไหนกำไรมากกว่า", a, c); m != "กำไร" || u != "บาท" {
		t.Errorf("profit axis expected, got %q/%q", m, u)
	}
}
