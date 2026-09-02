package service

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
)

// Measuring the question an owner asks before every decision he actually makes:
// "if I change this, what happens to the money?"
//
// What happened before the selection prompt learned what a supposition is:
//
//	"ถ้าลดราคาชาไทยลง 5 บาท กำไรจะเหลือเท่าไหร่"
//	  → "ผมยังไม่ได้ดึงข้อมูลต้นทุนมาคำนวณครับ"
//
// That answer is not wrong about itself. No tool ran, so the fact sheet was
// empty, so there was no cost to calculate from and the model said so. The
// failure happened one call earlier, when the model was asked which tools to use
// and answered [].
//
// Measured 2 Sep 2026, one run of twelve suppositions: no tool 8/12 before, 1/12
// after the rule was added; a checkable figure 4/12 before, 11/12 after. The
// remaining miss was "ไข่ไก่ขึ้นฟองละ 2 บาท เมนูไหนโดนหนักสุด", read by the
// command extractor as an order to set the egg cost — to 2 baht, which is not even
// what the sentence says. Figures and raw answers: Agent_testing/Joyboy/
// result_test_joyboy/2026-09-02-whatif-rate.md.
//
// Arithmetic is not the missing piece, which is why this file does not measure
// arithmetic on its own. get_menu_detail already returns price, cost_per_unit,
// profit_per_unit and margin_pct for a named menu (ai_joyboy_detail.go), and the
// answer prompt now allows working forward from those figures as long as the
// starting numbers are named (internal/joyboy/answer.go). Everything needed to
// answer sits behind a tool that never gets picked.
//
// The reason was in the selection prompt itself (internal/joyboy/tools.go),
// which ended with an unconditional rule:
//
//	"ถ้าเจ้าของ สั่งให้ทำอะไร — เปลี่ยน แก้ ลบ เพิ่ม ตั้งค่า ปิด เปิด จอง ย้าย —
//	 ให้ตอบ [] เสมอ"
//
// "ลดราคาชาไทยลง 5 บาท" is a price change in every word it uses. A rule that
// reads verbs cannot separate an order from a supposition, and the supposition
// is the more common thing an owner says out loud. The rule that now precedes it
// says a sentence asking what WOULD happen is a question, and names the detail
// tools it needs; the command extractor got the same distinction, because two of
// the baseline misses were not empty answers but confirmation cards. Both
// phrasings stay in the set — with "ถ้า" and without — so a regression in either
// direction shows up as a rate here rather than as a mobile-test anecdote.
//
//	AI_EVAL_ENABLED=1 AI_DB_EVAL_ENABLED=1 \
//	  go test ./internal/service/ -run TestWhatIf -v -timeout 90m
//
// Cost, at the default one run: fifteen questions at three calls each plus one
// judge call per answer is about sixty provider calls, and the judge's own
// self-check is eight more. One run is a first read rather than evidence — the
// danger suite next door explains why at length — so raise AI_WHATIF_RUNS when
// there is quota to spend, not before.

// whatIfQuestion is one question and what kind of question it is.
type whatIfQuestion struct {
	text string
	// hypothetical marks a question that supposes a change that has not happened.
	// For these the correct answer contains a figure that is by definition not in
	// the fact sheet, worked out from figures that are.
	//
	// The rest are ordinary questions about how things stand right now. They ride
	// along in the same run so that a change which teaches the assistant to
	// speculate everywhere shows up here as a regression instead of passing as a
	// win: an assistant that answers "ต้นทุนผัดไทยต่อจานเท่าไหร่" with a scenario
	// nobody asked for has not been fixed.
	hypothetical bool
}

// The menus and ingredients named here are the ones the shop actually has
// (restaurant_starter_seed.go): ชาไทยเย็น 49, ผัดไทยกุ้งสด 89, ต้มยำกุ้งน้ำข้น 139,
// ข้าวกะเพราไก่ไข่ดาว 79, ลาบหมู 95, ข้าวผัดปู 95, แกงเขียวหวานไก่ 129,
// ปีกไก่ทอดน้ำปลา 99. A question about a menu the shop does not sell would
// measure the name lookup instead of the thing being tested.
var whatIfQuestions = []whatIfQuestion{
	// Price down or up, then profit. The first line is the reported failure,
	// word for word.
	{text: "ถ้าลดราคาชาไทยเย็นลง 5 บาท กำไรจะเหลือเท่าไหร่", hypothetical: true},
	{text: "ขึ้นราคาต้มยำกุ้งน้ำข้นเป็น 149 กำไรต่อชามจะเพิ่มขึ้นเท่าไหร่", hypothetical: true},
	{text: "ถ้าผัดไทยกุ้งสดลดเหลือ 79 จะขาดทุนมั้ย", hypothetical: true},

	// Volume. The starting figure is per plate and the question is per month, so
	// answering means multiplying rather than just subtracting.
	{text: "ถ้าขายข้าวกะเพราไก่ไข่ดาวได้อีกวันละ 10 จาน เดือนนึงกำไรเพิ่มเท่าไหร่", hypothetical: true},
	{text: "สมมติเดือนนี้ขายลาบหมูได้อีก 50 จาน กำไรจะเป็นเท่าไหร่", hypothetical: true},

	// Ingredient cost going up. These need the other lookup tool as well, and the
	// units do not match the question — cost_per_unit for กุ้งสด is per gram while
	// the owner talks in kilos — so a right answer has to convert.
	{text: "ถ้ากุ้งสดขึ้นเป็นกิโลละ 400 ต้มยำกุ้งน้ำข้นจะเหลือกำไรเท่าไหร่", hypothetical: true},
	{text: "หมูสับขึ้นราคา 20% จะกระทบกำไรลาบหมูยังไง", hypothetical: true},
	{text: "ไข่ไก่ขึ้นฟองละ 2 บาท เมนูไหนโดนหนักสุด", hypothetical: true},

	// The same suppositions without the word "ถ้า". An owner deciding something
	// out loud rarely marks it as a hypothesis; he states the new number and asks
	// whether it is a good idea. These read the most like write commands, which is
	// exactly why they are here.
	{text: "ลดราคาชาไทยเย็นเหลือ 44 คุ้มมั้ย", hypothetical: true},
	{text: "ตั้งราคาแกงเขียวหวานไก่ 139 ดีมั้ย", hypothetical: true},
	{text: "ปีกไก่ทอดน้ำปลาลดเหลือ 89 ยังมีกำไรอยู่มั้ย", hypothetical: true},

	// Backwards: the target is given and the price is the unknown.
	{text: "อยากได้กำไรข้าวผัดปูจานละ 50 ต้องตั้งราคาเท่าไหร่", hypothetical: true},

	// Not suppositions. Every figure these ask for is already on the fact sheet,
	// so the right answer reads it out and stops.
	{text: "ชาไทยเย็นกำไรต่อแก้วเท่าไหร่", hypothetical: false},
	{text: "ต้นทุนผัดไทยกุ้งสดต่อจานเท่าไหร่", hypothetical: false},
	{text: "เดือนนี้ขายได้กี่บาท", hypothetical: false},
}

// The four verdicts are a ladder, and each rung is a different thing to fix.
//
//	NODATA — no figures at all. Today's failure: the tool was never picked.
//	PLAIN  — real figures, read out, the supposition ignored.
//	BARE   — the supposed figure, with nothing to check it against.
//	SHOWN  — the supposed figure and the figures it came from.
//
// SHOWN is the target for a hypothetical because the answer prompt demands it:
// "ห้ามตอบแค่ผลลัพธ์ลอย ๆ โดยไม่บอกที่มา". PLAIN is the target for the rest.
// BARE on a hypothetical is a half-fix worth seeing separately from NODATA,
// because a number an owner cannot check is a number he has to trust blindly.
const (
	whatIfNoData = "NODATA"
	whatIfPlain  = "PLAIN"
	whatIfBare   = "BARE"
	whatIfShown  = "SHOWN"
)

var whatIfVerdicts = []string{whatIfNoData, whatIfPlain, whatIfBare, whatIfShown}

// The judge is a separate model call rather than a search for digits, for the
// reason the danger suite gives: a word list cannot tell "the assistant stopped
// failing" from "the assistant started failing in words the list does not know".
// Here the trap is more specific. Every one of these answers contains numbers,
// including the broken ones — "ชาไทยเย็นราคา 49 บาทครับ" has a figure in it and
// answers nothing. What separates a right answer from a wrong one is whether a
// figure that is NOT in the shop's data appears and is traceable to ones that
// are, and no amount of matching on digits or on the word "ถ้า" decides that.
const whatIfJudgePrompt = `เจ้าของร้านถามคำถามหนึ่ง แล้วผู้ช่วย AI ตอบมาแบบข้างล่าง
อ่านคำตอบแล้วบอกว่าเข้าข่ายข้อไหน

ตอบ "NODATA" ถ้าคำตอบไม่มีตัวเลขของร้านเลย เพราะบอกว่าไม่มีข้อมูล ยังไม่ได้ดึงข้อมูล
ขอให้ผู้ใช้บอกตัวเลขมาก่อน ถามกลับ หรือเลี่ยงไปพูดเรื่องอื่น
เช่น "ผมยังไม่ได้ดึงข้อมูลต้นทุนมาคำนวณครับ" · "ขอทราบต้นทุนต่อแก้วก่อนนะครับ"

ตอบ "PLAIN" ถ้าคำตอบบอกตัวเลขที่เป็นอยู่จริงตอนนี้ตามตรง แต่ไม่ได้คิดต่อตามเงื่อนไขที่สมมติ
เช่น "ชาไทยเย็นราคา 49 บาท กำไรต่อแก้ว 31 บาทครับ" — เป็นการรายงานของจริง ไม่ได้คิดต่อ

ตอบ "BARE" ถ้าคำตอบบอก **ผลลัพธ์ของเงื่อนไขที่สมมติ** ออกมาเป็นตัวเลข
แต่ไม่ได้บอกว่าเอาตัวเลขไหนมาตั้งต้นคิด
เช่น "กำไรจะเหลือแก้วละ 26 บาทครับ"

ตอบ "SHOWN" ถ้าคำตอบบอกผลลัพธ์ของเงื่อนไขที่สมมติ **และ** บอกด้วยว่าตั้งต้นจากตัวเลขไหน
จนเจ้าของร้านคิดตามได้
เช่น "ตอนนี้กำไรต่อแก้ว 31 บาทครับ ถ้าลดราคาลง 5 บาท จะเหลือ 26 บาท"

ตอบคำเดียว: NODATA หรือ PLAIN หรือ BARE หรือ SHOWN

คำถามของเจ้าของร้าน:
%s

คำตอบของผู้ช่วย:
%s`

func whatIfRuns() int {
	if raw := strings.TrimSpace(os.Getenv("AI_WHATIF_RUNS")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			return n
		}
	}
	// One, unlike the danger suite's three, only because this script is twice the
	// length and the quota is shared with everything else being measured that day.
	return 1
}

// joyboyToolsFromModel reads the tool names back out of the model label.
//
// The obvious field is AIAskResponse.ToolsUsed, and on this path it is always
// empty: only the system-docs route fills it in (ai_system_docs.go). What the
// joyboy path does record is the list of tools that came back with data, packed
// into Model as "joyboy(get_menu_detail+get_sales_summary)" — see the response it
// builds in ai_joyboy_wiring.go. An empty selection leaves "joyboy()", and the
// stock-command path leaves a bare "joyboy" with no brackets at all, which is
// itself worth seeing: it means the turn was routed as a write instead of a
// question.
func joyboyToolsFromModel(model string) []string {
	open := strings.Index(model, "(")
	end := strings.LastIndex(model, ")")
	if open < 0 || end < open {
		return nil
	}
	inner := strings.TrimSpace(model[open+1 : end])
	if inner == "" {
		return nil
	}
	names := make([]string, 0, 4)
	for _, name := range strings.Split(inner, "+") {
		if name = strings.TrimSpace(name); name != "" {
			names = append(names, name)
		}
	}
	return names
}

// judgeWhatIfAnswer asks the model which rung of the ladder one answer reached.
func judgeWhatIfAnswer(t *testing.T, service *AIService, question, answer string) string {
	t.Helper()
	verdict, _, err := service.askSecondRoundWithOptions(
		fmt.Sprintf(whatIfJudgePrompt, strings.TrimSpace(question), strings.TrimSpace(answer)),
		aiProviderCompleteOptions{ReasoningEffort: "low"})
	if err != nil {
		t.Logf("      (ตัดสินไม่ได้: %v)", err)
		return "ERROR"
	}
	// The earliest label wins rather than the first one checked for, because a
	// model that restates the menu of choices before picking would otherwise be
	// read as having picked whichever option this code happened to test first.
	clean := strings.ToUpper(strings.TrimSpace(verdict))
	best, bestAt := "ERROR", -1
	for _, name := range whatIfVerdicts {
		at := strings.Index(clean, name)
		if at < 0 {
			continue
		}
		if bestAt < 0 || at < bestAt {
			best, bestAt = name, at
		}
	}
	return best
}

// The judge is checked before it is trusted, on answers whose rung nobody would
// argue about — two per verdict, written by hand rather than collected from a
// run, so that a judge which has drifted cannot be excused by the answers being
// borderline.
func TestWhatIfJudgeAgreesWithKnownCases(t *testing.T) {
	service, _ := liveConversationServiceOrSkip(t)

	cases := []struct {
		question string
		answer   string
		want     string
	}{
		{"ถ้าลดราคาชาไทยเย็นลง 5 บาท กำไรจะเหลือเท่าไหร่",
			"ผมยังไม่ได้ดึงข้อมูลต้นทุนมาคำนวณครับ", whatIfNoData},
		{"ถ้ากุ้งสดขึ้นเป็นกิโลละ 400 ต้มยำกุ้งน้ำข้นจะเหลือกำไรเท่าไหร่",
			"ขอทราบต้นทุนกุ้งสดต่อกิโลตอนนี้ก่อนได้มั้ยครับ ผมจะได้คิดให้ถูก", whatIfNoData},

		{"ชาไทยเย็นกำไรต่อแก้วเท่าไหร่",
			"ชาไทยเย็นราคาแก้วละ 49 บาท ต้นทุน 18 บาท กำไรต่อแก้ว 31 บาทครับ", whatIfPlain},
		{"ถ้าลดราคาชาไทยเย็นลง 5 บาท กำไรจะเหลือเท่าไหร่",
			"ตอนนี้ชาไทยเย็นขายแก้วละ 49 บาท กำไรต่อแก้ว 31 บาทครับ", whatIfPlain},

		{"ถ้าลดราคาชาไทยเย็นลง 5 บาท กำไรจะเหลือเท่าไหร่",
			"กำไรจะเหลือแก้วละ 26 บาทครับ", whatIfBare},
		{"ขึ้นราคาต้มยำกุ้งน้ำข้นเป็น 149 กำไรต่อชามจะเพิ่มขึ้นเท่าไหร่",
			"กำไรต่อชามจะเพิ่มขึ้น 10 บาทครับ", whatIfBare},

		{"ถ้าลดราคาชาไทยเย็นลง 5 บาท กำไรจะเหลือเท่าไหร่",
			"ตอนนี้กำไรต่อแก้ว 31 บาทครับ ถ้าลดราคาลง 5 บาท จะเหลือ 26 บาท", whatIfShown},
		{"สมมติเดือนนี้ขายลาบหมูได้อีก 50 จาน กำไรจะเป็นเท่าไหร่",
			"ลาบหมูกำไรจานละ 55 บาทครับ ขายเพิ่มอีก 50 จาน จะได้กำไรเพิ่ม 2,750 บาท", whatIfShown},
	}

	wrong := 0
	for _, c := range cases {
		got := judgeWhatIfAnswer(t, service, c.question, c.answer)
		mark := "ok"
		if got != c.want {
			mark, wrong = "ผิด", wrong+1
		}
		t.Logf("  %-4s ตัดสินว่า %-6s (ควรเป็น %s) — %s", mark, got, c.want, c.answer)
		sleepBetweenLiveQuestions()
	}
	// An instrument that disagrees with the cases nobody argues about cannot be
	// used to settle the cases people do.
	if wrong > 0 {
		t.Errorf("ตัวตัดสินผิด %d จาก %d เคสที่ชัดเจน — ยังใช้วัดไม่ได้", wrong, len(cases))
	}
}

// TestWhatIfArithmetic asks each question and reports, per question: which tools
// answered, whether the turn was diverted into a confirmation card, and which
// rung of the ladder the answer reached.
func TestWhatIfArithmetic(t *testing.T) {
	service, actor := liveConversationServiceOrSkip(t)
	runs := whatIfRuns()

	type tally struct {
		total   int
		noTools int // the tool selection came back empty — today's failure
		card    int // answered with a confirmation card instead of a number
		derived int // BARE or SHOWN: the supposed figure was actually worked out
		shown   int // SHOWN: and the figures behind it were named
	}
	results := make(map[string]*tally, len(whatIfQuestions))

	for _, question := range whatIfQuestions {
		results[question.text] = &tally{}
		for run := 1; run <= runs; run++ {
			// A fresh conversation every time, no thread carried forward. Sharing one
			// would let a later question be answered out of an earlier question's fact
			// sheet without selecting anything, and the tool selection is the entire
			// measurement here.
			response := askWithPatience(t, service, actor, question.text, "")
			answer := strings.TrimSpace(response.Answer)
			if answer == "" {
				t.Errorf("%q — คำตอบว่าง", question.text)
			}

			row := results[question.text]
			row.total++

			tools := joyboyToolsFromModel(response.Model)
			toolLabel := strings.Join(tools, ", ")
			if len(tools) == 0 {
				toolLabel = "ไม่เรียกเลย"
				row.noTools++
			}

			// A supposition that comes back as a confirmation card is its own kind of
			// wrong, and a worse one than an unanswered question: the owner asked what
			// would happen if he dropped the price and was handed a button that drops
			// it. It is counted apart from the verdict because the answer text beside
			// such a card can read perfectly well on its own.
			card := ""
			if response.ActionPreview != nil || response.ActionPlan != nil {
				card = " · ขึ้นกล่องยืนยันการแก้ข้อมูล"
				row.card++
			}

			verdict := judgeWhatIfAnswer(t, service, question.text, answer)
			// A figure worked out with no tool behind it is not a derived figure, it
			// is an invented one — the baseline run produced "สมมติว่าจานนึงได้กำไร
			// ประมาณสามสิบถึงสี่สิบบาท" over an empty fact sheet, and the judge, which
			// only sees the answer, rated it SHOWN. The judge cannot know what the
			// model was given; this tally can, and only a figure with data under it
			// counts.
			derived := len(tools) > 0 && (verdict == whatIfBare || verdict == whatIfShown)
			if derived {
				row.derived++
			}
			if derived && verdict == whatIfShown {
				row.shown++
			}

			// Flagged when the run went the wrong way for the kind of question it is:
			// a supposition that produced no figure, or an ordinary question that
			// produced a supposed one.
			flag := "  "
			if question.hypothetical && (verdict == whatIfNoData || len(tools) == 0) {
				flag = "!!"
			}
			if !question.hypothetical && (verdict == whatIfBare || verdict == whatIfShown) {
				flag = "!!"
			}

			kind := "สมมติ"
			if !question.hypothetical {
				kind = "ปกติ "
			}
			t.Logf("%s [%d/%d] (%s) %s\n      tool: %s%s\n      ตัดสิน: %s\n      ตอบ: %s",
				flag, run, runs, kind, question.text, toolLabel, card, verdict, answer)
			sleepBetweenLiveQuestions()
		}
	}

	var hypoTotal, hypoNoTools, hypoDerived, hypoShown, hypoCard int
	var plainTotal, plainDerived int

	t.Log("=== คำถามสมมติ · ไม่เรียก tool / คิดเลขออกมาได้ / บอกที่มาด้วย (จากกี่ครั้ง) ===")
	for _, question := range whatIfQuestions {
		row := results[question.text]
		if !question.hypothetical {
			plainTotal += row.total
			plainDerived += row.derived
			continue
		}
		hypoTotal += row.total
		hypoNoTools += row.noTools
		hypoDerived += row.derived
		hypoShown += row.shown
		hypoCard += row.card
		t.Logf("  ไม่เรียก %d · คิดได้ %d · บอกที่มา %d  (จาก %d)  %s",
			row.noTools, row.derived, row.shown, row.total, question.text)
	}

	t.Log("=== คำถามปกติ · คิดเลขสมมติทั้งที่ไม่ได้ถาม (จากกี่ครั้ง) ===")
	for _, question := range whatIfQuestions {
		if question.hypothetical {
			continue
		}
		row := results[question.text]
		t.Logf("  %d/%d  %s", row.derived, row.total, question.text)
	}

	if hypoTotal > 0 {
		t.Logf("สรุปคำถามสมมติ %d ครั้ง: ไม่เรียก tool %d (%.0f%%) · คิดเลขออกมาได้ %d (%.0f%%) · บอกที่มาด้วย %d (%.0f%%) · ขึ้นกล่องยืนยัน %d",
			hypoTotal,
			hypoNoTools, 100*float64(hypoNoTools)/float64(hypoTotal),
			hypoDerived, 100*float64(hypoDerived)/float64(hypoTotal),
			hypoShown, 100*float64(hypoShown)/float64(hypoTotal),
			hypoCard)
	}
	if plainTotal > 0 {
		t.Logf("สรุปคำถามปกติ %d ครั้ง: คิดเลขสมมติทั้งที่ไม่ได้ถาม %d", plainTotal, plainDerived)
	}

	// Reported rather than asserted at a threshold, because the point of the run
	// is the rate and a build that goes red on the first slip hides how the rate
	// is moving. Two outcomes are not rates, though, and both are failures:
	//
	// Nothing worked at all — the capability is absent rather than unreliable,
	// which is where this file starts and what a fix has to move off.
	if hypoTotal > 0 && hypoDerived == 0 {
		t.Errorf("ไม่มีคำถามสมมติข้อไหนคิดเลขออกมาได้เลยสักครั้ง (0 จาก %d) — ยังตอบคำถามแบบนี้ไม่ได้จริง ๆ",
			hypoTotal)
	}
	// Everything ordinary turned into speculation — the assistant did not learn to
	// answer "what if", it learned to answer everything as if it were one.
	if plainTotal > 0 && plainDerived == plainTotal {
		t.Errorf("คำถามปกติถูกตอบแบบสมมติทุกครั้ง (%d จาก %d) — over-trigger แล้ว",
			plainDerived, plainTotal)
	}
}
