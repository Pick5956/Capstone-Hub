package service

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"
)

func TestMembershipResponseUsesSafeUserSummary(t *testing.T) {
	member := &entity.RestaurantMember{
		UserID:       8,
		RestaurantID: 4,
		RoleID:       2,
		Status:       "active",
		JoinedAt:     time.Now(),
		User: &entity.User{
			Email:        "staff@example.test",
			Password:     "unit-test-password",
			FirstName:    "Safe",
			LastName:     "Summary",
			Address:      "must not be exposed",
			BirthDay:     "2000-01-01",
			ProfileImage: "/avatar.png",
		},
		Role: &entity.Role{Name: "waiter", Permissions: `["take_order"]`},
	}

	payload, err := json.Marshal(NewMembershipResponse(member))
	if err != nil {
		t.Fatalf("marshal membership response: %v", err)
	}
	serialized := string(payload)
	for _, forbidden := range []string{"unit-test-password", "password", "must not be exposed", "birthday"} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("membership response exposed %q: %s", forbidden, serialized)
		}
	}
	for _, required := range []string{"staff@example.test", "take_order", "profile_image"} {
		if !strings.Contains(serialized, required) {
			t.Fatalf("membership response omitted %q: %s", required, serialized)
		}
	}
}

func TestInvitationResponsesExposeTokenOnlyToAuthorizedAdminShape(t *testing.T) {
	invitation := &entity.Invitation{
		RestaurantID: 3,
		RoleID:       2,
		Email:        "invitee@example.test",
		Token:        "unit-test-invitation-token",
		Status:       entity.InvitationStatusPending,
		Restaurant: &entity.Restaurant{
			Name:             "Test Restaurant",
			Address:          "Test Address",
			PromptPayName:    "must not be exposed",
			PromptPayQRImage: "must not be exposed",
		},
		Role: &entity.Role{
			Name:        "waiter",
			DisplayName: "Waiter",
			Permissions: `["take_order"]`,
		},
		InvitedBy: &entity.User{
			Email:    "manager@example.test",
			Password: "unit-test-password",
		},
	}

	publicPayload, err := json.Marshal(NewPublicInvitationResponse(invitation))
	if err != nil {
		t.Fatalf("marshal public invitation: %v", err)
	}
	publicSerialized := string(publicPayload)
	for _, forbidden := range []string{
		"unit-test-invitation-token",
		"invitee@example.test",
		"manager@example.test",
		"unit-test-password",
		"must not be exposed",
		"permissions",
	} {
		if strings.Contains(publicSerialized, forbidden) {
			t.Fatalf("public invitation exposed %q: %s", forbidden, publicSerialized)
		}
	}
	if !strings.Contains(publicSerialized, "i***@e***.test") {
		t.Fatalf("public invitation omitted masked email hint: %s", publicSerialized)
	}

	adminPayload, err := json.Marshal(NewAdminInvitationResponse(invitation))
	if err != nil {
		t.Fatalf("marshal admin invitation: %v", err)
	}
	adminSerialized := string(adminPayload)
	if !strings.Contains(adminSerialized, "unit-test-invitation-token") {
		t.Fatalf("admin invitation omitted its intentionally returned token: %s", adminSerialized)
	}
	if !strings.Contains(adminSerialized, "invitee@example.test") {
		t.Fatalf("admin invitation omitted the authorized full email: %s", adminSerialized)
	}
	for _, forbidden := range []string{"manager@example.test", "unit-test-password", "must not be exposed"} {
		if strings.Contains(adminSerialized, forbidden) {
			t.Fatalf("admin invitation exposed %q: %s", forbidden, adminSerialized)
		}
	}
}
