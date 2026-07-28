package service

import (
	"strings"
	"testing"
)

func TestNormalizeInvitationToken(t *testing.T) {
	token, err := generateInviteToken()
	if err != nil {
		t.Fatalf("generateInviteToken() error = %v", err)
	}
	if normalized, err := normalizeInvitationToken("  " + token + "  "); err != nil || normalized != token {
		t.Fatalf("normalizeInvitationToken() = %q, %v; want generated token", normalized, err)
	}

	for _, invalid := range []string{
		"",
		"short",
		strings.Repeat("a", len(token)-1),
		strings.Repeat("a", len(token)+1),
		strings.Repeat("*", len(token)),
	} {
		if _, err := normalizeInvitationToken(invalid); err == nil {
			t.Fatalf("normalizeInvitationToken(%q) accepted invalid token", invalid)
		}
	}
}
