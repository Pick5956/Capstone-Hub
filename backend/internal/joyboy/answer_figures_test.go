package joyboy

import (
	"strings"
	"testing"
)

// Every other rule in the answer prompt is about figures: where they may come
// from, how to format them, when to name the period. Asked "วันนี้กินอะไรดี" the
// model reached for menu tools — the only menu tools it has are commercial ones
// — and those rules then obliged it to quote profit at someone deciding what to
// have for dinner. This rule is the one that says figures are optional.
func TestTheAnswerPromptAllowsAnAnswerWithoutFigures(t *testing.T) {
	prompt := answerPrompt("วันนี้กินอะไรดี", nil, "", "rank=1 menu=ต้มยำกุ้งน้ำข้น qty=108")
	if !strings.Contains(prompt, "ก็ไม่ต้องยกตัวเลขพวกนั้นมาประกอบ") {
		t.Fatal("the rule releasing the model from quoting figures is missing")
	}
	// It must stay a permission, not a ban: a question about sales still needs
	// its numbers.
	if !strings.Contains(prompt, "ตัวเลขทุกตัวต้องมาจากข้อมูลด้านล่าง") {
		t.Fatal("the rule anchoring figures to the data was lost")
	}
}

// The thousand-separator rule failed twice as a plain statement of the right
// form, so it now carries two things a statement does not: the wrong form named
// outright, because "15 012" is what actually came out, and a pass over the
// figures before answering, because this is the one rule the model has to apply
// at every figure rather than once. Both parts are load-bearing; whoever tidies
// this rule down to one line is about to reintroduce round four.
func TestTheAnswerPromptPinsTheThousandSeparator(t *testing.T) {
	prompt := answerPrompt("ยอดขาย 7 วัน", nil, "", "period=7 วันล่าสุด\nrevenue=15012.00")
	for _, required := range []string{
		"คั่นหลักพันด้วยจุลภาคเท่านั้น",
		"ห้ามคั่นด้วยช่องว่าง",
		"15 012",
		"ไล่ดูตัวเลขทุกตัวที่เขียนไปอีกครั้ง",
	} {
		if !strings.Contains(prompt, required) {
			t.Fatalf("the thousand-separator rule lost %q", required)
		}
	}
}

// An overview question pulls four topics into the fact sheet and then, twice in
// round 10, wrote about only two of them — inventory value and low stock were
// fetched and silently dropped. The selection rule cannot fix this because it
// governs fetching, not saying, so the answer prompt carries the twin rule. It
// has to stay an exception to "don't list everything", or the two rules read as
// a contradiction and the model picks whichever it saw last.
func TestTheAnswerPromptRequiresEveryBlockOnAnOverview(t *testing.T) {
	prompt := answerPrompt("สรุปสถานการณ์ร้าน 30 วันล่าสุด", nil, "",
		"[get_inventory_valuation]\ntotal_value=6957.50")
	for _, want := range []string{
		"สรุปสถานการณ์ร้าน",
		"ร้านเป็นไงบ้าง",
		"ห้ามข้ามบล็อกไหนไป",
		"เว้นแต่คำถามขอภาพรวมของร้าน",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("the overview coverage rule lost %q", want)
		}
	}
	// The general "don't list everything" rule must survive alongside it, or a
	// focused question starts dumping the whole sheet again.
	if !strings.Contains(prompt, "ไม่ต้องไล่ให้ครบ") {
		t.Fatal("the rule that keeps focused answers focused was lost")
	}
}

// The ".00" rule left ".50" undefined, so 6957.50 came back as 6,957.50 one call
// and 6,958 the next — the model rounded when nothing told it not to. Whole-baht
// rounding cannot move into joyboyNum because that formatter also carries margins
// like 68.33 that need their fraction, so the rule lives in the prompt: keep any
// fraction that is not .00, do not round.
func TestTheAnswerPromptKeepsNonZeroFractions(t *testing.T) {
	prompt := answerPrompt("มูลค่าสต๊อกเท่าไหร่", nil, "", "total_value=6957.50")
	if !strings.Contains(prompt, "ถ้ามีเศษที่ไม่ใช่ .00 ให้เก็บไว้") {
		t.Fatal("the rule that keeps a non-zero fraction is missing")
	}
	if !strings.Contains(prompt, "ห้ามปัด") {
		t.Fatal("the no-rounding instruction was lost")
	}
	// The .00-stripping rule must survive alongside it, or whole numbers grow a
	// trailing .00 again.
	if !strings.Contains(prompt, "ตัด .00 ที่ไม่มีเศษทิ้ง") {
		t.Fatal("the .00-stripping rule was lost")
	}
}

// reconcileFigures treats the fact sheet as the dictionary of correct numbers.
// A figure that matches the source has its space separator turned into a comma —
// which resolves the "one number or two?" ambiguity a bare regex cannot: only a
// space run that reduces to a real source figure is joined. A figure that
// matches nothing is returned untouched and, if large, reported as a possible
// drift.
func TestReconcileFiguresNormalisesOnlyConfirmedFigures(t *testing.T) {
	sheet := "period=30 rank=1 menu=ต้มยำ qty=109 revenue=15151.00\ntotal_value=6957.50 orders=291"
	cases := []struct{ in, want string }{
		// "15 151" reduces to 15151, which is in the sheet → joined with a comma.
		{"ต้มยำ 109 จาน 15 151 บาท", "ต้มยำ 109 จาน 15,151 บาท"},
		// The decimal figure is confirmed; only the space becomes a comma, ".50" stays.
		{"มูลค่า 6 957.50 บาท", "มูลค่า 6,957.50 บาท"},
		// "5 คน" is not "5xxx" — the 3-digit group never forms, so it is left alone.
		{"มี 5 คน", "มี 5 คน"},
		// A space run that does not reduce to any source figure is left as written.
		{"ขาย 5 200 อย่าง", "ขาย 5 200 อย่าง"},
	}
	for _, c := range cases {
		got, _ := reconcileFigures(c.in, sheet)
		if got != c.want {
			t.Errorf("reconcileFigures(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// A large figure absent from the sheet is the drift signature; it is reported,
// not corrected, so a legitimate derived percentage is never overwritten.
func TestReconcileFiguresReportsDriftWithoutTouchingIt(t *testing.T) {
	sheet := "qty=96 revenue=9504.00"
	// 95 is not in the sheet: left as written, and (being under four digits) it
	// is not even reported — small numbers are usually derived, kept quiet.
	got, unmatched := reconcileFigures("ปีกไก่ 95 จาน", sheet)
	if got != "ปีกไก่ 95 จาน" {
		t.Fatalf("a non-matching figure was altered: %q", got)
	}
	if len(unmatched) != 0 {
		t.Fatalf("a small figure was reported and should not be: %v", unmatched)
	}
	// A four-digit figure absent from the sheet is reported (possible drift) but
	// still left untouched.
	got, unmatched = reconcileFigures("รายได้ 9405 บาท", sheet)
	if got != "รายได้ 9405 บาท" {
		t.Fatalf("a reported figure was altered: %q", got)
	}
	if len(unmatched) != 1 || unmatched[0] != "9405" {
		t.Fatalf("drift figure not reported: %v", unmatched)
	}
}

// Round 18: "20 188" came back unfixed because the space was a narrow no-break
// space (U+202F), which answerFigure's [, ] class does not see — so reconcile
// read two numbers it could not confirm. cleanAnswer now folds the unicode space
// to a plain one first, and reconcile then commas the confirmed figure.
func TestUnicodeSpaceIsFoldedSoReconcileCanFix(t *testing.T) {
	cleaned := cleanAnswer("ยอดขาย 20\u202f188 บาท")
	if !strings.Contains(cleaned, "20 188") {
		t.Fatalf("unicode space not folded to ASCII: %q", cleaned)
	}
	fixed, _ := reconcileFigures(cleaned, "revenue=20188.00")
	if !strings.Contains(fixed, "20,188") {
		t.Fatalf("confirmed figure not normalised to a comma: %q", fixed)
	}
}

// The sales count has no stored unit, so the model defaults to "จาน" — wrong for
// a drink. cleanAnswer neutralises the classifier to "รายการ" right after a
// number, leaving a non-count "จาน" (จานเดียว, ต่อจาน) alone.
func TestPlateUnitBecomesNeutralAfterANumber(t *testing.T) {
	cases := []struct{ in, want string }{
		{"น้ำเปล่า 431 จาน", "น้ำเปล่า 431 รายการ"},
		{"ชาไทยเย็น **412** จาน", "ชาไทยเย็น **412** รายการ"},
		{"ต้มยำ 15 จาน วันนี้", "ต้มยำ 15 รายการ วันนี้"},
	}
	for _, c := range cases {
		if got := cleanAnswer(c.in); !strings.Contains(got, c.want) {
			t.Errorf("cleanAnswer(%q) = %q, want to contain %q", c.in, got, c.want)
		}
	}
	if got := cleanAnswer("เมนูอาหารจานเดียว"); !strings.Contains(got, "จานเดียว") {
		t.Errorf("a non-count จาน was wrongly replaced: %q", got)
	}
}
