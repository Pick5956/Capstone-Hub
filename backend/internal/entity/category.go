package entity

import "gorm.io/gorm"

type Category struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index;index:idx_category_restaurant_active,priority:1;uniqueIndex:idx_category_restaurant_name,priority:1"`
	Name         string `json:"name" gorm:"not null;size:120;uniqueIndex:idx_category_restaurant_name,priority:2"`
	DisplayOrder int    `json:"display_order" gorm:"default:0"`
	IsActive     bool   `json:"is_active" gorm:"default:true;index:idx_category_restaurant_active,priority:2"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
}
