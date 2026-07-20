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
