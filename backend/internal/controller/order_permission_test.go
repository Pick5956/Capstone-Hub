package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"Project-M/internal/entity"

	"github.com/gin-gonic/gin"
)

func orderPermissionContext(permissions ...string) (*gin.Context, *httptest.ResponseRecorder) {
	return orderPermissionContextWithQuery("", permissions...)
}

func orderPermissionContextWithQuery(rawQuery string, permissions ...string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/v1/orders?"+rawQuery, nil)
	encoded, _ := json.Marshal(permissions)
	role := &entity.Role{Name: "custom", Permissions: string(encoded)}
	context.Set("restaurant_member", &entity.RestaurantMember{Role: role})
	return context, recorder
}

func TestOrderListAccessAllowsViewOrdersToReadFullArchive(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, rawQuery := range []string{"", "status=closed&include_summary=true", "status=active"} {
		context, recorder := orderPermissionContextWithQuery(rawQuery, "view_orders")
		if !requireOrderListAccess(context) {
			t.Fatalf("view_orders should grant full list access for query %q; status=%d", rawQuery, recorder.Code)
		}
	}
}

func TestOrderListAccessAllowsTakeOrderOnlyForOperationalQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, rawQuery := range []string{"status=active", "status=%20active%20&table_id=7", "status=active&include_summary=false"} {
		context, recorder := orderPermissionContextWithQuery(rawQuery, "take_order")
		if !requireOrderListAccess(context) {
			t.Fatalf("take_order should grant operational list access for query %q; status=%d", rawQuery, recorder.Code)
		}
	}
}

func TestNormalizedOrderListStatusIsSharedByPermissionAndRepositoryQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	context, _ := orderPermissionContextWithQuery("status=%20active%20", "take_order")
	if got := normalizedOrderListStatus(context); got != "active" {
		t.Fatalf("normalizedOrderListStatus() = %q, want active", got)
	}
}

func TestOrderListAccessRejectsArchiveAndSummaryForTakeOrder(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, rawQuery := range []string{"", "status=closed", "status=completed", "status=active&include_summary=true"} {
		context, recorder := orderPermissionContextWithQuery(rawQuery, "take_order")
		if requireOrderListAccess(context) {
			t.Fatalf("take_order must not grant archive/summary list access for query %q", rawQuery)
		}
		if recorder.Code != http.StatusForbidden {
			t.Fatalf("expected forbidden for query %q, got %d", rawQuery, recorder.Code)
		}
	}
}

func TestOrderListAccessRejectsTakePayment(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, rawQuery := range []string{"", "status=active", "status=closed&include_summary=true"} {
		context, recorder := orderPermissionContextWithQuery(rawQuery, "take_payment")
		if requireOrderListAccess(context) {
			t.Fatalf("take_payment alone must not grant list access for query %q", rawQuery)
		}
		if recorder.Code != http.StatusForbidden {
			t.Fatalf("expected forbidden for query %q, got %d", rawQuery, recorder.Code)
		}
	}
}

func TestOrderDetailAndBillReadAccessSupportsOperationalPermissions(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, permission := range []string{"view_orders", "take_order", "take_payment"} {
		context, recorder := orderPermissionContext(permission)
		if !requireOrderReadAccess(context) {
			t.Fatalf("%s should grant detail/bill access needed for its workflow; status=%d", permission, recorder.Code)
		}
	}
}

func TestOrderReadAccessRejectsUnrelatedPermission(t *testing.T) {
	gin.SetMode(gin.TestMode)

	context, recorder := orderPermissionContext("view_menu")
	if requireOrderReadAccess(context) {
		t.Fatal("an unrelated permission must not grant order read access")
	}
	if recorder.Code != 403 {
		t.Fatalf("expected forbidden response, got %d", recorder.Code)
	}
}

func TestFrontOfHouseCanServeOrVoidCheckoutItems(t *testing.T) {
	gin.SetMode(gin.TestMode)

	checkoutOrder := &entity.Order{Items: []entity.OrderItem{
		{Status: entity.OrderItemStatusCooking},
		{Status: entity.OrderItemStatusReady},
	}}
	context, recorder := orderPermissionContext("take_order")
	if !requireOrderItemStatusAccess(context, entity.OrderItemStatusServed, checkoutOrder) {
		t.Fatalf("take_order should allow serving; status=%d", recorder.Code)
	}

	context, recorder = orderPermissionContext("take_order")
	if !requireOrderItemStatusAccess(context, entity.OrderItemStatusCancelled, checkoutOrder) {
		t.Fatalf("take_order should allow voiding after every item is sent; status=%d", recorder.Code)
	}
}

func TestFrontOfHouseCannotPerformKitchenOnlyTransitions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	checkoutOrder := &entity.Order{Items: []entity.OrderItem{
		{Status: entity.OrderItemStatusCooking},
	}}

	for _, status := range []string{entity.OrderItemStatusCooking, entity.OrderItemStatusReady} {
		context, _ := orderPermissionContext("take_order")
		if requireOrderItemStatusAccess(context, status, checkoutOrder) {
			t.Fatalf("take_order must not allow kitchen-only transition to %s", status)
		}
	}
}

func TestFrontOfHouseCannotVoidBeforeCheckout(t *testing.T) {
	gin.SetMode(gin.TestMode)

	orderWithUnsentItems := &entity.Order{Items: []entity.OrderItem{
		{Status: entity.OrderItemStatusPending},
		{Status: entity.OrderItemStatusCooking},
	}}
	context, _ := orderPermissionContext("take_order")
	if requireOrderItemStatusAccess(context, entity.OrderItemStatusCancelled, orderWithUnsentItems) {
		t.Fatal("take_order must not void a sent item while the order still has unsent items")
	}
}

func TestKitchenUpdatePermissionStillAllowsEveryStatusTransition(t *testing.T) {
	gin.SetMode(gin.TestMode)
	orderWithUnsentItems := &entity.Order{Items: []entity.OrderItem{
		{Status: entity.OrderItemStatusPending},
	}}

	for _, status := range []string{
		entity.OrderItemStatusCooking,
		entity.OrderItemStatusReady,
		entity.OrderItemStatusServed,
		entity.OrderItemStatusCancelled,
	} {
		context, recorder := orderPermissionContext("update_order_status")
		if !requireOrderItemStatusAccess(context, status, orderWithUnsentItems) {
			t.Fatalf("update_order_status should allow %s; status=%d", status, recorder.Code)
		}
	}
}
