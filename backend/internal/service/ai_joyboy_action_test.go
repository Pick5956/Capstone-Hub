package service

import "testing"

// The joyboy action path only ever proposes a preview the owner must confirm, but
// it must still tell an imperative command ("close this menu") apart from an
// analytical question ("which menu should I close") — the latter must be answered
// normally, never turned into a write. It must also pull the menu name out of
// natural Thai, politeness trailers and all.
func TestDetectMenuAvailabilityCommand(t *testing.T) {
	cases := []struct {
		q         string
		wantName  string
		wantAvail bool
		wantOK    bool
	}{
		{"ปิดขายเมนูต้มยำกุ้ง", "ต้มยำกุ้ง", false, true},
		{"เปิดขายกะเพรา", "กะเพรา", true, true},
		{"ช่วยปิดขายเมนู น้ำเปล่า ให้หน่อยครับ", "น้ำเปล่า", false, true},
		{"เปิดขายเมนูชาไทยเย็นด้วยค่ะ", "ชาไทยเย็น", true, true},
		{"งดขายผัดไทย", "ผัดไทย", false, true},
		// Questions must not be taken as commands.
		{"เมนูไหนควรปิดขาย", "", false, false},
		{"ทำไมต้องปิดขายเมนูนี้", "", false, false},
		{"ปิดขายเมนูไหนดี", "", false, false},
		{"ควรเปิดขายอะไรเพิ่ม", "", false, false},
		// Not a command at all.
		{"ยอดขายวันนี้เท่าไหร่", "", false, false},
		{"เมนูขายดีเดือนนี้", "", false, false},
	}
	for _, c := range cases {
		name, avail, ok := detectMenuAvailabilityCommand(c.q)
		if ok != c.wantOK {
			t.Errorf("%q: ok=%v want %v", c.q, ok, c.wantOK)
			continue
		}
		if !ok {
			continue
		}
		if name != c.wantName {
			t.Errorf("%q: name=%q want %q", c.q, name, c.wantName)
		}
		if avail != c.wantAvail {
			t.Errorf("%q: available=%v want %v", c.q, avail, c.wantAvail)
		}
	}
}
