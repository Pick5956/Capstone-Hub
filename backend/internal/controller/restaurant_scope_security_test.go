package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequireScopedRestaurantParamRejectsHeaderPathMismatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Set("restaurant_id", uint(12))
	context.Params = gin.Params{{Key: "id", Value: "34"}}

	if _, ok := requireScopedRestaurantParam(context, "id"); ok {
		t.Fatal("requireScopedRestaurantParam() accepted a different path restaurant")
	}
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestRequireScopedRestaurantParamAcceptsMatchingRestaurant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Set("restaurant_id", uint(12))
	context.Params = gin.Params{{Key: "id", Value: "12"}}

	restaurantID, ok := requireScopedRestaurantParam(context, "id")
	if !ok {
		t.Fatalf("requireScopedRestaurantParam() rejected matching restaurant, status %d", recorder.Code)
	}
	if restaurantID != 12 {
		t.Fatalf("restaurant id = %d, want 12", restaurantID)
	}
}
