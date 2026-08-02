package entity

import (
	"reflect"
	"strings"
	"testing"
)

func requireGORMTagContains(t *testing.T, model any, fieldName string, fragments ...string) {
	t.Helper()
	field, ok := reflect.TypeOf(model).FieldByName(fieldName)
	if !ok {
		t.Fatalf("%T.%s does not exist", model, fieldName)
	}
	tag := field.Tag.Get("gorm")
	for _, fragment := range fragments {
		if !strings.Contains(tag, fragment) {
			t.Fatalf("%T.%s gorm tag %q does not contain %q", model, fieldName, tag, fragment)
		}
	}
}

func TestOrderPaymentEnforcesOnePaymentPerOrder(t *testing.T) {
	requireGORMTagContains(t, OrderPayment{}, "OrderID", "uniqueIndex:idx_order_payments_one_per_order")
}

func TestOrderEnforcesOneActiveOrderPerTable(t *testing.T) {
	requireGORMTagContains(t, Order{}, "RestaurantID", "uniqueIndex:idx_orders_one_active_table", "where:")
	requireGORMTagContains(t, Order{}, "TableID", "uniqueIndex:idx_orders_one_active_table")
}

func TestCustomerSubmissionIdempotencyConstraint(t *testing.T) {
	requireGORMTagContains(t, CustomerOrderSubmission{}, "OrderID", "uniqueIndex:idx_customer_order_request")
	requireGORMTagContains(t, CustomerOrderSubmission{}, "RequestKey", "uniqueIndex:idx_customer_order_request")
}

func TestOrderItemRecipeSnapshotConstraint(t *testing.T) {
	requireGORMTagContains(t, OrderItemRecipeSnapshot{}, "OrderItemID", "uniqueIndex:idx_order_item_recipe_snapshot")
	requireGORMTagContains(t, OrderItemRecipeSnapshot{}, "IngredientID", "uniqueIndex:idx_order_item_recipe_snapshot")
}

func TestOrderReportingIndexIncludesCompletionTime(t *testing.T) {
	requireGORMTagContains(t, Order{}, "RestaurantID", "index:idx_orders_reporting,priority:1")
	requireGORMTagContains(t, Order{}, "Status", "index:idx_orders_reporting,priority:2")
	requireGORMTagContains(t, Order{}, "PaymentStatus", "index:idx_orders_reporting,priority:3")
	requireGORMTagContains(t, Order{}, "CompletedAt", "index:idx_orders_reporting,priority:4")
}

func TestOrderMoneyAndQuantityFieldsHaveDatabaseConstraints(t *testing.T) {
	for _, field := range []string{
		"Subtotal",
		"DiscountAmount",
		"ServiceChargeAmount",
		"VATAmount",
		"TotalAmount",
		"GrandTotal",
	} {
		requireGORMTagContains(t, Order{}, field, "type:numeric(14,2)", "check:")
	}
	requireGORMTagContains(t, Order{}, "CustomerCount", "check:")
	requireGORMTagContains(t, OrderItem{}, "Quantity", "check:")
	requireGORMTagContains(t, OrderInventoryDeduction{}, "Quantity", "type:numeric(18,6)", "check:")
}

func TestPaymentStatusConstantsMatchPersistedValues(t *testing.T) {
	if PaymentStatusUnpaid != "unpaid" || PaymentStatusPaid != "paid" {
		t.Fatalf("unexpected payment status constants: unpaid=%q paid=%q", PaymentStatusUnpaid, PaymentStatusPaid)
	}
}
