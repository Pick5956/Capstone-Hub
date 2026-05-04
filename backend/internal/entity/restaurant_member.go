package entity

import (
	"time"

	"gorm.io/gorm"
)

type RestaurantMember struct {
	gorm.Model
	UserID          uint      `json:"user_id" gorm:"not null;uniqueIndex:idx_user_restaurant"`
	RestaurantID    uint      `json:"restaurant_id" gorm:"not null;uniqueIndex:idx_user_restaurant"`
	RoleID          uint      `json:"role_id" gorm:"not null"`
	Status          string    `json:"status" gorm:"default:'active'"` // active|suspended|removed
	JoinedAt        time.Time `json:"joined_at"`
	InvitedByUserID *uint     `json:"invited_by_user_id"`

	User       *User       `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Role       *Role       `json:"role,omitempty" gorm:"foreignKey:RoleID"`
}
