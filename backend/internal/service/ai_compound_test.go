package service

import "testing"

func TestSplitCompoundQuestion(t *testing.T) {
	cases := []struct {
		q     string
		left  string
		right string
		ok    bool
	}{
		{"ยอดขายเท่าไหร่ แล้วเมนูไหนขายดีสุด", "ยอดขายเท่าไหร่", "เมนูไหนขายดีสุด", true},
		{"เมนูไหนกำไรดีสุด และเมนูไหนขายดีสุด", "เมนูไหนกำไรดีสุด", "เมนูไหนขายดีสุด", true},
		{"ยอดขายวันนี้เท่าไหร่", "", "", false},         // no connector
		{"แล้วอันที่สองล่ะ", "", "", false},             // follow-up, connector at start
		{"เมนูขายดีสุดเท่าไหร่แล้วราคา", "เมนูขายดีสุดเท่าไหร่", "ราคา", false}, // right too short (< 5 runes)
	}
	for _, c := range cases {
		l, r, ok := splitCompoundQuestion(c.q)
		if ok != c.ok {
			t.Errorf("%q: ok = %v, want %v", c.q, ok, c.ok)
			continue
		}
		if ok && (l != c.left || r != c.right) {
			t.Errorf("%q: got (%q, %q), want (%q, %q)", c.q, l, r, c.left, c.right)
		}
	}
}
