package auth

import (
	"testing"

	"Project-M/internal/entity"
)

func TestClaimsMatchOnlyActiveUserAtCurrentTokenVersion(t *testing.T) {
	claims := &JwtClaims{UserID: 7, TokenVersion: 3}

	tests := []struct {
		name string
		user *entity.User
		want bool
	}{
		{
			name: "active matching user",
			user: &entity.User{Status: "active", TokenVersion: 3},
			want: true,
		},
		{
			name: "inactive user",
			user: &entity.User{Status: "inactive", TokenVersion: 3},
			want: false,
		},
		{
			name: "suspended user",
			user: &entity.User{Status: "suspended", TokenVersion: 3},
			want: false,
		},
		{
			name: "stale token version",
			user: &entity.User{Status: "active", TokenVersion: 4},
			want: false,
		},
		{
			name: "missing user",
			user: nil,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := claimsMatchActiveUser(tt.user, claims); got != tt.want {
				t.Fatalf("claimsMatchActiveUser() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestJWTIncludesTokenVersion(t *testing.T) {
	wrapper := &JwtWrapper{
		SecretKey: "unit-test-only-key-not-a-real-secret-12345",
		Issuer:    Issuer,
	}

	token, err := wrapper.GenerateToken(9, "user", 5)
	if err != nil {
		t.Fatalf("GenerateToken() error = %v", err)
	}
	claims, err := wrapper.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}
	if claims.TokenVersion != 5 {
		t.Fatalf("token version = %d, want 5", claims.TokenVersion)
	}
}
