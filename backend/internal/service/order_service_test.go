package service

import (
	"encoding/json"
	"strings"
	"testing"

	"Project-M/internal/entity"
)

func TestOrderNumberForDate(t *testing.T) {
	cases := []struct {
		index int
		want  string
	}{
		{index: 1, want: "20260724-001"},
		{index: 15, want: "20260724-015"},
		{index: 999, want: "20260724-999"},
		{index: 1000, want: "20260724-1000"},
		{index: 0, want: "20260724-001"},
	}
	for _, tc := range cases {
		if got := orderNumberForDate("20260724", tc.index); got != tc.want {
			t.Fatalf("orderNumberForDate(20260724, %d) = %s, want %s", tc.index, got, tc.want)
		}
	}
}

func TestOrderListFiltersAndOrderNumberAreBounded(t *testing.T) {
	if err := ValidateOrderListFilters("active", "2026-07-24", "paid", "20260724-015"); err != nil {
		t.Fatalf("valid filters rejected: %v", err)
	}
	for _, filters := range [][4]string{
		{"unknown", "", "", ""},
		{"", "2026-02-30", "", ""},
		{"", "", "refunded", ""},
		{"", "", "", strings.Repeat("ก", 101)},
	} {
		if err := ValidateOrderListFilters(filters[0], filters[1], filters[2], filters[3]); err == nil {
			t.Fatalf("invalid filters accepted: %#v", filters)
		}
	}
	// New format plus legacy letter-prefixed numbers (kept valid for old orders).
	for _, valid := range []string{"20260724-015", "20260724-001", "20260724-1000", "A001", "Z999", "AA001"} {
		if !validOrderNumber(valid) {
			t.Fatalf("validOrderNumber(%q) = false", valid)
		}
	}
	for _, invalid := range []string{"", "A01", "a001", "001", "2026072-015", "20260724015", "20260724-01", "2026072a-015", "20260724-" + strings.Repeat("0", 30)} {
		if validOrderNumber(invalid) {
			t.Fatalf("validOrderNumber(%q) = true", invalid)
		}
	}
}

func TestOrderStatusFromItemsTreatsAlreadyServedItemsAsComplete(t *testing.T) {
	items := []entity.OrderItem{
		{Status: entity.OrderItemStatusServed},
		{Status: entity.OrderItemStatusReady},
	}
	if got := orderStatusFromItems(entity.OrderStatusCooking, items); got != entity.OrderStatusReady {
		t.Fatalf("mixed served/ready status = %q, want %q", got, entity.OrderStatusReady)
	}

	items[1].Status = entity.OrderItemStatusServed
	if got := orderStatusFromItems(entity.OrderStatusReady, items); got != entity.OrderStatusServed {
		t.Fatalf("all served status = %q, want %q", got, entity.OrderStatusServed)
	}
}

func TestNormalizeReceivedAmountRejectsNegativeCash(t *testing.T) {
	if _, err := normalizeReceivedAmount("cash", -1, 100); err == nil {
		t.Fatal("negative cash amount should be rejected")
	}
	if got, err := normalizeReceivedAmount("cash", 0, 100); err != nil || got != 100 {
		t.Fatalf("zero cash amount = %v, %v; want exact total", got, err)
	}
	if got, err := normalizeReceivedAmount("promptpay_qr", 1, 100); err != nil || got != 100 {
		t.Fatalf("PromptPay amount = %v, %v; want exact total", got, err)
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

func TestValidateOrderReadyForPaymentRequiresEveryActiveItemServed(t *testing.T) {
	order := &entity.Order{
		Status: entity.OrderStatusServed,
		Items: []entity.OrderItem{
			{Status: entity.OrderItemStatusServed},
			{Status: entity.OrderItemStatusPending},
		},
	}

	if err := validateOrderReadyForPayment(order); err == nil {
		t.Fatal("expected payment validation to reject an order with a pending item")
	}

	order.Items[1].Status = entity.OrderItemStatusCancelled
	if err := validateOrderReadyForPayment(order); err != nil {
		t.Fatalf("expected cancelled items to be ignored, got %v", err)
	}
}

func TestPendingItemReopensServedOrder(t *testing.T) {
	if got := orderStatusAfterPendingItemAdded(entity.OrderStatusServed); got != entity.OrderStatusOpen {
		t.Fatalf("served order status after adding pending item = %q, want %q", got, entity.OrderStatusOpen)
	}
	if got := orderStatusAfterPendingItemAdded(entity.OrderStatusCooking); got != entity.OrderStatusCooking {
		t.Fatalf("cooking order status after adding pending item = %q, want unchanged", got)
	}
}

func TestPaidBillUsesTaxAndServiceSnapshots(t *testing.T) {
	order := &entity.Order{
		Subtotal:                     100,
		TotalAmount:                  100,
		GrandTotal:                   117.7,
		ServiceChargeAmount:          10,
		VATAmount:                    7.7,
		PaymentStatus:                entity.PaymentStatusPaid,
		ServiceChargeEnabledSnapshot: true,
		ServiceChargeRateSnapshot:    10,
		VATEnabledSnapshot:           true,
		VATRateSnapshot:              7,
	}
	restaurant := &entity.Restaurant{
		ServiceChargeEnabled: false,
		ServiceChargeRate:    0,
		VATEnabled:           false,
		VATRate:              0,
	}

	bill := billFromOrder(order, restaurant)
	if !bill.ServiceChargeEnabled || bill.ServiceChargeRate != 10 {
		t.Fatalf("paid service snapshot = enabled %v rate %v", bill.ServiceChargeEnabled, bill.ServiceChargeRate)
	}
	if !bill.VATEnabled || bill.VATRate != 7 {
		t.Fatalf("paid VAT snapshot = enabled %v rate %v", bill.VATEnabled, bill.VATRate)
	}
}

func TestBuildOrderItemRecipeSnapshotsCopiesRecipeAndCostInputs(t *testing.T) {
	order := &entity.Order{RestaurantID: 7}
	order.ID = 11
	item := &entity.OrderItem{OrderID: order.ID, RestaurantID: order.RestaurantID, MenuID: 13}
	item.ID = 17
	ingredient := &entity.Ingredient{
		Name:         "Rice",
		Unit:         "g",
		CostPerUnit:  0.12,
		YieldPercent: 92,
	}
	ingredient.ID = 19
	components := []entity.MenuItemIngredient{{
		IngredientID: ingredient.ID,
		Quantity:     180,
		Unit:         "",
		Ingredient:   ingredient,
	}}

	snapshots := buildOrderItemRecipeSnapshots(order, item, components)
	if len(snapshots) != 1 {
		t.Fatalf("snapshot count = %d, want 1", len(snapshots))
	}
	got := snapshots[0]
	if got.OrderID != order.ID || got.OrderItemID != item.ID || got.MenuItemID != item.MenuID {
		t.Fatalf("snapshot references = %+v", got)
	}
	if got.IngredientID != ingredient.ID || got.IngredientName != ingredient.Name || got.Unit != ingredient.Unit {
		t.Fatalf("snapshot ingredient identity = %+v", got)
	}
	if got.QuantityPerItem != 180 || got.CostPerUnit != ingredient.CostPerUnit || got.YieldPercent != ingredient.YieldPercent {
		t.Fatalf("snapshot recipe inputs = %+v", got)
	}
}

func TestValidateCustomerSubmitRequestBounds(t *testing.T) {
	valid := &SubmitCustomerOrderRequest{
		Items: []CustomerCartItemRequest{{
			MenuID:            1,
			Quantity:          2,
			Note:              "less spicy",
			SelectedOptionIDs: []uint{3},
		}},
	}
	key := "550e8400-e29b-41d4-a716-446655440000"
	if err := validateCustomerSubmitRequest(key, valid); err != nil {
		t.Fatalf("valid request rejected: %v", err)
	}

	tests := []struct {
		name string
		key  string
		req  *SubmitCustomerOrderRequest
	}{
		{name: "short key", key: "short", req: valid},
		{name: "empty cart", key: key, req: &SubmitCustomerOrderRequest{}},
		{name: "zero quantity", key: key, req: &SubmitCustomerOrderRequest{Items: []CustomerCartItemRequest{{MenuID: 1}}}},
		{name: "quantity too large", key: key, req: &SubmitCustomerOrderRequest{Items: []CustomerCartItemRequest{{MenuID: 1, Quantity: customerOrderMaxItemQuantity + 1}}}},
		{name: "note too long", key: key, req: &SubmitCustomerOrderRequest{Items: []CustomerCartItemRequest{{MenuID: 1, Quantity: 1, Note: strings.Repeat("ก", customerOrderMaxItemNoteRunes+1)}}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateCustomerSubmitRequest(test.key, test.req); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestCustomerSubmissionHashCanonicalizesSelectedOptionOrder(t *testing.T) {
	left := &SubmitCustomerOrderRequest{Items: []CustomerCartItemRequest{{
		MenuID:            4,
		Quantity:          2,
		Note:              "  no onion ",
		SelectedOptionIDs: []uint{9, 2},
	}}}
	right := &SubmitCustomerOrderRequest{Items: []CustomerCartItemRequest{{
		MenuID:            4,
		Quantity:          2,
		Note:              "no onion",
		SelectedOptionIDs: []uint{2, 9},
	}}}

	if customerSubmissionHash(left) != customerSubmissionHash(right) {
		t.Fatal("semantically identical requests should have the same hash")
	}
	right.Items[0].Quantity = 3
	if customerSubmissionHash(left) == customerSubmissionHash(right) {
		t.Fatal("different requests should not have the same hash")
	}
}

func TestPublicCustomerDTOsOmitSensitiveFields(t *testing.T) {
	table := &entity.RestaurantTable{
		RestaurantID:     9,
		TableNumber:      "T01",
		DisplayLabel:     "1",
		Capacity:         4,
		CustomerToken:    "must-not-leak",
		ReservationName:  "private",
		ReservationPhone: "private",
	}
	table.ID = 5
	order := &entity.Order{
		RestaurantID:  9,
		TableID:       &table.ID,
		OrderNumber:   "A001",
		StaffID:       22,
		CustomerName:  "private",
		CustomerPhone: "private",
		Status:        entity.OrderStatusCooking,
		Items: []entity.OrderItem{{
			MenuName: "Rice",
			Quantity: 1,
			Subtotal: 50,
			Status:   entity.OrderItemStatusCooking,
		}},
	}
	order.ID = 8
	order.Items[0].ID = 13
	category := &entity.Category{
		RestaurantID: 9,
		Name:         "Rice dishes",
		DisplayOrder: 1,
		IsActive:     true,
	}
	category.ID = 21
	menu := entity.MenuItem{
		RestaurantID: 9,
		CategoryID:   category.ID,
		Category:     category,
		Name:         "Rice",
		Price:        50,
		IsAvailable:  true,
	}
	menu.ID = 34

	payload := struct {
		Table     CustomerTableDTO      `json:"table"`
		MenuItems []CustomerMenuItemDTO `json:"menu_items"`
		Order     *CustomerOrderDTO     `json:"order"`
	}{
		Table:     customerTableDTO(table),
		MenuItems: customerMenuItemDTOs([]entity.MenuItem{menu}),
		Order:     customerOrderDTO(order),
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal public DTO: %v", err)
	}
	serialized := string(data)
	for _, forbidden := range []string{
		"must-not-leak",
		"reservation_name",
		"reservation_phone",
		"customer_name",
		"customer_phone",
		"customer_token",
		"restaurant_id",
		"staff_id",
		"table_id",
	} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("public DTO leaked %q: %s", forbidden, serialized)
		}
	}
	if !strings.Contains(serialized, `"category":{"ID":21,"name":"Rice dishes"`) {
		t.Fatalf("public menu DTO omitted its safe primary category: %s", serialized)
	}
}
