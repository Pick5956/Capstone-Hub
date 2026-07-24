package entity

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestUserPasswordNeverSerializes(t *testing.T) {
	payload, err := json.Marshal(User{
		Email:     "person@example.test",
		Password:  "unit-test-password",
		FirstName: "Test",
		LastName:  "User",
	})
	if err != nil {
		t.Fatalf("marshal user: %v", err)
	}

	if strings.Contains(string(payload), "password") || strings.Contains(string(payload), "unit-test-password") {
		t.Fatalf("serialized user exposed password material: %s", payload)
	}
}

func TestInvitationEntityDoesNotSerializeCredentialOrInviter(t *testing.T) {
	payload, err := json.Marshal(Invitation{
		Token: "unit-test-invitation-token",
		InvitedBy: &User{
			Email:    "manager@example.test",
			Password: "unit-test-password",
		},
	})
	if err != nil {
		t.Fatalf("marshal invitation: %v", err)
	}

	serialized := string(payload)
	for _, forbidden := range []string{"unit-test-invitation-token", `"invited_by":`, "manager@example.test", "unit-test-password"} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("serialized invitation exposed %q: %s", forbidden, serialized)
		}
	}
}
