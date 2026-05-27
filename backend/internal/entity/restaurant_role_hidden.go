package entity

import "gorm.io/gorm"

type RestaurantRoleHidden struct {
	gorm.Model
	RestaurantID uint `json:"restaurant_id" gorm:"uniqueIndex:idx_restaurant_hidden_role"`
	RoleID       uint `json:"role_id" gorm:"uniqueIndex:idx_restaurant_hidden_role"`
}
