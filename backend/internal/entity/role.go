package entity

import "gorm.io/gorm"

type Role struct {
	gorm.Model
	RestaurantID *uint  `json:"restaurant_id,omitempty" gorm:"index;uniqueIndex:idx_roles_restaurant_name,priority:1,where:restaurant_id IS NOT NULL AND deleted_at IS NULL"`
	Name         string `json:"name" gorm:"not null;uniqueIndex:idx_roles_restaurant_name,priority:2,where:restaurant_id IS NOT NULL AND deleted_at IS NULL;uniqueIndex:idx_roles_system_name,where:restaurant_id IS NULL AND deleted_at IS NULL" binding:"required"` // stable system/custom key
	DisplayName  string `json:"display_name" gorm:"not null;default:''"`
	// DisplayNameOverride is populated only on scoped reads of a global system
	// role. It lets clients distinguish a restaurant rename from the seeded
	// English display name while keeping the persisted global role untouched.
	DisplayNameOverride *string `json:"display_name_override,omitempty" gorm:"-"`
	Permissions         string  `json:"permissions" gorm:"type:jsonb;default:'[]'"` // JSON array of permission keys
	IsSystem            bool    `json:"is_system" gorm:"not null;default:false"`
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

// RestaurantRoleDisplayNameOverride stores a restaurant's display-only name
// for a global system role. Role.Name remains the stable authorization key and
// Role.DisplayName remains the shared seeded default.
type RestaurantRoleDisplayNameOverride struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;uniqueIndex:idx_restaurant_role_display_name_override,priority:1"`
	RoleID       uint   `json:"role_id" gorm:"not null;uniqueIndex:idx_restaurant_role_display_name_override,priority:2"`
	DisplayName  string `json:"display_name" gorm:"not null"`

	Restaurant *Restaurant `json:"-" gorm:"foreignKey:RestaurantID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Role       *Role       `json:"-" gorm:"foreignKey:RoleID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}
