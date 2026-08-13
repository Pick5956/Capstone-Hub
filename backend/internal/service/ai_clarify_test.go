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

func TestDetectDanglingFragment(t *testing.T) {
	withHistory := []AIConversationMessage{
		{Role: "user", Content: "เมนูขายดีอันดับ 1"},
		{Role: "assistant", Content: "เมนูขายดีอันดับ 1 คือ ผัดกะเพรา ครับ"},
	}

	cases := []struct {
		name        string
		question    string
		history     []AIConversationMessage
		wantClarify bool
	}{
		// Referential fragment, NO history → ask what it refers to.
		{"rank fragment no history", "อันดับล่ะ", nil, true},
		{"why no history", "ทำไม", nil, true},
		{"next one no history", "รองลงมา", nil, true},
		{"second one no history", "แล้วอันที่สองล่ะ", nil, true},

		// Same fragment WITH assistant history → let the resolver handle it.
		{"rank fragment with history", "อันดับล่ะ", withHistory, false},
		{"why with history", "ทำไม", withHistory, false},

		// Clear/standalone questions → never treated as dangling.
		{"clear sales question", "ยอดขายวันนี้เท่าไหร่", nil, false},
		{"has subject", "อันดับขายดีของเมนู", nil, false},
		{"greeting", "สวัสดีครับ", nil, false},
		{"empty", "", nil, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg, ok := detectDanglingFragment(tc.question, tc.history)
			if ok != tc.wantClarify {
				t.Fatalf("detectDanglingFragment(%q, hist=%d) ok=%v, want %v (msg=%q)", tc.question, len(tc.history), ok, tc.wantClarify, msg)
			}
		})
	}
}
