package entity

import "gorm.io/gorm"

type OrderItemOption struct {
	gorm.Model
	OrderItemID   uint `json:"order_item_id" gorm:"not null;index"`
	OrderID       uint `json:"order_id" gorm:"not null;index"`
	RestaurantID  uint `json:"restaurant_id" gorm:"not null;index"`
	MenuOptionID  uint `json:"menu_option_id" gorm:"not null;index"`
	OptionGroupID uint `json:"option_group_id" gorm:"not null;index"`

	GroupName  string  `json:"group_name" gorm:"not null"`
	OptionName string  `json:"option_name" gorm:"not null"`
	PriceDelta float64 `json:"price_delta" gorm:"not null;default:0"`

	OrderItem *OrderItem `json:"order_item,omitempty" gorm:"foreignKey:OrderItemID"`
	Order     *Order     `json:"order,omitempty" gorm:"foreignKey:OrderID"`
}
