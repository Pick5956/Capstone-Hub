package entity

import (
	"time"

	"gorm.io/gorm"
)

const (
	OrderStatusOpen          = "open"
	OrderStatusSentToKitchen = "sent_to_kitchen"
	OrderStatusCooking       = "cooking"
	OrderStatusReady         = "ready"
	OrderStatusServed        = "served"
	OrderStatusCompleted     = "completed"
	OrderStatusCancelled     = "cancelled"

	OrderTypeDineIn   = "dine_in"
	OrderTypeTakeaway = "takeaway"

	OrderItemFulfillmentDineIn   = "dine_in"
	OrderItemFulfillmentTakeaway = "takeaway"

	OrderItemStatusPending   = "pending"
	OrderItemStatusCooking   = "cooking"
	OrderItemStatusReady     = "ready"
	OrderItemStatusServed    = "served"
	OrderItemStatusCancelled = "cancelled"
)

type Order struct {
	gorm.Model
	RestaurantID        uint       `json:"restaurant_id" gorm:"not null;index:idx_orders_restaurant_status_opened,priority:1;index:idx_orders_restaurant_table,priority:1;index:idx_orders_restaurant_table_opened,priority:1;index:idx_orders_restaurant_number_date,priority:1;uniqueIndex:idx_orders_restaurant_day_number_v2,priority:1"`
	TableID             *uint      `json:"table_id" gorm:"index:idx_orders_restaurant_table,priority:2;index:idx_orders_restaurant_table_opened,priority:2"`
	OrderType           string     `json:"order_type" gorm:"size:32;not null;default:'dine_in';index"`
	OrderNumber         string     `json:"order_number" gorm:"not null;index:idx_orders_restaurant_number_date,priority:2;uniqueIndex:idx_orders_restaurant_day_number_v2,priority:3"`
	OrderDate           string     `json:"order_date" gorm:"size:10;not null;index:idx_orders_restaurant_number_date,priority:3;uniqueIndex:idx_orders_restaurant_day_number_v2,priority:2"`
	StaffID             uint       `json:"staff_id" gorm:"not null;index"`
	CustomerCount       int        `json:"customer_count" gorm:"default:1"`
	CustomerName        string     `json:"customer_name" gorm:"size:80"`
	CustomerPhone       string     `json:"customer_phone" gorm:"size:32"`
	Status              string     `json:"status" gorm:"size:32;not null;default:'open';index:idx_orders_restaurant_status_opened,priority:2"`
	Subtotal            float64    `json:"subtotal" gorm:"not null;default:0"`
	DiscountAmount      float64    `json:"discount_amount" gorm:"not null;default:0"`
	ServiceChargeAmount float64    `json:"service_charge_amount" gorm:"not null;default:0"`
	VATAmount           float64    `json:"vat_amount" gorm:"not null;default:0"`
	TotalAmount         float64    `json:"total_amount" gorm:"not null;default:0"`
	GrandTotal          float64    `json:"grand_total" gorm:"not null;default:0"`
	PaymentStatus       string     `json:"payment_status" gorm:"size:32;not null;default:'unpaid';index"`
	Note                string     `json:"note"`
	OpenedAt            time.Time  `json:"opened_at" gorm:"not null;index:idx_orders_restaurant_status_opened,priority:3;index:idx_orders_restaurant_table_opened,priority:3"`
	ClosedAt            *time.Time `json:"closed_at"`
	CancelledReason     string     `json:"cancelled_reason"`
	Version             int        `json:"version" gorm:"not null;default:1"`
	KitchenTicketID     string     `json:"kitchen_ticket_id,omitempty" gorm:"-"`
	KitchenBatch        uint       `json:"kitchen_batch,omitempty" gorm:"-"`
	KitchenSentAt       *time.Time `json:"kitchen_sent_at,omitempty" gorm:"-"`

	Restaurant *Restaurant               `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Table      *RestaurantTable          `json:"table,omitempty" gorm:"foreignKey:TableID"`
	Staff      *User                     `json:"staff,omitempty" gorm:"foreignKey:StaffID"`
	Items      []OrderItem               `json:"items,omitempty" gorm:"foreignKey:OrderID"`
	Payments   []OrderPayment            `json:"payments,omitempty" gorm:"foreignKey:OrderID"`
	StatusLogs []OrderStatusLog          `json:"status_logs,omitempty" gorm:"foreignKey:OrderID"`
	Deductions []OrderInventoryDeduction `json:"deductions,omitempty" gorm:"foreignKey:OrderID"`
}

type OrderItem struct {
	gorm.Model
	OrderID         uint       `json:"order_id" gorm:"not null;index;index:idx_order_items_order_status_batch,priority:1"`
	RestaurantID    uint       `json:"restaurant_id" gorm:"not null;index;index:idx_order_items_restaurant_status,priority:1"`
	MenuID          uint       `json:"menu_id" gorm:"not null;index"`
	MenuName        string     `json:"menu_name" gorm:"not null"`
	UnitPrice       float64    `json:"unit_price" gorm:"not null"`
	OptionsTotal    float64    `json:"options_total" gorm:"not null;default:0"`
	Quantity        int        `json:"quantity" gorm:"not null"`
	Subtotal        float64    `json:"subtotal" gorm:"not null"`
	FulfillmentType string     `json:"fulfillment_type" gorm:"size:32;not null;default:'dine_in';index"`
	Note            string     `json:"note"`
	Status          string     `json:"status" gorm:"size:32;not null;default:'pending';index:idx_order_items_status_sent,priority:1;index:idx_order_items_order_status_batch,priority:2;index:idx_order_items_restaurant_status,priority:2"`
	SentAt          *time.Time `json:"sent_at" gorm:"index:idx_order_items_status_sent,priority:2"`
	KitchenBatch    uint       `json:"kitchen_batch" gorm:"not null;default:0;index;index:idx_order_items_order_status_batch,priority:3"`
	ReadyAt         *time.Time `json:"ready_at"`
	ServedAt        *time.Time `json:"served_at"`
	CancelledReason string     `json:"cancelled_reason"`

	Order           *Order                    `json:"order,omitempty" gorm:"foreignKey:OrderID"`
	Menu            *MenuItem                 `json:"menu,omitempty" gorm:"foreignKey:MenuID"`
	SelectedOptions []OrderItemOption         `json:"selected_options,omitempty" gorm:"foreignKey:OrderItemID"`
	Deductions      []OrderInventoryDeduction `json:"deductions,omitempty" gorm:"foreignKey:OrderItemID"`
}

type OrderStatusLog struct {
	gorm.Model
	OrderID    uint      `json:"order_id" gorm:"not null;index"`
	FromStatus string    `json:"from_status"`
	ToStatus   string    `json:"to_status" gorm:"not null"`
	ChangedBy  uint      `json:"changed_by" gorm:"not null;index"`
	ChangedAt  time.Time `json:"changed_at" gorm:"not null"`
	Note       string    `json:"note"`

	Order *Order `json:"order,omitempty" gorm:"foreignKey:OrderID"`
	User  *User  `json:"user,omitempty" gorm:"foreignKey:ChangedBy"`
}

type OrderPayment struct {
	gorm.Model
	OrderID        uint      `json:"order_id" gorm:"not null;index"`
	RestaurantID   uint      `json:"restaurant_id" gorm:"not null;index"`
	Method         string    `json:"method" gorm:"size:32;not null"`
	Amount         float64   `json:"amount" gorm:"not null"`
	ReceivedAmount float64   `json:"received_amount" gorm:"not null;default:0"`
	ChangeAmount   float64   `json:"change_amount" gorm:"not null;default:0"`
	Note           string    `json:"note"`
	PaidBy         uint      `json:"paid_by" gorm:"not null;index"`
	PaidAt         time.Time `json:"paid_at" gorm:"not null"`

	Order *Order `json:"order,omitempty" gorm:"foreignKey:OrderID"`
	User  *User  `json:"user,omitempty" gorm:"foreignKey:PaidBy"`
}

type OrderInventoryDeduction struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index"`
	OrderID      uint    `json:"order_id" gorm:"not null;uniqueIndex:idx_order_deduction_once,priority:1"`
	OrderItemID  uint    `json:"order_item_id" gorm:"not null;uniqueIndex:idx_order_deduction_once,priority:2"`
	MenuItemID   uint    `json:"menu_item_id" gorm:"not null;index"`
	IngredientID uint    `json:"ingredient_id" gorm:"not null;uniqueIndex:idx_order_deduction_once,priority:3"`
	Quantity     float64 `json:"quantity" gorm:"not null"`
	CostSnapshot float64 `json:"cost_snapshot" gorm:"not null;default:0"`
	Note         string  `json:"note"`
	CreatedByID  uint    `json:"created_by_id"`

	Order      *Order      `json:"order,omitempty" gorm:"foreignKey:OrderID"`
	OrderItem  *OrderItem  `json:"order_item,omitempty" gorm:"foreignKey:OrderItemID"`
	Ingredient *Ingredient `json:"ingredient,omitempty" gorm:"foreignKey:IngredientID"`
	CreatedBy  *User       `json:"created_by,omitempty" gorm:"foreignKey:CreatedByID"`
}
