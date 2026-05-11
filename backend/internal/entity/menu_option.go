package entity

import "gorm.io/gorm"

type MenuOptionGroup struct {
	gorm.Model
	RestaurantID uint `json:"restaurant_id" gorm:"not null;index"`
	MenuItemID   uint `json:"menu_item_id" gorm:"not null;index"`

	Name         string `json:"name" gorm:"not null"`
	Required     bool   `json:"required" gorm:"default:false"`
	MinSelect    int    `json:"min_select" gorm:"default:0"`
	MaxSelect    int    `json:"max_select" gorm:"default:1"`
	DisplayOrder int    `json:"display_order" gorm:"default:0"`
	IsActive     bool   `json:"is_active" gorm:"default:true"`

	MenuItem *MenuItem    `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
	Options  []MenuOption `json:"options,omitempty" gorm:"foreignKey:OptionGroupID"`
}

type MenuOption struct {
	gorm.Model
	RestaurantID  uint `json:"restaurant_id" gorm:"not null;index"`
	MenuItemID    uint `json:"menu_item_id" gorm:"not null;index"`
	OptionGroupID uint `json:"option_group_id" gorm:"not null;index"`

	Name         string  `json:"name" gorm:"not null"`
	PriceDelta   float64 `json:"price_delta" gorm:"not null;default:0"`
	IsDefault    bool    `json:"is_default" gorm:"default:false"`
	DisplayOrder int     `json:"display_order" gorm:"default:0"`
	IsActive     bool    `json:"is_active" gorm:"default:true"`

	OptionGroup *MenuOptionGroup `json:"option_group,omitempty" gorm:"foreignKey:OptionGroupID"`
	MenuItem    *MenuItem        `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
}
