package realtime

import (
	"sync"
	"time"
)

const OrderChangedEvent = "orders.changed"

// OrderEvent is an invalidation signal. Clients refetch the scoped REST
// resource instead of relying on an event payload as a second source of truth.
type OrderEvent struct {
	Type       string    `json:"type"`
	Action     string    `json:"action"`
	OrderID    uint      `json:"order_id,omitempty"`
	OccurredAt time.Time `json:"occurred_at"`
}

// OrderHub fans order changes out to connected clients for one backend
// process. Restaurant IDs are routing keys and are never included in payloads.
type OrderHub struct {
	mu          sync.RWMutex
	subscribers map[uint]map[chan OrderEvent]struct{}
}

func NewOrderHub() *OrderHub {
	return &OrderHub{subscribers: make(map[uint]map[chan OrderEvent]struct{})}
}

func (h *OrderHub) Subscribe(restaurantID uint) (<-chan OrderEvent, func()) {
	ch := make(chan OrderEvent, 1)
	h.mu.Lock()
	if h.subscribers[restaurantID] == nil {
		h.subscribers[restaurantID] = make(map[chan OrderEvent]struct{})
	}
	h.subscribers[restaurantID][ch] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			h.mu.Lock()
			if subscribers := h.subscribers[restaurantID]; subscribers != nil {
				delete(subscribers, ch)
				if len(subscribers) == 0 {
					delete(h.subscribers, restaurantID)
				}
			}
			close(ch)
			h.mu.Unlock()
		})
	}

	return ch, unsubscribe
}

func (h *OrderHub) Publish(restaurantID uint, action string, orderID uint) OrderEvent {
	event := OrderEvent{
		Type:       OrderChangedEvent,
		Action:     action,
		OrderID:    orderID,
		OccurredAt: time.Now().UTC(),
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subscribers[restaurantID] {
		select {
		case ch <- event:
		default:
			// One queued invalidation is enough. A slow client will refetch the
			// complete current state when it consumes that event.
		}
	}
	return event
}
