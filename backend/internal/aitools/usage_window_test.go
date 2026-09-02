package aitools

import (
	"testing"

	"Project-M/internal/repository"
)

// The inventory page and the assistant both answer "this lasts N days" from the
// same deduction rows. If their windows drift apart, the two surfaces quote
// different numbers for the same ingredient on the same day, and the owner has
// no way to tell which one is lying.
func TestInventoryUsageWindowMatchesTheAssistantWindow(t *testing.T) {
	if int(AnalysisWindowDays) != repository.IngredientUsageWindowDays {
		t.Fatalf("aitools.AnalysisWindowDays = %v but repository.IngredientUsageWindowDays = %d — "+
			"the inventory bar and the assistant would report different days-left figures",
			AnalysisWindowDays, repository.IngredientUsageWindowDays)
	}
}
