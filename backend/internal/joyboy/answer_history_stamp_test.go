package joyboy

import (
	"strings"
	"testing"
	"time"
)

// Every history line carries when it was said. Asked "7 วันก่อนคือวันไหน" on
// the 7th, the writer copied "24–30 ส.ค." from an answer written on the 6th,
// because nothing told it that answer was a day old. Now the day is in front
// of the line, and the rule beside the sheet says what to do with it.
func TestHistoryLinesCarryWhenTheyWereSaid(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Bangkok")
	history := []Turn{
		{Role: "user", Content: "สัปดาห์ก่อนคือวันไหน", At: time.Date(2026, 9, 6, 20, 18, 0, 0, loc)},
		{Role: "assistant", Content: "24 ถึง 30 สิงหาคม ครับ", At: time.Date(2026, 9, 6, 20, 18, 30, 0, loc)},
	}
	got := formatHistory(history)
	for _, want := range []string{"[6 ก.ย. 20:18] เจ้าของร้าน: สัปดาห์ก่อนคือวันไหน", "[6 ก.ย. 20:18] ผู้ช่วย: 24 ถึง 30 สิงหาคม ครับ", "วันเวลาในวงเล็บคือตอนที่พูด"} {
		if !strings.Contains(got, want) {
			t.Errorf("history lost %q:\n%s", want, got)
		}
	}
	// A turn with no time (sent by the client, or built in a test) is printed as before.
	if plain := formatHistory([]Turn{{Role: "user", Content: "สวัสดี"}}); !strings.Contains(plain, "เจ้าของร้าน: สวัสดี") || strings.Contains(plain, "[") {
		t.Errorf("an unstamped turn changed shape: %q", plain)
	}
}

func TestBothTemplatesTellTheWriterOldDatesAreOld(t *testing.T) {
	for name, prompt := range map[string]string{
		"with data":    answerPrompt("สัปดาห์ก่อนคือวันไหน", nil, "", "[get_sales_for_period]\nperiod=x"),
		"without data": answerPrompt("สัปดาห์ก่อนคือวันไหน", nil, "", ""),
	} {
		for _, want := range []string{"ณ วันเวลาในวงเล็บหน้าบรรทัดนั้น", "ให้ตอบจากบรรทัด \"วันนี้คือ\" เท่านั้น", "ห้ามลอกสำนวนของคำตอบเก่า"} {
			if !strings.Contains(prompt, want) {
				t.Errorf("%s template lost %q", name, want)
			}
		}
	}
}
