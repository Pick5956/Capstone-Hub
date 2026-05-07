package entity

import "gorm.io/gorm"

type MenuItem struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index"`
	CategoryID   uint    `json:"category_id" gorm:"not null;index"`
	Name         string  `json:"name" gorm:"not null"`
	Price        float64 `json:"price" gorm:"not null"`
	ImageURL     string  `json:"image_url"`
	Description  string  `json:"description"`
	IsAvailable  bool    `json:"is_available" gorm:"default:true"`
	DisplayOrder int     `json:"display_order" gorm:"default:0"`

	Restaurant   *Restaurant       `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Category     *Category         `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	OptionGroups []MenuOptionGroup `json:"option_groups,omitempty" gorm:"foreignKey:MenuItemID"`
}
