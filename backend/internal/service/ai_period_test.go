package service

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

// refJuly is a fixed reference "now" (mid-July 2026, Bangkok) so month
// resolution is deterministic regardless of when the tests run.
func refJuly(t *testing.T) time.Time {
	t.Helper()
	return time.Date(2026, time.July, 15, 12, 0, 0, 0, bangkokLocation())
}

func TestExtractPeriodsNamedThaiMonth(t *testing.T) {
	periods := extractPeriods("ยอดขายเดือนมีนาคมเท่าไหร่", refJuly(t))
	if len(periods) != 1 {
		t.Fatalf("want 1 period, got %d: %+v", len(periods), periods)
	}
	p := periods[0]
	if p.Label != "เดือนมีนาคม 2569" {
		t.Fatalf("label = %q", p.Label)
	}
	if !p.Start.Equal(time.Date(2026, time.March, 1, 0, 0, 0, 0, bangkokLocation())) {
		t.Fatalf("start = %v", p.Start)
	}
	if !p.End.Equal(time.Date(2026, time.April, 1, 0, 0, 0, 0, bangkokLocation())) {
		t.Fatalf("end = %v", p.End)
	}
}

func TestExtractPeriodsRelativeMonths(t *testing.T) {
	this := extractPeriods("ยอดขายเดือนนี้เท่าไหร่", refJuly(t))
	if len(this) != 1 || this[0].Label != "เดือนกรกฎาคม 2569" {
		t.Fatalf("this month wrong: %+v", this)
	}
	prev := extractPeriods("เดือนก่อนขายได้เท่าไหร่", refJuly(t))
	if len(prev) != 1 || prev[0].Label != "เดือนมิถุนายน 2569" {
		t.Fatalf("last month wrong: %+v", prev)
	}
}

// A month later than the reference month means the most recent past occurrence,
// i.e. last year, because that window is the one that has data.
func TestExtractPeriodsFutureMonthRollsToLastYear(t *testing.T) {
	periods := extractPeriods("ยอดขายเดือนธันวาคม", refJuly(t))
	if len(periods) != 1 || periods[0].Label != "เดือนธันวาคม 2568" {
		t.Fatalf("december should resolve to last year: %+v", periods)
	}
}

func TestExtractPeriodsEnglishMonthWordBoundary(t *testing.T) {
	// "decrease" must NOT be read as December.
	if got := extractPeriods("should we decrease the price", refJuly(t)); len(got) != 0 {
		t.Fatalf("decrease should not match a month: %+v", got)
	}
	got := extractPeriods("how much did we sell in March", refJuly(t))
	if len(got) != 1 || got[0].Label != "เดือนมีนาคม 2569" {
		t.Fatalf("english march wrong: %+v", got)
	}
}

func TestExtractPeriodsComparisonKeepsTextOrder(t *testing.T) {
	periods := extractPeriods("เทียบยอดเดือนนี้กับเดือนก่อน", refJuly(t))
	if len(periods) != 2 {
		t.Fatalf("want 2 periods, got %d: %+v", len(periods), periods)
	}
	if periods[0].Label != "เดือนกรกฎาคม 2569" || periods[1].Label != "เดือนมิถุนายน 2569" {
		t.Fatalf("comparison order wrong: %+v", periods)
	}
}

func TestResolveDatedSalesRequestSingle(t *testing.T) {
	req, ok := resolveDatedSalesRequest("ยอดขายเดือนมีนาคมเท่าไหร่", refJuly(t))
	if !ok || req.comparison || len(req.periods) != 1 {
		t.Fatalf("single dated sales wrong: ok=%v %+v", ok, req)
	}
}

func TestResolveDatedSalesRequestComparison(t *testing.T) {
	req, ok := resolveDatedSalesRequest("เทียบยอดเดือนนี้กับเดือนก่อน", refJuly(t))
	if !ok || !req.comparison || len(req.periods) != 2 {
		t.Fatalf("comparison request wrong: ok=%v %+v", ok, req)
	}
}

// A comparison naming only one month is paired with the month before it.
func TestResolveDatedSalesRequestComparisonSinglePeriodPairsPrevious(t *testing.T) {
	req, ok := resolveDatedSalesRequest("เทียบยอดขายเดือนมีนาคมหน่อย", refJuly(t))
	if !ok || !req.comparison || len(req.periods) != 2 {
		t.Fatalf("single-period comparison wrong: ok=%v %+v", ok, req)
	}
	if req.periods[0].Label != "เดือนมีนาคม 2569" || req.periods[1].Label != "เดือนกุมภาพันธ์ 2569" {
		t.Fatalf("pairing wrong: %+v", req.periods)
	}
}

func TestResolveDatedSalesRequestExcludesMenuAndAverage(t *testing.T) {
	for _, q := range []string{
		"เมนูไหนขายดีเดือนมีนาคม",
		"ลูกค้าจ่ายเฉลี่ยต่อบิลเดือนนี้",
		"วัตถุดิบอะไรใช้เยอะเดือนมีนาคม",
	} {
		if _, ok := resolveDatedSalesRequest(q, refJuly(t)); ok {
			t.Fatalf("%q should not be claimed by dated-sales flow", q)
		}
	}
}

// A named month without a sales/revenue word is left to the normal flow.
func TestResolveDatedSalesRequestRequiresSalesWordForSingle(t *testing.T) {
	if _, ok := resolveDatedSalesRequest("เดือนมีนาคมเป็นยังไงบ้าง", refJuly(t)); ok {
		t.Fatal("bare month without a sales word should not be claimed")
	}
}

func TestResolveDatedSalesRequestNoPeriod(t *testing.T) {
	if _, ok := resolveDatedSalesRequest("ยอดขายรวมเท่าไหร่", refJuly(t)); ok {
		t.Fatal("a sales question with no named period should fall through to the snapshot flow")
	}
}

func TestFormatDatedSalesAnswer(t *testing.T) {
	p := monthPeriod(2026, time.March, bangkokLocation())
	got := formatDatedSalesAnswer(p, repository.AISalesRange{Orders: 42, Revenue: 12345.5, Days: 20})
	for _, want := range []string{"เดือนมีนาคม 2569", "12345.50 บาท", "42 ออเดอร์", "20 วัน"} {
		if !strings.Contains(got, want) {
			t.Fatalf("answer missing %q: %s", want, got)
		}
	}
	empty := formatDatedSalesAnswer(p, repository.AISalesRange{})
	if !strings.Contains(empty, "ยังไม่มีออเดอร์") {
		t.Fatalf("empty answer wrong: %s", empty)
	}
}

func TestFormatDatedSalesComparison(t *testing.T) {
	a := monthPeriod(2026, time.July, bangkokLocation())
	b := monthPeriod(2026, time.June, bangkokLocation())
	got := formatDatedSalesComparison(a,
		repository.AISalesRange{Orders: 50, Revenue: 12000},
		b,
		repository.AISalesRange{Orders: 40, Revenue: 10000},
	)
	for _, want := range []string{"เดือนกรกฎาคม 2569", "เดือนมิถุนายน 2569", "12000.00 บาท", "10000.00 บาท", "+20.0%", "เพิ่มขึ้น"} {
		if !strings.Contains(got, want) {
			t.Fatalf("comparison missing %q: %s", want, got)
		}
	}
	// No prior revenue -> percentage change is not claimed.
	noPrior := formatDatedSalesComparison(a,
		repository.AISalesRange{Orders: 5, Revenue: 500},
		b,
		repository.AISalesRange{},
	)
	if strings.Contains(noPrior, "%") {
		t.Fatalf("no-prior comparison must not show a percentage: %s", noPrior)
	}
}

// TestRouterTemplatesRenderCleanly guards against unescaped '%' in the classifier
// templates: they are consumed by fmt.Sprintf, so a literal '%' (e.g. "10%")
// must be written as "%%" or the rendered prompt gets fmt error markers.
func TestRouterTemplatesRenderCleanly(t *testing.T) {
	for name, tmpl := range map[string]string{
		"full":    routerClassifierTemplate,
		"compact": routerClassifierCompactTemplate,
	} {
		rendered := fmt.Sprintf(tmpl, "ปรับราคาทุกเมนูขึ้น 10%")
		if strings.Contains(rendered, "%!") {
			t.Fatalf("%s template rendered with a fmt error marker: %s", name, rendered)
		}
		if !strings.Contains(rendered, "ปรับราคาทุกเมนูขึ้น 10%") {
			t.Fatalf("%s template did not include the question", name)
		}
		// The escaped literal should survive as a single percent sign.
		if !strings.Contains(rendered, "raise all prices by 10%") {
			t.Fatalf("%s template lost its literal percent example", name)
		}
	}
}
