package entity

import "gorm.io/gorm"

type TableZone struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index"`
	Name         string `json:"name" gorm:"not null"`
	Prefix       string `json:"prefix" gorm:"uniqueIndex:idx_table_zones_restaurant_prefix,priority:2"`
	DisplayOrder int    `json:"display_order" gorm:"default:0"`
	IsActive     bool   `json:"is_active" gorm:"default:true"`

	Restaurant *Restaurant       `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Tables     []RestaurantTable `json:"tables,omitempty" gorm:"foreignKey:ZoneID"`
}
