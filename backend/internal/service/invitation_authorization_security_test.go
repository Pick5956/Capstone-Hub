package service

import (
	"testing"

	"Project-M/internal/entity"
)

func TestInvitationManagerAuthorizationIsRestaurantSpecific(t *testing.T) {
	member := &entity.RestaurantMember{
		UserID:       7,
		RestaurantID: 12,
		Status:       "active",
		Role: &entity.Role{
			Name:        "manager",
			Permissions: `["manage_staff"]`,
		},
	}

	if !invitationManagerCanAct(member, 12) {
		t.Fatal("active manager with manage_staff permission was rejected for own restaurant")
	}
	if invitationManagerCanAct(member, 34) {
		t.Fatal("manager membership from restaurant 12 authorized an action in restaurant 34")
	}

	member.Status = "suspended"
	if invitationManagerCanAct(member, 12) {
		t.Fatal("suspended manager was authorized to manage invitations")
	}
}
