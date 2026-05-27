package entity

import "gorm.io/gorm"

type Role struct {
	gorm.Model
	RestaurantID *uint  `json:"restaurant_id,omitempty" gorm:"index"`
	Name         string `json:"name" gorm:"unique;not null" binding:"required"` // stable system/custom key
	DisplayName  string `json:"display_name" gorm:"not null;default:''"`
	Permissions  string `json:"permissions" gorm:"type:jsonb;default:'[]'"` // JSON array of permission keys
	IsSystem     bool   `json:"is_system" gorm:"not null;default:false"`
}
