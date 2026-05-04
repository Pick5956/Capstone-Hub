package entity

import "gorm.io/gorm"

const (
	TableStatusFree     = "free"
	TableStatusOccupied = "occupied"
	TableStatusReserved = "reserved"
)

type RestaurantTable struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index"`
	TableNumber  string `json:"table_number" gorm:"not null"`
	Capacity     int    `json:"capacity" gorm:"default:2"`
	Zone         string `json:"zone"`
	Status       string `json:"status" gorm:"default:'free'"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
}
