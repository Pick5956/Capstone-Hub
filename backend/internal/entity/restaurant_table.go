package entity

import "gorm.io/gorm"

const (
	TableStatusFree     = "free"
	TableStatusOccupied = "occupied"
	TableStatusReserved = "reserved"
	TableStatusInactive = "inactive"
)

type RestaurantTable struct {
	gorm.Model
	RestaurantID     uint   `json:"restaurant_id" gorm:"not null;index;index:idx_restaurant_tables_layout,priority:1"`
	ZoneID           *uint  `json:"zone_id" gorm:"index;index:idx_restaurant_tables_layout,priority:2"`
	TableNumber      string `json:"table_number" gorm:"not null"`
	DisplayLabel     string `json:"display_label"`
	SequenceNumber   int    `json:"sequence_number" gorm:"not null;default:0;index;index:idx_restaurant_tables_layout,priority:3"`
	Capacity         int    `json:"capacity" gorm:"default:2"`
	Zone             string `json:"zone"`
	Status           string `json:"status" gorm:"default:'free'"`
	CustomerToken    string `json:"customer_token" gorm:"size:64;uniqueIndex"`
	ReservationName  string `json:"reservation_name" gorm:"size:80"`
	ReservationPhone string `json:"reservation_phone" gorm:"size:32"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	TableZone  *TableZone  `json:"table_zone,omitempty" gorm:"foreignKey:ZoneID"`
	Tags       []TableTag  `json:"tags,omitempty" gorm:"many2many:restaurant_table_tags;"`
}
