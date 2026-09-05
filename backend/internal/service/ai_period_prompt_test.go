package service

import (
	"strings"
	"testing"
	"time"
)

// The prompt's examples are anchored to a made-up day. Asked on 5 September a
// smaller model read "เดือนนี้" off those examples and answered for August —
// the right figures for a month nobody asked about. The real date has to lead
// the prompt, not arrive after twenty lines that say a different one.
func TestPeriodPromptLeadsWithTodayNotTheExamples(t *testing.T) {
	service := &AIService{}
	now := time.Date(2026, time.September, 5, 13, 0, 0, 0, bangkokLocation())
	prompt := service.periodPromptFor("กำไรเดือนนี้เท่าไหร่", nil, now)

	if !strings.HasPrefix(prompt, "วันนี้คือ 2026-09-05") {
		t.Fatalf("the prompt must open with the real date, got: %.60s", prompt)
	}
	if strings.Count(prompt, "2026-09-05") < 2 {
		t.Error("the real date should be stated at both ends of the prompt")
	}
	// And the rule that says which of the two dates to believe.
	if !strings.Contains(aiPeriodPrompt, "ห้ามใช้วันที่จากตัวอย่างด้านล่าง") {
		t.Error("the prompt lost the rule against reading the date off the examples")
	}
}
