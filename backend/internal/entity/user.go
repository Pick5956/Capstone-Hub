package entity

import (
	"errors"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Email        string `json:"email" gorm:"unique;not null" binding:"required,email"`
	Password     string `json:"password,omitempty"`
	FirstName    string `json:"first_name" binding:"required"`
	LastName     string `json:"last_name" binding:"required"`
	Nickname     string `json:"nickname"`
	Phone        string `json:"phone"`
	Address      string `json:"address"`
	BirthDay     string `json:"birthday"`
	ProfileImage string `json:"profile_image"`
	Status       string `json:"status" gorm:"default:'active'"` // active|inactive|suspended
}

func (u *User) Validation() error {
	if u.FirstName == "" {
		return errors.New("FirstName is required")
	}
	if u.LastName == "" {
		return errors.New("LastName is required")
	}
	if u.Email == "" {
		return errors.New("Email is required")
	}
	return nil
}
