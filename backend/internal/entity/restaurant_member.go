package entity

import (
	"time"

	"gorm.io/gorm"
)

type RestaurantMember struct {
	gorm.Model
	UserID              uint      `json:"user_id" gorm:"not null;uniqueIndex:idx_user_restaurant,where:deleted_at IS NULL"`
	RestaurantID        uint      `json:"restaurant_id" gorm:"not null;uniqueIndex:idx_user_restaurant,where:deleted_at IS NULL"`
	RoleID              uint      `json:"role_id" gorm:"not null;index"`
	Status              string    `json:"status" gorm:"size:16;not null;default:'active';check:chk_restaurant_members_status,status IN ('active','suspended','removed')"` // active|suspended|removed
	PermissionsOverride *string   `json:"permissions_override,omitempty" gorm:"type:jsonb"`
	JoinedAt            time.Time `json:"joined_at"`
	InvitedByUserID     *uint     `json:"invited_by_user_id"`

	User       *User       `json:"-" gorm:"foreignKey:UserID"`
	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Role       *Role       `json:"role,omitempty" gorm:"foreignKey:RoleID"`
}
