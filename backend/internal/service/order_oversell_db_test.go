package service

import (
	"strings"
	"testing"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
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

// TestReadyItemsAreNotDoubleCountedInATP guards the fix for a sold-out false alarm:
// stock is deducted the moment an item is marked ready, so a ready item must NOT also
// be reserved as "committed". Reserving it twice made a dish look sold out while raw
// stock was still on hand (e.g. 20 ready plates consumed 3000 g chicken AND were then
// reserved for another 3000 g, dropping available-to-promise to 0 with 3000 g left).
func TestReadyItemsAreNotDoubleCountedInATP(t *testing.T) {
	db := orderVoidIntegrationDBOrSkip(t)
	scenario := newOrderVoidDBScenario(t, db)

	// One ingredient, one unit per serving. Stock is set to 1 to represent the state
	// *after* a ready item already consumed its share: the deduction has landed, so the
	// only thing left to promise is the 1 physical unit still on the shelf.
	ingredient := entity.Ingredient{RestaurantID: scenario.restaurant.ID, Name: "Chicken", Unit: "g", Stock: 1}
	mustCreateOrderVoidRow(t, db, &ingredient)
	recipe := entity.MenuItemIngredient{
		RestaurantID: scenario.restaurant.ID,
		MenuItemID:   scenario.menu.ID,
		IngredientID: ingredient.ID,
		Quantity:     1,
		Unit:         "g",
	}
	mustCreateOrderVoidRow(t, db, &recipe)

	// A ready item sits on the order. Its stock has already been deducted (reflected by
	// Stock: 1 above), so ATP must count only the remaining physical unit, not reserve
	// the ready portion a second time.
	scenario.orderWithItems(t, entity.OrderTypeDineIn, entity.OrderItemStatusReady)

	remaining, err := repository.MenuRemainingServings(db, scenario.restaurant.ID)
	if err != nil {
		t.Fatalf("compute remaining servings: %v", err)
	}
	if got := remaining[scenario.menu.ID]; got != 1 {
		t.Fatalf("remaining servings = %d, want 1 (ready item must not be reserved again)", got)
	}
}
