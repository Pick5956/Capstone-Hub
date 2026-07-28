package entity

import (
	"time"

	"gorm.io/gorm"
)

const (
	InvitationStatusPending  = "pending"
	InvitationStatusAccepted = "accepted"
	InvitationStatusRevoked  = "revoked"
	InvitationStatusExpired  = "expired"
)

type Invitation struct {
	gorm.Model
	RestaurantID     uint       `json:"restaurant_id" gorm:"not null;index"`
	RoleID           uint       `json:"role_id" gorm:"not null;index"`
	Email            string     `json:"email"`                                                                                                                                    // optional — if set, only this email may accept
	Token            string     `json:"-" gorm:"size:32;uniqueIndex;not null"`                                                                                                    // random 32 chars
	ExpiresAt        *time.Time `json:"expires_at"`                                                                                                                               // optional
	Status           string     `json:"status" gorm:"size:16;not null;default:'pending';index;check:chk_invitations_status,status IN ('pending','accepted','revoked','expired')"` // pending|accepted|revoked|expired
	InvitedByUserID  uint       `json:"invited_by_user_id" gorm:"not null"`
	AcceptedAt       *time.Time `json:"accepted_at"`
	AcceptedByUserID *uint      `json:"accepted_by_user_id"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Role       *Role       `json:"role,omitempty" gorm:"foreignKey:RoleID"`
	InvitedBy  *User       `json:"-" gorm:"foreignKey:InvitedByUserID"`
}

// IsUsable reports whether the invitation can still be accepted.
func (i *Invitation) IsUsable() bool {
	if i.Status != InvitationStatusPending {
		return false
	}
	if i.ExpiresAt != nil && i.ExpiresAt.Before(time.Now()) {
		return false
	}
	return true
}
