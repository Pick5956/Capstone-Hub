package realtime

import "testing"

func TestOrderHubScopesEventsByRestaurant(t *testing.T) {
	hub := NewOrderHub()
	restaurantOne, unsubscribeOne := hub.Subscribe(1)
	defer unsubscribeOne()
	restaurantTwo, unsubscribeTwo := hub.Subscribe(2)
	defer unsubscribeTwo()

	hub.Publish(1, "order.created", 42)

	select {
	case received := <-restaurantOne:
		if received.OrderID != 42 || received.Action != "order.created" {
			t.Fatalf("unexpected event: %#v", received)
		}
	default:
		t.Fatal("restaurant subscriber did not receive its event")
	}

	select {
	case received := <-restaurantTwo:
		t.Fatalf("event leaked to another restaurant: %#v", received)
	default:
	}
}

func TestOrderHubCoalescesForSlowSubscribers(t *testing.T) {
	hub := NewOrderHub()
	events, unsubscribe := hub.Subscribe(1)
	defer unsubscribe()

	hub.Publish(1, "first", 1)
	hub.Publish(1, "second", 2)

	if received := <-events; received.Action != "first" {
		t.Fatalf("expected first queued invalidation, got %#v", received)
	}
	select {
	case received := <-events:
		t.Fatalf("expected duplicate invalidation to be coalesced, got %#v", received)
	default:
	}
}
