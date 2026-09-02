package service

import (
	"strings"
	"testing"
	"time"
)

// "ปีที่แล้วขายได้เท่าไหร่" came back as 93,008 baht for "1 มกราคม – 2 กันยายน 2568":
// the model resolver cut last year to the same span as this year, and the label
// then read as a custom range. A bare year is the whole year, and it is
// labelled as one.
func TestPeriodPromptReadsABareYearAsTheWholeYear(t *testing.T) {
	for _, want := range []string{"ปีที่แล้ว", "ทั้งปี", "2025-12-31"} {
		if !strings.Contains(aiPeriodPrompt, want) {
			t.Errorf("the period prompt lost %q", want)
		}
	}
}

func TestRangeLabelNamesAWholeCalendarYear(t *testing.T) {
	loc := bangkokLocation()
	now := time.Date(2026, 9, 2, 12, 0, 0, 0, loc)
	start := time.Date(2025, 1, 1, 0, 0, 0, 0, loc)
	end := time.Date(2025, 12, 31, 0, 0, 0, 0, loc)
	if got := aiRangeLabel(start, end, now); got != "ปี 2568" {
		t.Fatalf("a whole year should be labelled as that year, got %q", got)
	}
	// A partial year keeps the explicit range so the owner can see it is partial.
	if got := aiRangeLabel(start, time.Date(2025, 9, 2, 0, 0, 0, 0, loc), now); got == "ปี 2568" {
		t.Fatalf("a partial year must not be labelled as the whole year")
	}
}

// The coverage line used to be a bare "data_coverage=2025-08-24..2026-09-02".
// The model read 93,008 baht for a span starting in January over records that
// start in August, and said nothing about the gap. The note now says it in Thai.
func TestCoverageNoteSaysWhenRecordsBegin(t *testing.T) {
	note := aiCoverageMeaning("2025-08-24", "2026-09-02")
	for _, want := range []string{"24 สิงหาคม 2568", "2 กันยายน 2569", "เฉพาะส่วนที่มีข้อมูล"} {
		if !strings.Contains(note, want) {
			t.Errorf("the coverage note lost %q:\n%s", want, note)
		}
	}
	if aiThaiDate("garbage") != "garbage" {
		t.Errorf("an unparseable date should pass through unchanged")
	}
}

// A window that starts before the first bill gets a sentence about this exact
// gap, not only the general coverage rule; a window inside the records gets no
// such line, so the model is not told to caveat a complete figure.
func TestCoverageLinesNameThePartialGapForThisQuestion(t *testing.T) {
	loc := bangkokLocation()
	partial := aiCoverageLines("2025-08-24", "2026-09-02", time.Date(2025, 1, 1, 0, 0, 0, 0, loc))
	for _, want := range []string{"partial_coverage=true", "ช่วงที่ถามเริ่ม 1 มกราคม 2568", "บิลแรกในระบบคือ 24 สิงหาคม 2568"} {
		if !strings.Contains(partial, want) {
			t.Errorf("a window starting before the records should carry %q:\n%s", want, partial)
		}
	}
	complete := aiCoverageLines("2025-08-24", "2026-09-02", time.Date(2026, 8, 1, 0, 0, 0, 0, loc))
	if strings.Contains(complete, "partial_coverage") {
		t.Errorf("a window inside the records must not be marked partial:\n%s", complete)
	}
	if strings.Contains(aiCoverageLines("2025-08-24", "2026-09-02", time.Time{}), "partial_coverage") {
		t.Errorf("no start date, no partial line")
	}
}
