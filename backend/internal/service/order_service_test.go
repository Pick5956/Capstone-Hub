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
