package service

import "testing"

func TestIsTotalQuantityQuestion(t *testing.T) {
	yes := []string{
		"ขายได้กี่จานทั้งหมด",
		"เดือนนี้ขายไปกี่จาน",
		"จำนวนที่ขายทั้งหมดเท่าไหร่",
		"how many dishes did we sell",
	}
	for _, q := range yes {
		if !isTotalQuantityQuestion(q) {
			t.Errorf("%q should be a total-quantity question", q)
		}
	}

	no := []string{
		"เมนูไหนขายได้กี่จาน",   // per-menu
		"ยอดขายกี่บาท",          // baht, not dishes
		"ขายได้กี่ออเดอร์",       // orders, not dishes
		"เมนูไหนขายดีสุด",
	}
	for _, q := range no {
		if isTotalQuantityQuestion(q) {
			t.Errorf("%q must not be a total-quantity question", q)
		}
	}
}

func TestFormatInt(t *testing.T) {
	cases := map[int64]string{0: "0", 42: "42", 3500: "3,500", 1234567: "1,234,567", -8000: "-8,000"}
	for in, want := range cases {
		if got := formatInt(in); got != want {
			t.Errorf("formatInt(%d) = %q, want %q", in, got, want)
		}
	}
}
