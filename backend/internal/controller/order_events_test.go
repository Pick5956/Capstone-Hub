package controller

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/realtime"

	"github.com/gin-gonic/gin"
)

func TestOrderEventsRotatesSessionToRevalidateAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest("GET", "/api/v1/events/orders", nil)
	context.Set("restaurant_id", uint(7))
	context.Set("restaurant_member", &entity.RestaurantMember{
		Status: "active",
		Role:   &entity.Role{Name: "owner"},
	})

	controller := &OrderController{
		orderEvents:            realtime.NewOrderHub(),
		eventHeartbeatInterval: time.Hour,
		eventSessionLifetime:   5 * time.Millisecond,
	}

	done := make(chan struct{})
	go func() {
		controller.OrderEvents(context)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("order event stream did not rotate after its session lifetime")
	}

	body := recorder.Body.String()
	if !strings.Contains(body, "event: connected") {
		t.Fatalf("stream did not send connected event: %q", body)
	}
	if !strings.Contains(body, "event: reconnect") || !strings.Contains(body, `"reason":"revalidate"`) {
		t.Fatalf("stream did not request an access-revalidating reconnect: %q", body)
	}
}
