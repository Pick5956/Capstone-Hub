package entity

import "gorm.io/gorm"

type TableTag struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index;uniqueIndex:idx_table_tag_restaurant_name,priority:1"`
	Name         string `json:"name" gorm:"not null;size:80;uniqueIndex:idx_table_tag_restaurant_name,priority:2"`
	Color        string `json:"color" gorm:"size:32;not null;default:'gray'"`
	DisplayOrder int    `json:"display_order" gorm:"default:0"`
	IsActive     bool   `json:"is_active" gorm:"default:true"`

	Restaurant *Restaurant       `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Tables     []RestaurantTable `json:"tables,omitempty" gorm:"many2many:restaurant_table_tags;"`
}
