package service

import (
	"strings"
	"testing"

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
