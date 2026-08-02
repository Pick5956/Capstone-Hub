package service

import (
	"strings"
	"testing"
	"time"
)

// A period-scoped menu question must be recognised as such: it names a metric AND
// a calendar period. Everything else stays with the rolling-window flow.
func TestPeriodMenuQueryShape(t *testing.T) {
	ref := refJuly(t)

	periodScoped := []struct {
		q      string
		metric string
	}{
		{"เมนูไหนที่ทำกำไรให้ร้านเราได้ดีมากๆ ในช่วงเดือนที่ผ่านมา", "margin"},
		{"เมนูไหนกำไรดีสุดเดือนมีนาคม", "margin"},
		{"เมนูไหนขายดีสุดเดือนนี้", "quantity"},
		{"เมนูไหนทำรายได้เยอะสุดเดือนที่แล้ว", "revenue"},
	}
	for _, c := range periodScoped {
		q, ok := parseMenuRankQuery(c.q)
		if !ok {
			t.Errorf("%q: expected a menu metric", c.q)
			continue
		}
		if q.Metric != c.metric {
			t.Errorf("%q: metric = %q, want %q", c.q, q.Metric, c.metric)
		}
		if len(extractPeriods(c.q, ref)) == 0 {
			t.Errorf("%q: expected a named period", c.q)
		}
	}

	// No period named → the rolling-window flow keeps these.
	for _, q := range []string{"เมนูไหนกำไรดีสุด", "เมนูไหนขายดีสุด"} {
		if len(extractPeriods(q, ref)) != 0 {
			t.Errorf("%q should not be treated as period-scoped", q)
		}
	}
}

// Price is a property of the current menu, not of a past month, so a price
// question must not be routed through the period flow.
func TestPeriodMenuQueryDeclinesPrice(t *testing.T) {
	svc := ProvideAIService(nil) // nil repo: must decline before touching the DB
	if _, handled, err := svc.answerPeriodMenuQuery(1, "เมนูไหนแพงสุดเดือนมีนาคม", "เมนูไหนแพงสุดเดือนมีนาคม"); handled || err != nil {
		t.Fatalf("price question must not be handled by the period flow (handled=%v err=%v)", handled, err)
	}
}

func TestPeriodMenuQueryNeedsBothMetricAndPeriod(t *testing.T) {
	svc := ProvideAIService(nil)
	for _, q := range []string{
		"เมนูไหนกำไรดีสุด", // metric but no period
		"ยอดขายเดือนมีนาคม", // period but not a menu metric
		"สวัสดีครับ",
	} {
		if _, handled, _ := svc.answerPeriodMenuQuery(1, q, q); handled {
			t.Errorf("%q should not be handled by the period menu flow", q)
		}
	}
}

// The answer must state the period it covers, and margin answers should carry the
// baht profit alongside the percentage.
func TestFormatMenuRankInPeriodStatesThePeriod(t *testing.T) {
	q := menuRankQuery{Metric: "margin", Direction: "high", Rank: 1, Limit: 1}
	rows := []menuMetricRow{{Name: "ต้มยำกุ้งน้ำข้น", Margin: 69.25, Profit: 36866.77}}

	answer := formatMenuRankInPeriod(q, rows, "เดือนกรกฎาคม 2569")
	for _, want := range []string{"ในเดือนกรกฎาคม 2569", "ต้มยำกุ้งน้ำข้น", "69.25%", "36,866.77"} {
		if !strings.Contains(answer, want) {
			t.Fatalf("answer missing %q: %s", want, answer)
		}
	}

	// Without a period label it reads as before (rolling window).
	plain := formatMenuRankInPeriod(q, rows, "")
	if strings.HasPrefix(plain, "ใน") {
		t.Fatalf("no period label should mean no period prefix: %s", plain)
	}
}

// Guard the month boundary maths the range query relies on.
func TestPreviousMonthPeriodBoundaries(t *testing.T) {
	ref := time.Date(2026, time.July, 15, 12, 0, 0, 0, bangkokLocation())
	p := previousMonthPeriod(ref)
	if !p.Start.Equal(time.Date(2026, time.June, 1, 0, 0, 0, 0, bangkokLocation())) {
		t.Fatalf("start = %v", p.Start)
	}
	if !p.End.Equal(time.Date(2026, time.July, 1, 0, 0, 0, 0, bangkokLocation())) {
		t.Fatalf("end = %v (must be exclusive start of this month)", p.End)
	}
}
