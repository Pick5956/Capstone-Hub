package entity

import (
	"errors"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	FirstName    string `json:"first_name" binding:"required"`
	LastName     string `json:"last_name" binding:"required"`
	Password     string `json:"password" binding:"required"`
	BirthDay     string `json:"birthday"`
	Email        string `json:"email" gorm:"unique" binding:"required,email"`
	Address      string `json:"address"`
	ProfileImage string `json:"profile_image"`
	Phone        string `json:"phone"`
	RoleID       uint   `json:"role_id" binding:"required"`
	Role         *Role  `gorm:"foreignKey:RoleID" json:"role"`
}

func (u *User) Validation() error {
	if u.FirstName == "" {
		return errors.New("FirstName is required")
	}
	if u.LastName == "" {
		return errors.New("LastName is required")
	}
	if u.Password == "" {
		return errors.New("Password is required")
	}
	if u.Email == "" {
		return errors.New("Email is required")
	}
	if u.RoleID == 0 {
		return errors.New("RoleID is required")
	}
	return nil
}
