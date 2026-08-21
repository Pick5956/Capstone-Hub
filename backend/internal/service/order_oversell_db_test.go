package service

import (
	"strings"
	"testing"

	"Project-M/internal/entity"
)

// TestAddItemBlocksOversellWhenQueueClaimsStock proves the Phase 2 guard: once queued
// (not-yet-cooked) orders have claimed every available portion, a further add is
// rejected immediately instead of being discovered only when the kitchen runs out.
func TestAddItemBlocksOversellWhenQueueClaimsStock(t *testing.T) {
	db := orderVoidIntegrationDBOrSkip(t)
	scenario := newOrderVoidDBScenario(t, db)

	// One ingredient with two units, consumed one per serving → capacity is 2.
	ingredient := entity.Ingredient{RestaurantID: scenario.restaurant.ID, Name: "Lime", Unit: "pcs", Stock: 2}
	mustCreateOrderVoidRow(t, db, &ingredient)
	recipe := entity.MenuItemIngredient{
		RestaurantID: scenario.restaurant.ID,
		MenuItemID:   scenario.menu.ID,
		IngredientID: ingredient.ID,
		Quantity:     1,
		Unit:         "pcs",
	}
	mustCreateOrderVoidRow(t, db, &recipe)

	order, err := scenario.service.OpenOrder(scenario.restaurant.ID, scenario.user.ID, &OpenOrderRequest{OrderType: "takeaway"})
	if err != nil {
		t.Fatalf("open order: %v", err)
	}

	// Two servings sit pending in the queue and exactly exhaust the stock. Nothing
	// has been cooked yet, so physical stock is still 2 — only the ATP view is 0.
	if _, err := scenario.service.AddItem(scenario.restaurant.ID, scenario.user.ID, order.ID, &AddOrderItemRequest{MenuID: scenario.menu.ID, Quantity: 2}); err != nil {
		t.Fatalf("adding within capacity should succeed: %v", err)
	}

	// A third serving must be refused right away.
	_, err = scenario.service.AddItem(scenario.restaurant.ID, scenario.user.ID, order.ID, &AddOrderItemRequest{MenuID: scenario.menu.ID, Quantity: 1})
	if err == nil {
		t.Fatal("expected the over-capacity add to be rejected once the queue claimed all stock")
	}
	if !strings.Contains(err.Error(), "sold out") {
		t.Fatalf("expected a sold-out rejection, got %v", err)
	}
}
