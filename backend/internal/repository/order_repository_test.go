package repository

import (
	"testing"

	"Project-M/internal/entity"
)

func TestSummarizeOrderStatuses(t *testing.T) {
	summary := summarizeOrderStatuses([]orderStatusCountRow{
		{Status: entity.OrderStatusOpen, Count: 3},
		{Status: entity.OrderStatusCooking, Count: 2},
		{Status: entity.OrderStatusReady, Count: 1},
		{Status: entity.OrderStatusCompleted, Count: 4},
		{Status: entity.OrderStatusCancelled, Count: 1},
	})

	if summary.Total != 11 {
		t.Fatalf("expected total 11, got %d", summary.Total)
	}
	if summary.Active != 6 {
		t.Fatalf("expected active 6, got %d", summary.Active)
	}
	if summary.Closed != 5 {
		t.Fatalf("expected closed 5, got %d", summary.Closed)
	}
	if summary.Statuses[entity.OrderStatusSentToKitchen] != 0 {
		t.Fatalf("expected missing statuses to be initialized to zero")
	}
}

func TestHasKitchenQueueItemsKeepsCompletedKitchenTicketsVisible(t *testing.T) {
	tests := []struct {
		name  string
		items []entity.OrderItem
		want  bool
	}{
		{
			name:  "cooking item",
			items: []entity.OrderItem{{Status: entity.OrderItemStatusCooking}},
			want:  true,
		},
		{
			name:  "completed kitchen item stays visible until order closes",
			items: []entity.OrderItem{{Status: entity.OrderItemStatusReady}},
			want:  true,
		},
		{
			name:  "served item leaves kitchen queue",
			items: []entity.OrderItem{{Status: entity.OrderItemStatusServed}},
			want:  false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := hasKitchenQueueItems(test.items); got != test.want {
				t.Fatalf("hasKitchenQueueItems() = %v, want %v", got, test.want)
			}
		})
	}
}
