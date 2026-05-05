package entity

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Email                  string     `json:"email" gorm:"uniqueIndex:idx_users_email_provider;not null" binding:"required,email"`
	Password               string     `json:"password,omitempty"`
	AuthProvider           string     `json:"auth_provider" gorm:"uniqueIndex:idx_users_email_provider;default:'local';not null"`
	GoogleID               *string    `json:"-" gorm:"uniqueIndex"`
	FirstName              string     `json:"first_name" binding:"required"`
	LastName               string     `json:"last_name" binding:"required"`
	Nickname               string     `json:"nickname"`
	Phone                  string     `json:"phone"`
	Address                string     `json:"address"`
	BirthDay               string     `json:"birthday"`
	ProfileImage           string     `json:"profile_image"`
	Status                 string     `json:"status" gorm:"default:'active'"` // active|inactive|suspended
	PasswordResetTokenHash string     `json:"-"`
	PasswordResetExpiresAt *time.Time `json:"-"`
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
