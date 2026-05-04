package entity

import "gorm.io/gorm"

type Restaurant struct {
	gorm.Model
	Name           string `json:"name" gorm:"not null" binding:"required"`
	BranchName     string `json:"branch_name" gorm:"size:120;default:'สาขาหลัก'"`
	RestaurantType string `json:"restaurant_type" gorm:"size:80;default:'ร้านอาหาร'"`
	Address        string `json:"address"`
	Phone          string `json:"phone"`
	Logo           string `json:"logo"`
	OpenTime       string `json:"open_time" gorm:"size:5;default:'17:00'"`
	CloseTime      string `json:"close_time" gorm:"size:5;default:'00:00'"`
	TableCount     int    `json:"table_count" gorm:"default:12"`
	OwnerID        uint   `json:"owner_id" gorm:"not null"`
	Owner          *User  `json:"owner,omitempty" gorm:"foreignKey:OwnerID"`
}
