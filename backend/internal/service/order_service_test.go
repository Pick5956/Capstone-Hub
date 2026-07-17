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

func TestValidateEmptyTableClose(t *testing.T) {
	tableID := uint(7)
	tests := []struct {
		name    string
		order   *entity.Order
		wantErr string
	}{
		{
			name: "allows an open dine-in table without items",
			order: &entity.Order{
				OrderType: entity.OrderTypeDineIn,
				TableID:   &tableID,
				Status:    entity.OrderStatusOpen,
			},
		},
		{
			name: "rejects takeaway orders",
			order: &entity.Order{
				OrderType: entity.OrderTypeTakeaway,
				Status:    entity.OrderStatusOpen,
			},
			wantErr: "only an empty dine-in table can be closed",
		},
		{
			name: "rejects orders after kitchen send",
			order: &entity.Order{
				OrderType: entity.OrderTypeDineIn,
				TableID:   &tableID,
				Status:    entity.OrderStatusCooking,
			},
			wantErr: "only an open table can be closed without an order",
		},
		{
			name: "rejects orders with items",
			order: &entity.Order{
				OrderType: entity.OrderTypeDineIn,
				TableID:   &tableID,
				Status:    entity.OrderStatusOpen,
				Items:     []entity.OrderItem{{}},
			},
			wantErr: "table order already has items",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateEmptyTableClose(test.order)
			if test.wantErr == "" {
				if err != nil {
					t.Fatalf("validateEmptyTableClose() error = %v, want nil", err)
				}
				return
			}
			if err == nil || err.Error() != test.wantErr {
				t.Fatalf("validateEmptyTableClose() error = %v, want %q", err, test.wantErr)
			}
		})
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
