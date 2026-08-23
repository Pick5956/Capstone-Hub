package service

// Compose mode moves the wording to the model and keeps the figures with Go.
// These tests pin the second half of that sentence, because the first half is
// the part that is easy to see and the second is the part that is easy to lose.

import (
	"strings"
	"testing"
)

const composeFactSheet = "เมนูที่ทำกำไรได้ดีที่สุด (Margin สูงสุด) คือ ข้าวกะเพราไก่ไข่ดาว ครับ\n\n" +
	"- ขายได้ 81 จาน\n- รายได้รวม 6,399.00 บาท\n- ต้นทุนรวม 1,929.42 บาท\n" +
	"- กำไรรวม 4,469.58 บาท\n- Margin 69.85%\n"

func composeService(t *testing.T, reply string) *AIService {
	t.Helper()
	return &AIService{providerAdapters: []aiProviderAdapter{
		&stubAIProviderAdapter{
			id: "groq", displayName: "Groq", configured: true,
			complete: func(string) (aiProviderAnswer, error) {
				return aiProviderAnswer{Text: reply, Model: "compose-model"}, nil
			},
		},
	}}
}

func TestComposedAnswerReplacesTheRenderedOne(t *testing.T) {
	t.Setenv("AI_ANSWER_MODE", "compose")
	written := "ข้าวกะเพราไก่ไข่ดาวทำกำไรดีที่สุดครับ กำไรรวม 4,469.58 บาท คิดเป็น Margin 69.85%"
	service := composeService(t, written)

	answer := service.narrateDeterministicAnswer("เมนูไหนกำไรดีสุด", composeFactSheet, nil)
	if answer != written {
		t.Fatalf("answer = %q, want only the composed text", answer)
	}
	// The whole point: the owner never sees the rendered version.
	if strings.Contains(answer, "- ขายได้ 81 จาน") {
		t.Fatal("the rendered template was shown alongside the composed answer")
	}
}

func TestComposedAnswerWithAnInventedFigureIsThrownAway(t *testing.T) {
	t.Setenv("AI_ANSWER_MODE", "compose")
	// 60% is the kind of figure a model adds from general knowledge: plausible,
	// authoritative, and about somebody else's restaurant.
	service := composeService(t, "Margin 69.85% ซึ่งสูงกว่าค่าเฉลี่ยร้านทั่วไปที่ 60% ครับ")

	answer := service.narrateDeterministicAnswer("เมนูไหนกำไรดีสุด", composeFactSheet, nil)
	if answer != composeFactSheet {
		t.Fatalf("answer = %q, want the rendered answer back", answer)
	}
}

func TestComposeModeIsOffUnlessAskedFor(t *testing.T) {
	t.Setenv("AI_ANSWER_MODE", "")
	t.Setenv("AI_NARRATION", "off")
	service := composeService(t, "ไม่ควรถูกเรียกใช้")

	if answer := service.narrateDeterministicAnswer("เมนูไหนกำไรดีสุด", composeFactSheet, nil); answer != composeFactSheet {
		t.Fatalf("answer = %q, want the rendered answer untouched", answer)
	}
}

// The shape is read off the data, not configured per tool: a ranking stays a
// ranking and a single fact stays a sentence.
func TestAnswerShapeFollowsTheData(t *testing.T) {
	if rows := countAnswerRows(composeFactSheet); rows != 0 {
		t.Fatalf("rows = %d: seven attributes of one menu are not seven items", rows)
	}
	if !strings.Contains(answerShapeRule(composeFactSheet), "ประโยค") {
		t.Fatal("one menu described by many figures should be asked for as prose")
	}

	single := "ยอดขายรวมช่วง 30 วันล่าสุดคือ 412,750.00 บาทครับ"
	if rows := countAnswerRows(single); rows != 0 {
		t.Fatalf("rows = %d, want none", rows)
	}
	if !strings.Contains(answerShapeRule(single), "ประโยค") {
		t.Fatal("a single fact should be asked for as prose")
	}

	numbered := "อันดับ\n\n1. ข้าวผัดปู 312 จาน\n2. ต้มยำกุ้ง 184 จาน\n"
	if rows := countAnswerRows(numbered); rows != 2 {
		t.Fatalf("numbered rows = %d, want 2", rows)
	}
}

func TestComposedAnswerDropsHeadingsAndOversizedReplies(t *testing.T) {
	if got := sanitizeComposedAnswer("## สรุป\nกำไรรวม 4,469.58 บาท"); got != "กำไรรวม 4,469.58 บาท" {
		t.Fatalf("sanitised = %q, want the heading removed and the body kept", got)
	}
	if sanitizeComposedAnswer(strings.Repeat("ก", maxComposedAnswerRunes+1)) != "" {
		t.Fatal("an oversized reply must be rejected, not truncated mid-sentence")
	}
	if sanitizeComposedAnswer("   ") != "" {
		t.Fatal("an empty reply must be rejected")
	}
}

// The lock can be turned off for an experiment. These pin what that costs, so
// nobody has to rediscover it during a demo: the same invented figure that was
// thrown away above now goes straight to the owner.
func TestNumberLockCanBeTurnedOffAndItsAbsenceIsVisible(t *testing.T) {
	t.Setenv("AI_ANSWER_MODE", "compose")
	t.Setenv("AI_NUMBER_LOCK", "off")
	invented := "Margin 69.85% ซึ่งสูงกว่าค่าเฉลี่ยร้านทั่วไปที่ 60% ครับ"
	service := composeService(t, invented)

	answer := service.narrateDeterministicAnswer("เมนูไหนกำไรดีสุด", composeFactSheet, nil)
	if answer != invented {
		t.Fatalf("answer = %q, want the unverified text to pass through", answer)
	}
	if aiNumberLockEnabled() {
		t.Fatal("AI_NUMBER_LOCK=off must switch the check off")
	}
}

// Anything other than "off" leaves the lock on, so a typo cannot silently
// disable it.
func TestNumberLockStaysOnForAnyOtherValue(t *testing.T) {
	for _, value := range []string{"", "on", "true", "1", "OFFF", "ปิด"} {
		t.Setenv("AI_NUMBER_LOCK", value)
		if !aiNumberLockEnabled() {
			t.Fatalf("AI_NUMBER_LOCK=%q switched the lock off", value)
		}
	}
	t.Setenv("AI_NUMBER_LOCK", "OFF")
	if aiNumberLockEnabled() {
		t.Fatal("the value is meant to be case-insensitive")
	}
}
