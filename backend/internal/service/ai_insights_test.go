package service

import (
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

func readySnapshot() AISnapshot {
	return AISnapshot{AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
		SalesItems: 25, MarginItems: 25, CostedMarginItems: 25, SoldMenus: 8, SoldMenusWithRecipes: 8,
	})}
}

// An ingredient running out within the threshold produces an urgent card first.
func TestProactiveInsightsFlagsRunningOutIngredient(t *testing.T) {
	snap := readySnapshot()
	// Used 15000/30 days = 500/day; 500 in stock => ~1 day left => critical.
	snap.IngredientUsage = []repository.AIIngredientUsage{
		{Name: "กุ้งสด", Unit: "กรัม", Stock: 500, Used: 15000, CostPerUnit: 0.5},
	}
	insights := computeProactiveInsights(snap)
	if len(insights) == 0 || insights[0].Kind != "ingredient_low" {
		t.Fatalf("expected an ingredient_low insight first, got %+v", insights)
	}
	if insights[0].Severity != "critical" || !strings.Contains(insights[0].Title, "กุ้งสด") {
		t.Fatalf("running-out ingredient card wrong: %+v", insights[0])
	}
}

// A sharp weekly drop is surfaced as a warning.
func TestProactiveInsightsFlagsSalesDrop(t *testing.T) {
	snap := readySnapshot()
	base := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC) // 7 prior days, then 7 recent
	days := make([]repository.AISalesSummary, 0, 14)
	for i := 0; i < 14; i++ {
		revenue := 4000.0
		if i >= 7 {
			revenue = 2000.0 // recent week halved
		}
		days = append(days, repository.AISalesSummary{
			OrderDate: base.AddDate(0, 0, i).Format("2006-01-02"), Orders: 30, Revenue: revenue,
		})
	}
	snap.SalesDays = days
	found := false
	for _, in := range computeProactiveInsights(snap) {
		if in.Kind == "sales_drop" {
			found = true
		}
	}
	if !found {
		t.Fatal("a 50% weekly drop should produce a sales_drop insight")
	}
}

// A healthy shop (no risks) produces no noisy cards.
func TestProactiveInsightsQuietWhenHealthy(t *testing.T) {
	if got := computeProactiveInsights(readySnapshot()); len(got) != 0 {
		t.Fatalf("healthy snapshot should have no insights, got %+v", got)
	}
}

// A card is a notice, not a chat reply: it states the fact in one line, rounds
// its figures to what an owner would say out loud, and carries no chat particle.
// The old copy said "ใกล้หมด" over an empty shelf, printed "0.00 กรัม" and
// "1059.23 กรัม/วัน", and ended in "ครับ".
func TestInsightCardsReadAsNoticesNotChat(t *testing.T) {
	snap := readySnapshot()
	snap.IngredientUsage = []repository.AIIngredientUsage{
		// Empty shelf, still being used: 31,776/30 days ≈ 1,059 per day.
		{Name: "ไก่สับ", Unit: "กรัม", Stock: 0, Used: 31776, CostPerUnit: 0.12},
	}
	insights := computeProactiveInsights(snap)
	if len(insights) == 0 {
		t.Fatal("an ingredient at zero stock should produce a card")
	}
	card := insights[0]

	// Already out is not "about to run out".
	if !strings.Contains(card.Title, "หมดสต๊อกแล้ว") {
		t.Errorf("an empty shelf should be stated as out of stock, got %q", card.Title)
	}
	joined := card.Title + " " + card.Metric + " " + card.Detail
	for _, noise := range []string{"ครับ", "ค่ะ", ".00", "0.00", "1059.23"} {
		if strings.Contains(joined, noise) {
			t.Errorf("card copy should not contain %q: %q", noise, joined)
		}
	}
	// The daily-use figure is rounded and separated: "1,059" not "1059.23".
	if !strings.Contains(card.Detail, "1,059") {
		t.Errorf("the daily-use figure should be rounded with separators, got %q", card.Detail)
	}
}

// Money on a card is whole baht with separators, and the headline carries the
// size of the move so the card can be understood without reading the figures.
func TestSalesDropCardStatesTheSizeInTheHeadline(t *testing.T) {
	snap := readySnapshot()
	base := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	days := make([]repository.AISalesSummary, 0, 14)
	for i := 0; i < 14; i++ {
		revenue := 4000.0
		if i >= 7 {
			revenue = 2000.0
		}
		days = append(days, repository.AISalesSummary{
			OrderDate: base.AddDate(0, 0, i).Format("2006-01-02"), Orders: 30, Revenue: revenue,
		})
	}
	snap.SalesDays = days
	for _, in := range computeProactiveInsights(snap) {
		if in.Kind != "sales_drop" {
			continue
		}
		if !strings.Contains(in.Title, "50%") {
			t.Errorf("the headline should carry the size of the drop, got %q", in.Title)
		}
		if strings.Contains(in.Metric+in.Detail, ".00") {
			t.Errorf("card money should be whole baht, got %q / %q", in.Metric, in.Detail)
		}
		if !strings.Contains(in.Metric, "฿") {
			t.Errorf("card money should be marked with ฿, got %q", in.Metric)
		}
		return
	}
	t.Fatal("a 50% weekly drop should produce a sales_drop insight")
}

func TestSeverityRankOrder(t *testing.T) {
	if !(severityRank("critical") < severityRank("warning") && severityRank("warning") < severityRank("info")) {
		t.Fatal("severity ranking must be critical < warning < info")
	}
}
