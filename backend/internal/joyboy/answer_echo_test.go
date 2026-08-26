package joyboy

import (
	"strings"
	"testing"
)

// The model was shown figures written as key=value and answered the owner in
// exactly that shape — the same copying that made it echo legacy's bullets,
// only pointed at the new fact sheet. The prompt now forbids it; this catches
// what gets through anyway. The key goes, the figure stays.
func TestFactSheetKeysNeverReachTheOwner(t *testing.T) {
	cleaned := cleanAnswer("ยอดขายช่วง 7 วันล่าสุด\nperiod=7 วันล่าสุด\nrevenue=77,340.00 บาท\norders=291")
	for _, key := range []string{"period=", "revenue=", "orders="} {
		if strings.Contains(cleaned, key) {
			t.Fatalf("%s survived: %q", key, cleaned)
		}
	}
	for _, kept := range []string{"77,340.00", "291", "7 วันล่าสุด"} {
		if !strings.Contains(cleaned, kept) {
			t.Fatalf("stripping the key took %q with it: %q", kept, cleaned)
		}
	}
}

// An owner writing about a formula puts spaces around the equals sign. Only the
// glued-on form is a pasted key, so ordinary text has to survive.
func TestOrdinaryEqualsSignsSurvive(t *testing.T) {
	cleaned := cleanAnswer("กำไรขั้นต้น = รายได้ - ต้นทุน ครับ")
	if !strings.Contains(cleaned, "กำไรขั้นต้น = รายได้ - ต้นทุน") {
		t.Fatalf("a readable formula was mangled: %q", cleaned)
	}
}

// Asking for a polite ending produced "ครับครับ", and produced a lone "ครับ"
// sitting under a blank line where the answer had already ended.
func TestPolitenessIsNotDoubledOrLeftDangling(t *testing.T) {
	if got := cleanAnswer("สวัสดีครับ มีอะไรให้ช่วยได้บ้างครับครับ"); strings.Contains(got, "ครับครับ") {
		t.Fatalf("doubled politeness survived: %q", got)
	}

	got := cleanAnswer("เมนูขายดีคือต้มยำกุ้ง ขายได้ 109 จาน\n\nครับ")
	if strings.HasSuffix(got, "\nครับ") {
		t.Fatalf("a dangling politeness line survived: %q", got)
	}
	// The count classifier is neutralised to "รายการ" by cleanAnswer, and it must
	// survive the politeness guards intact.
	if !strings.Contains(got, "109 รายการ") {
		t.Fatalf("the answer was lost: %q", got)
	}
}

// Every guard runs on the same reply without any of them eating the answer.
func TestAnAnswerSurvivesEveryGuardAtOnce(t *testing.T) {
	cleaned := cleanAnswer("รายได้ revenue=15,151.00 บาท [get_top_selling_menus]\n\nครับ")
	for _, unwanted := range []string{"revenue=", "[get_top_selling_menus]"} {
		if strings.Contains(cleaned, unwanted) {
			t.Fatalf("%s survived: %q", unwanted, cleaned)
		}
	}
	if !strings.Contains(cleaned, "15,151.00") {
		t.Fatalf("the figure was lost: %q", cleaned)
	}
}
