package service

import (
	"strings"
	"testing"

	"Project-M/internal/repository"
)

func TestLooksLikeDataCoverageQuestion(t *testing.T) {
	coverage := []string{
		"มียอดขายถึงช่วงวันไหน",
		"ตอนนี้มีข้อมูลยอดขายถึงช่วงไหน",
		"ข้อมูลมีถึงวันไหน",
		"ข้อมูลยอดขายมีตั้งแต่เมื่อไหร่",
		"ข้อมูลย้อนหลังกี่เดือน",
		"how far back does the sales data go",
	}
	for _, q := range coverage {
		if !looksLikeDataCoverageQuestion(q) {
			t.Errorf("%q should be recognised as a data-coverage question", q)
		}
	}

	notCoverage := []string{
		"ยอดขายวันนี้เท่าไหร่",
		"เมนูไหนขายดีสุด",
		"สวัสดีครับ",
		"วัตถุดิบอะไรใกล้หมด",
		"เทียบยอดเดือนนี้กับเดือนก่อน",
	}
	for _, q := range notCoverage {
		if looksLikeDataCoverageQuestion(q) {
			t.Errorf("%q must not be treated as a data-coverage question", q)
		}
	}
}

func TestFormatThaiDate(t *testing.T) {
	cases := map[string]string{
		"2026-07-31": "31 กรกฎาคม 2569",
		"2025-12-01": "1 ธันวาคม 2568",
		"not-a-date": "not-a-date", // falls back rather than hiding the value
	}
	for in, want := range cases {
		if got := formatThaiDate(in); got != want {
			t.Errorf("formatThaiDate(%q) = %q, want %q", in, got, want)
		}
	}
}

// A "today" question with no sales must point at the newest day that does have
// data, instead of dead-ending on "no orders".
func TestSalesForPeriodReportsLatestDataWhenEmpty(t *testing.T) {
	snapshot := AISnapshot{
		GeneratedAt:       "2026-08-02T20:00:00+07:00", // today
		AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{SalesItems: 10}),
		SalesDays: []repository.AISalesSummary{
			{OrderDate: "2026-07-31", Orders: 41, Revenue: 9988},
			{OrderDate: "2026-07-30", Orders: 32, Revenue: 7433},
		},
	}
	res, err := executeReadOnlyTool(AIToolGetSalesForPeriod, snapshot, "ยอดขายวันนี้เป็นไงบ้าง")
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	if res.SalesForPeriod == nil || res.SalesForPeriod.Orders != 0 {
		t.Fatalf("expected today to have no orders: %+v", res.SalesForPeriod)
	}
	if res.SalesForPeriod.LatestDate != "2026-07-31" {
		t.Fatalf("latest data date = %q, want 2026-07-31", res.SalesForPeriod.LatestDate)
	}
	answer, ok := localToolAnswer(res)
	if !ok {
		t.Fatal("expected an answer")
	}
	if !strings.Contains(answer, "31 กรกฎาคม 2569") {
		t.Fatalf("empty-day answer should name the latest date with data: %s", answer)
	}
}
