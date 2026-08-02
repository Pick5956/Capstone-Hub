package entity

import (
	"time"

	"gorm.io/gorm"
)

const (
	// ReservationStatusActive is a reservation still holding the table.
	ReservationStatusActive = "active"
	// ReservationStatusSeated means the guests arrived and the table was opened.
	ReservationStatusSeated = "seated"
	// ReservationStatusCancelled means the reservation was cancelled / a no-show.
	ReservationStatusCancelled = "cancelled"
)

// Reservation records the lifecycle of a table booking so cancellations and
// no-shows can be reviewed later, independent of the order archive (a cancelled
// reservation never becomes an order).
type Reservation struct {
	gorm.Model
	RestaurantID     uint       `json:"restaurant_id" gorm:"not null;index:idx_reservations_restaurant_status,priority:1"`
	TableID          uint       `json:"table_id" gorm:"not null;index"`
	TableLabel       string     `json:"table_label" gorm:"size:64"`
	Name             string     `json:"name" gorm:"size:80"`
	Phone            string     `json:"phone" gorm:"size:32"`
	Status           string     `json:"status" gorm:"size:16;not null;default:'active';index:idx_reservations_restaurant_status,priority:2;check:chk_reservations_status,status IN ('active','seated','cancelled')"`
	ReservedByUserID uint       `json:"reserved_by_user_id"`
	ResolvedAt       *time.Time `json:"resolved_at"`

	Table *RestaurantTable `json:"table,omitempty" gorm:"foreignKey:TableID"`
	Staff *User            `json:"staff,omitempty" gorm:"foreignKey:ReservedByUserID"`
}
