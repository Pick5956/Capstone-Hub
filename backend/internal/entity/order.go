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

	OrderItemStatusPending   = "pending"
	OrderItemStatusCooking   = "cooking"
	OrderItemStatusReady     = "ready"
	OrderItemStatusServed    = "served"
	OrderItemStatusCancelled = "cancelled"
)

type Order struct {
	gorm.Model
	RestaurantID    uint       `json:"restaurant_id" gorm:"not null;index:idx_orders_restaurant_status_opened,priority:1;index:idx_orders_restaurant_table,priority:1;uniqueIndex:idx_orders_restaurant_day_number,priority:1"`
	TableID         uint       `json:"table_id" gorm:"not null;index:idx_orders_restaurant_table,priority:2"`
	OrderNumber     string     `json:"order_number" gorm:"not null;uniqueIndex:idx_orders_restaurant_day_number,priority:3"`
	OrderDate       string     `json:"order_date" gorm:"size:10;not null;uniqueIndex:idx_orders_restaurant_day_number,priority:2"`
	StaffID         uint       `json:"staff_id" gorm:"not null;index"`
	CustomerCount   int        `json:"customer_count" gorm:"default:1"`
	Status          string     `json:"status" gorm:"size:32;not null;default:'open';index:idx_orders_restaurant_status_opened,priority:2"`
	Subtotal        float64    `json:"subtotal" gorm:"not null;default:0"`
	DiscountAmount  float64    `json:"discount_amount" gorm:"not null;default:0"`
	TotalAmount     float64    `json:"total_amount" gorm:"not null;default:0"`
	Note            string     `json:"note"`
	OpenedAt        time.Time  `json:"opened_at" gorm:"not null;index:idx_orders_restaurant_status_opened,priority:3"`
	ClosedAt        *time.Time `json:"closed_at"`
	CancelledReason string     `json:"cancelled_reason"`
	Version         int        `json:"version" gorm:"not null;default:1"`

	Restaurant *Restaurant      `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Table      *RestaurantTable `json:"table,omitempty" gorm:"foreignKey:TableID"`
	Staff      *User            `json:"staff,omitempty" gorm:"foreignKey:StaffID"`
	Items      []OrderItem      `json:"items,omitempty" gorm:"foreignKey:OrderID"`
	StatusLogs []OrderStatusLog `json:"status_logs,omitempty" gorm:"foreignKey:OrderID"`
}

type OrderItem struct {
	gorm.Model
	OrderID         uint       `json:"order_id" gorm:"not null;index"`
	RestaurantID    uint       `json:"restaurant_id" gorm:"not null;index"`
	MenuID          uint       `json:"menu_id" gorm:"not null;index"`
	MenuName        string     `json:"menu_name" gorm:"not null"`
	UnitPrice       float64    `json:"unit_price" gorm:"not null"`
	Quantity        int        `json:"quantity" gorm:"not null"`
	Subtotal        float64    `json:"subtotal" gorm:"not null"`
	Note            string     `json:"note"`
	Status          string     `json:"status" gorm:"size:32;not null;default:'pending';index:idx_order_items_status_sent,priority:1"`
	SentAt          *time.Time `json:"sent_at" gorm:"index:idx_order_items_status_sent,priority:2"`
	ReadyAt         *time.Time `json:"ready_at"`
	ServedAt        *time.Time `json:"served_at"`
	CancelledReason string     `json:"cancelled_reason"`

	Order *Order    `json:"order,omitempty" gorm:"foreignKey:OrderID"`
	Menu  *MenuItem `json:"menu,omitempty" gorm:"foreignKey:MenuID"`
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
