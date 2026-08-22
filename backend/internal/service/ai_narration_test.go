package service

import (
	"strings"
	"testing"
)

const deterministicSample = "วัตถุดิบที่ควรจับตาสั่งเพิ่ม (เรียงจากใกล้หมดก่อน) ครับ:\n\n" +
	"- **กะเพรา**: เหลือ 0.00 กรัม ใช้เฉลี่ย 295.70 กรัม/วัน → พออีกประมาณ **0 วัน**\n" +
	"- **โซดา**: เหลือ 1950.00 มล. ใช้เฉลี่ย 1498.41 มล./วัน → พออีกประมาณ **1 วัน**\n"

func TestNarrationAcceptsSentenceWithoutNumbers(t *testing.T) {
	allowed := allowedNumbers(deterministicSample)
	if !narrationUsesOnlyKnownNumbers("พรุ่งนี้ควรเตรียมของสดเพิ่มนะครับ ตัวที่ใกล้หมดมีดังนี้", allowed) {
		t.Fatal("a sentence with no figures must be allowed")
	}
}

func TestNarrationAcceptsExactlyCopiedNumbers(t *testing.T) {
	allowed := allowedNumbers(deterministicSample)
	cases := []string{
		"กะเพราเหลือ 0.00 กรัม ต้องสั่งด่วนครับ",
		"โซดาเหลือ 1950.00 มล. พออีก 1 วันครับ",
		"โซดาเหลือ 1,950 มล. ครับ", // same figure, different formatting
	}
	for _, narration := range cases {
		if !narrationUsesOnlyKnownNumbers(narration, allowed) {
			t.Fatalf("expected %q to pass: every figure was copied from the data", narration)
		}
	}
}

// The failure this whole layer exists to prevent: a figure that was never computed.
func TestNarrationRejectsInventedNumber(t *testing.T) {
	allowed := allowedNumbers(deterministicSample)
	if narrationUsesOnlyKnownNumbers("ควรสั่งกะเพราเพิ่ม 5000 กรัมครับ", allowed) {
		t.Fatal("an invented quantity must be rejected")
	}
}

// Rounding is the subtle one: "ประมาณ 1500" reads fine but is not the number.
func TestNarrationRejectsRoundedNumber(t *testing.T) {
	allowed := allowedNumbers(deterministicSample)
	if narrationUsesOnlyKnownNumbers("โซดาใช้เฉลี่ยประมาณ 1500 มล./วันครับ", allowed) {
		t.Fatal("a rounded figure must be rejected — 1498.41 is not 1500")
	}
	if narrationUsesOnlyKnownNumbers("กะเพราใช้เฉลี่ย 296 กรัม/วันครับ", allowed) {
		t.Fatal("a rounded figure must be rejected — 295.70 is not 296")
	}
}

func TestNormalizeNumberTokenTreatsFormattingAsEqual(t *testing.T) {
	for _, pair := range [][2]string{
		{"1,950", "1950"},
		{"1950.00", "1950"},
		{"0.00", "0"},
		{"21.70", "21.7"},
	} {
		if normalizeNumberToken(pair[0]) != normalizeNumberToken(pair[1]) {
			t.Fatalf("expected %q and %q to compare equal", pair[0], pair[1])
		}
	}
	if normalizeNumberToken("21.71") == normalizeNumberToken("22") {
		t.Fatal("21.71 and 22 must stay different")
	}
}

func TestSanitizeNarrationStripsModelFormatting(t *testing.T) {
	if got := sanitizeNarration("  \"พรุ่งนี้เตรียมของสดเพิ่มนะครับ\"  "); got != "พรุ่งนี้เตรียมของสดเพิ่มนะครับ" {
		t.Fatalf("quotes and padding should be stripped, got %q", got)
	}
	if got := sanitizeNarration("- พรุ่งนี้เตรียมของสดเพิ่มครับ"); got != "พรุ่งนี้เตรียมของสดเพิ่มครับ" {
		t.Fatalf("a leading bullet should be stripped, got %q", got)
	}
	if got := sanitizeNarration("เกริ่นนำครับ\n\nรายการที่สอง"); got != "เกริ่นนำครับ" {
		t.Fatalf("only the lead paragraph should survive, got %q", got)
	}
	if sanitizeNarration("**สรุป**: ของใกล้หมด") != "" {
		t.Fatal("markdown means the format rules were ignored — discard it")
	}
	if sanitizeNarration(strings.Repeat("ก", maxNarrationRunes+1)) != "" {
		t.Fatal("an over-long narration should be discarded")
	}
	if sanitizeNarration("   ") != "" {
		t.Fatal("blank narration should be discarded")
	}
}

// With no provider configured the answer must come back untouched.
func TestNarrateFallsBackToDeterministicAnswer(t *testing.T) {
	t.Setenv("GROQ_API_KEYS", "")
	t.Setenv("GEMINI_API_KEYS", "")
	service := &AIService{}
	if got := service.narrateDeterministicAnswer("พรุ่งนี้เตรียมอะไร", deterministicSample, nil); got != deterministicSample {
		t.Fatal("expected the deterministic answer to be returned unchanged")
	}
}

func TestNarrationCanBeDisabled(t *testing.T) {
	t.Setenv("AI_NARRATION", "off")
	if narrationEnabled() {
		t.Fatal("AI_NARRATION=off must disable the extra provider call")
	}
	service := &AIService{}
	if got := service.narrateDeterministicAnswer("คำถาม", deterministicSample, nil); got != deterministicSample {
		t.Fatal("disabled narration must return the deterministic answer unchanged")
	}
}

// The observations handed to the model are computed by the same deterministic
// code as the answer, so quoting a figure out of them is allowed - that is what
// lets the narration say why a number matters instead of only introducing it.
func TestNarrationMayQuoteComputedObservations(t *testing.T) {
	observations := formatNarrationInsights([]AIInsight{{
		Title: "ยอดขายตก (7 วัน)", Metric: "-18%",
		Detail: "7 วันล่าสุด 12,400 บาท เทียบ 7 วันก่อนหน้า 15,100 บาท",
	}})
	if observations == "" {
		t.Fatal("an observation was dropped before it reached the model")
	}
	allowed := allowedNumbers(deterministicSample + " " + observations)

	if !narrationUsesOnlyKnownNumbers("ยอดขาย 7 วันล่าสุดลดลง 18% ครับ", allowed) {
		t.Fatal("a figure taken from the observations was rejected")
	}
	if narrationUsesOnlyKnownNumbers("ยอดขายลดลง 23% ครับ", allowed) {
		t.Fatal("an invented figure passed the lock")
	}
	if formatNarrationInsights(nil) != "" {
		t.Fatal("no observations must add nothing to the prompt")
	}
}
