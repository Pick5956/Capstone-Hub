package service

import "testing"

func TestDetectAmbiguousQuestion(t *testing.T) {
	cases := []struct {
		name       string
		question   string
		wantClarify bool
	}{
		// A) "which is best?" with no metric → clarify
		{"best menu no metric", "เมนูไหนดีสุด", true},
		{"best one superlative", "อันไหนดีที่สุด", true},
		{"which item best", "ตัวไหนดีสุดครับ", true},

		// A negative) a metric is named → answer, don't clarify
		{"best by sales", "เมนูไหนขายดีสุด", false},
		{"best by margin", "เมนูไหนกำไรดีสุด", false},
		{"best by margin explicit", "เมนูไหนดีสุดในแง่กำไร", false},
		{"cheapest", "วัตถุดิบไหนถูกสุด", false},

		// B) short vague request with no subject → clarify
		{"vague look", "ช่วยดูหน่อย", true},
		{"vague summarize", "สรุปหน่อย", true},
		{"vague how is it", "เป็นไงบ้าง", true},

		// B negative) a subject is present → answer, don't clarify
		{"look at sales", "ช่วยดูยอดขายหน่อย", false},
		{"summarize sales", "สรุปยอดขายหน่อย", false},
		{"check stock", "ช่วยดูสต๊อกหน่อย", false},

		// Clearly specific questions must never be caught.
		{"top sellers", "เมนูขายดี 5 อันดับ", false},
		{"store summary", "สรุปสถานการณ์ร้านวันนี้", false},
		{"sales amount", "ยอดขายเท่าไหร่", false},
		{"reorder", "พรุ่งนี้ควรเตรียมวัตถุดิบอะไรเพิ่ม", false},
		{"empty", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg, ok := detectAmbiguousQuestion(tc.question)
			if ok != tc.wantClarify {
				t.Fatalf("detectAmbiguousQuestion(%q) ok=%v, want %v (msg=%q)", tc.question, ok, tc.wantClarify, msg)
			}
			if ok && msg == "" {
				t.Fatalf("clarify triggered for %q but message is empty", tc.question)
			}
		})
	}
}
