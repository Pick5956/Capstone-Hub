package service

import (
	"testing"

	"Project-M/internal/entity"
)

func TestOrderNumberFromIndex(t *testing.T) {
	cases := map[int]string{
		1:    "A001",
		999:  "A999",
		1000: "B001",
	}
	for input, want := range cases {
		if got := orderNumberFromIndex(input); got != want {
			t.Fatalf("orderNumberFromIndex(%d) = %s, want %s", input, got, want)
		}
	}
}

func TestCanTransitionItem(t *testing.T) {
	if !canTransitionItem(entity.OrderItemStatusPending, entity.OrderItemStatusCooking) {
		t.Fatal("pending should transition to cooking")
	}
	if canTransitionItem(entity.OrderItemStatusReady, entity.OrderItemStatusPending) {
		t.Fatal("ready should not transition back to pending")
	}
	if canTransitionItem(entity.OrderItemStatusServed, entity.OrderItemStatusCancelled) {
		t.Fatal("served should be terminal for item status")
	}
}

func TestRecipeComponentCostUsesYield(t *testing.T) {
	if got := recipeComponentCost(2, 10, 100); got != 20 {
		t.Fatalf("recipeComponentCost with full yield = %v, want 20", got)
	}
	if got := recipeComponentCost(2, 10, 80); got != 25 {
		t.Fatalf("recipeComponentCost with 80 percent yield = %v, want 25", got)
	}
	if got := recipeComponentCost(2, 10, 0); got != 20 {
		t.Fatalf("recipeComponentCost with empty yield = %v, want 20", got)
	}
}
