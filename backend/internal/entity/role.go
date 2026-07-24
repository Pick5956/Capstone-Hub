package entity

import "gorm.io/gorm"

type Role struct {
	gorm.Model
	RestaurantID *uint  `json:"restaurant_id,omitempty" gorm:"index;uniqueIndex:idx_roles_restaurant_name,priority:1,where:restaurant_id IS NOT NULL AND deleted_at IS NULL"`
	Name         string `json:"name" gorm:"not null;uniqueIndex:idx_roles_restaurant_name,priority:2,where:restaurant_id IS NOT NULL AND deleted_at IS NULL;uniqueIndex:idx_roles_system_name,where:restaurant_id IS NULL AND deleted_at IS NULL" binding:"required"` // stable system/custom key
	DisplayName  string `json:"display_name" gorm:"not null;default:''"`
	Permissions  string `json:"permissions" gorm:"type:jsonb;default:'[]'"` // JSON array of permission keys
	IsSystem     bool   `json:"is_system" gorm:"not null;default:false"`
}

// RestaurantRolePermissionOverride stores tenant-specific permissions for a
// global system role. Global role defaults must never be mutated by one tenant.
type RestaurantRolePermissionOverride struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;uniqueIndex:idx_restaurant_role_permission_override"`
	RoleID       uint   `json:"role_id" gorm:"not null;uniqueIndex:idx_restaurant_role_permission_override"`
	Permissions  string `json:"permissions" gorm:"type:jsonb;not null;default:'[]'"`

	Restaurant *Restaurant `json:"-" gorm:"foreignKey:RestaurantID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Role       *Role       `json:"-" gorm:"foreignKey:RoleID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}
