package service

import "testing"

func TestNormalizeResetToken(t *testing.T) {
	token, err := randomPassword()
	if err != nil {
		t.Fatalf("randomPassword() error = %v", err)
	}
	if normalized, err := normalizeResetToken("  " + token + "  "); err != nil || normalized != token {
		t.Fatalf("normalizeResetToken() = %q, %v; want generated token", normalized, err)
	}

	for _, invalid := range []string{"", "short", token + "x", token[:len(token)-1]} {
		if _, err := normalizeResetToken(invalid); err == nil {
			t.Fatalf("normalizeResetToken(%q) accepted invalid token", invalid)
		}
	}
}
