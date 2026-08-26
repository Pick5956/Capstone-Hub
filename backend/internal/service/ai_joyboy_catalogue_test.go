package service

import (
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

// Joyboy has no classifier, so a tool is only as findable as its description.
// A tool offered with legacy's wording is a tool the model has to guess at, and
// the guess is silent when it goes wrong.
func TestEveryOfferedToolIsDescribedForJoyboy(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		name := AIToolName(spec.Name)
		guide, described := joyboyToolGuide[name]
		if !described {
			guide, described = joyboyExtraToolGuide[name]
		}
		if !described {
			t.Errorf("%s is offered with legacy's description, not joyboy's", spec.Name)
			continue
		}
		if spec.Description != guide {
			t.Errorf("%s did not receive its joyboy description", spec.Name)
		}
		// The point of these descriptions is the questions they name.
		if !strings.Contains(guide, "ใช้ตอบ") {
			t.Errorf("%s describes what it returns but not what it answers", spec.Name)
		}
	}
}

// A guide entry for a tool nobody offers is dead text that will drift.
func TestTheGuideDescribesNothingUnreachable(t *testing.T) {
	offered := map[string]struct{}{}
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		offered[spec.Name] = struct{}{}
	}
	for name := range joyboyToolGuide {
		if _, ok := offered[string(name)]; !ok {
			t.Errorf("%s is described but never offered", name)
		}
	}
	for name := range joyboyExtraToolGuide {
		if _, ok := offered[string(name)]; !ok {
			t.Errorf("extra tool %s is described but never offered", name)
		}
	}
}

// Withheld tools must stay runnable: they are still reachable through legacy,
// and a fact sheet rendering is still expected for them.
func TestWithheldToolsAreNotOfferedButStillWork(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		if _, withheld := joyboyToolsNotOffered[AIToolName(spec.Name)]; withheld {
			t.Fatalf("%s is withheld yet still offered", spec.Name)
		}
	}
	for name := range joyboyToolsNotOffered {
		if !isSupportedReadOnlyTool(name) {
			t.Errorf("%s is withheld from a list it was never on", name)
		}
		if _, ok := joyboyFactBody(AIToolResult{Tool: name}); !ok {
			t.Errorf("%s lost its fact sheet rendering", name)
		}
	}
}

// "เมนูขายดี" has two correct tools — top sellers by count and the revenue
// ranking — and round 12 saw the model split three ways on the identical
// question, once by count and twice by revenue. The tie is broken in the
// revenue tool's guide: it defers to the count tool unless the question names
// money, so a bare "ขายดี" resolves one way every time.
func TestRevenueRankingDefersToCountForBareBestSeller(t *testing.T) {
	guide := joyboyToolGuide[AIToolGetMenuRevenueRanking]
	if !strings.Contains(guide, "get_top_selling_menus") {
		t.Fatal("the revenue ranking no longer points a bare \"ขายดี\" at the count tool")
	}
	if !strings.Contains(guide, "เงินหรือรายได้") {
		t.Fatal("the revenue ranking stopped scoping itself to money questions")
	}
}

// get_data_coverage is a joyboy-only tool answering "how far back does the data
// reach?". Its fact sheet must carry the span as raw figures — first and last
// day, plus the count — and fall back to no-data when there are no paid sales,
// since "no sales at all" and "no sales today" are different answers.
func TestDataCoverageBodyRendersTheSpan(t *testing.T) {
	body := joyboyDataCoverageBody(repository.AISalesCoverage{
		FirstDate: "2025-08-25", LastDate: "2026-08-24", Days: 300, Orders: 14362, Revenue: 3390000,
	})
	for _, want := range []string{"first_date=2025-08-25", "last_date=2026-08-24", "days_with_data=300", "total_orders=14362"} {
		if !strings.Contains(body, want) {
			t.Errorf("data coverage body missing %q: %s", want, body)
		}
	}
	empty := joyboyDataCoverageBody(repository.AISalesCoverage{})
	if !strings.Contains(empty, "status=no_data") {
		t.Errorf("empty coverage should report no_data, got %q", empty)
	}
}

// get_menu_metrics_for_period renders every menu's figures for a named period as
// a flat sheet, stating the period so the answer never reads as the 30-day
// window, and giving all metrics so the model ranks by whichever was asked.
func TestMenuForPeriodBodyStatesPeriodAndAllMetrics(t *testing.T) {
	body := joyboyMenuForPeriodBody("เดือนกรกฎาคม 2569", []repository.AIMenuMarginSummary{
		{MenuName: "ต้มยำกุ้ง", Quantity: 120, Revenue: 16680, Profit: 11000, Margin: 65.9},
		{MenuName: "ผัดไทย", Quantity: 98, Revenue: 8820, Profit: 5800, Margin: 65.8},
	})
	for _, want := range []string{"period=เดือนกรกฎาคม 2569", "not_30day_window", "menu=ต้มยำกุ้ง", "qty=120", "profit=", "margin_pct="} {
		if !strings.Contains(body, want) {
			t.Errorf("menu-for-period body missing %q: %s", want, body)
		}
	}
	if empty := joyboyMenuForPeriodBody("เดือนที่แล้ว", nil); !strings.Contains(empty, "status=no_data") {
		t.Errorf("no sales in period should report no_data, got %q", empty)
	}
}

// get_sales_for_period states the whole-store paid-sales total for a named
// window using grand_total from the orders table, so the model reports it
// instead of summing menu lines (the mistake that produced 347,353 for a
// 347,453 month). An empty window reads as no-data, not a zero baht answer.
func TestSalesForPeriodBodyStatesWholeStoreTotal(t *testing.T) {
	body := joyboySalesForPeriodBody("เดือนกรกฎาคม 2569", repository.AISalesRange{Orders: 1285, Revenue: 347453, Days: 31})
	for _, want := range []string{"period=เดือนกรกฎาคม 2569", "whole_store", "revenue=347453", "orders=1285", "selling_days=31"} {
		if !strings.Contains(body, want) {
			t.Errorf("sales-for-period body missing %q: %s", want, body)
		}
	}
	if empty := joyboySalesForPeriodBody("ปี 2567", repository.AISalesRange{}); !strings.Contains(empty, "status=no_data") {
		t.Errorf("no paid orders should report no_data, got %q", empty)
	}
}

// A month-to-month comparison carries the percent change computed in Go, so the
// model never divides two totals by hand. Its sign drives the direction, and a
// zero baseline is flagged rather than divided by.
func TestSalesComparisonBodyComputesPercentInGo(t *testing.T) {
	a := AIPeriod{Label: "เดือนสิงหาคม 2569"}
	b := AIPeriod{Label: "เดือนกรกฎาคม 2569"}
	up := joyboySalesComparisonBody(a, repository.AISalesRange{Orders: 100, Revenue: 120}, b, repository.AISalesRange{Orders: 90, Revenue: 100})
	for _, want := range []string{"period_a=เดือนสิงหาคม 2569", "revenue_a=120", "revenue_b=100", "change_pct=20.00", "direction=up"} {
		if !strings.Contains(up, want) {
			t.Errorf("comparison body missing %q: %s", want, up)
		}
	}
	down := joyboySalesComparisonBody(a, repository.AISalesRange{Orders: 80, Revenue: 80}, b, repository.AISalesRange{Orders: 90, Revenue: 100})
	if !strings.Contains(down, "direction=down") {
		t.Errorf("a fall should read direction=down: %s", down)
	}
	zero := joyboySalesComparisonBody(a, repository.AISalesRange{Orders: 5, Revenue: 50}, b, repository.AISalesRange{})
	if !strings.Contains(zero, "change_pct=na") {
		t.Errorf("a zero baseline must not be divided by: %s", zero)
	}
}

// A whole-year total ("ยอดขายปีนี้", "ยอดขายปี 2568") is claimed only when the
// question is about a sales total; menu or per-order questions that mention a
// year keep their own tools. A month question yields no bare year, so it stays
// with the month resolver.
func TestYearSalesTotalClaimsOnlyYearSalesQuestions(t *testing.T) {
	ref := time.Date(2026, 8, 26, 12, 0, 0, 0, bangkokLocation())
	if p, ok := joyboyYearSalesTotal("ยอดขายปีนี้เท่าไหร่", ref); !ok || !strings.Contains(p.Label, "2569") {
		t.Errorf("ยอดขายปีนี้ should resolve to ปี 2569, got ok=%v label=%q", ok, p.Label)
	}
	if p, ok := joyboyYearSalesTotal("ยอดขายปี 2568", ref); !ok || !strings.Contains(p.Label, "2568") {
		t.Errorf("ยอดขายปี 2568 should resolve, got ok=%v label=%q", ok, p.Label)
	}
	if _, ok := joyboyYearSalesTotal("เมนูขายดีปีนี้", ref); ok {
		t.Error("a menu question must not be hijacked by the year-sales total")
	}
	if _, ok := joyboyYearSalesTotal("ยอดขายเดือนกรกฎาคม", ref); ok {
		t.Error("a month question names no bare year and must fall through to the month resolver")
	}
}

// search_system_docs is the other joyboy-only tool. Its fact sheet is prose — the
// manual text a hit carried — so the model can answer "how do I use X?" from the
// docs instead of its own guess. No hits must read as no-data, not as silence.
func TestSystemDocsBodyRendersHitsAndNoData(t *testing.T) {
	body := joyboySystemDocsBody(AISystemDocsToolResult{SearchResults: []AISystemDocSearchResult{
		{ArticleTitle: "เมนู", SectionTitle: "เพิ่มเมนูใหม่", RelevantContent: "ไปที่หน้าเมนู แล้วกดปุ่มเพิ่ม"},
	}})
	for _, want := range []string{"เมนู", "เพิ่มเมนูใหม่", "ไปที่หน้าเมนู"} {
		if !strings.Contains(body, want) {
			t.Errorf("docs body missing %q: %s", want, body)
		}
	}
	if empty := joyboySystemDocsBody(AISystemDocsToolResult{}); !strings.Contains(empty, "status=no_data") {
		t.Errorf("no hits should report no_data, got %q", empty)
	}
}
