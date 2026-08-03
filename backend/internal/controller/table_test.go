package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"Project-M/internal/entity"

	"github.com/gin-gonic/gin"
)

func TestLegacySeatReservationEndpointIsGoneWithoutCallingTableService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/v1/tables/23/seat-reservation", nil)
	context.Params = gin.Params{{Key: "id", Value: "23"}}
	context.Set("restaurant_id", uint(7))
	context.Set("restaurant_member", &entity.RestaurantMember{
		Role: &entity.Role{Name: "custom", Permissions: `["take_order"]`},
	})

	// A nil service is intentional: this regression test proves the retired
	// endpoint returns before it can invoke any table mutation.
	controller := &TableController{}
	controller.SeatReservation(context)

	if recorder.Code != http.StatusGone {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusGone)
	}
	var response struct {
		Code  string `json:"code"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Code != "legacy_seat_reservation_retired" {
		t.Fatalf("code = %q, want legacy_seat_reservation_retired", response.Code)
	}
	if response.Error == "" {
		t.Fatal("error message must explain the supported seating path")
	}
}
