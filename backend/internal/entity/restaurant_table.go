package entity

import "gorm.io/gorm"

const (
	TableStatusFree     = "free"
	TableStatusOccupied = "occupied"
	TableStatusReserved = "reserved"
)

type RestaurantTable struct {
	gorm.Model
	RestaurantID   uint   `json:"restaurant_id" gorm:"not null;index"`
	ZoneID         *uint  `json:"zone_id" gorm:"index"`
	TableNumber    string `json:"table_number" gorm:"not null"`
	DisplayLabel   string `json:"display_label"`
	SequenceNumber int    `json:"sequence_number" gorm:"not null;default:0;index"`
	Capacity       int    `json:"capacity" gorm:"default:2"`
	Zone           string `json:"zone"`
	Status         string `json:"status" gorm:"default:'free'"`
	CustomerToken  string `json:"customer_token" gorm:"size:64;uniqueIndex"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	TableZone  *TableZone  `json:"table_zone,omitempty" gorm:"foreignKey:ZoneID"`
	Tags       []TableTag  `json:"tags,omitempty" gorm:"many2many:restaurant_table_tags;"`
}
