package entity

import "gorm.io/gorm"

type Role struct {
	gorm.Model
	Name        string `json:"name" gorm:"unique;not null" binding:"required"` // owner|manager|cashier|waiter|chef
	Permissions string `json:"permissions" gorm:"type:jsonb;default:'[]'"`     // JSON array of permission keys
}
