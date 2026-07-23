package service

import (
	"strings"
	"testing"
)

func TestNormalizeCapacityBounds(t *testing.T) {
	if got, err := normalizeCapacity(0); err != nil || got != 2 {
		t.Fatalf("normalizeCapacity(0) = %d, %v; want 2, nil", got, err)
	}
	for _, value := range []int{-1, 51} {
		if _, err := normalizeCapacity(value); err == nil {
			t.Fatalf("normalizeCapacity(%d) should reject out-of-range value", value)
		}
	}
}

func TestReservationPhoneValidation(t *testing.T) {
	if !isValidReservationPhone("081-234-5678") {
		t.Fatal("valid Thai-style phone should be accepted")
	}
	if isValidReservationPhone("12345") {
		t.Fatal("short phone should be rejected")
	}
}

func TestCustomerTableTokenIsStrongAndStrictlyValidated(t *testing.T) {
	token, err := GenerateCustomerTableToken()
	if err != nil {
		t.Fatalf("GenerateCustomerTableToken() error = %v", err)
	}
	if len(token) != customerTableTokenBytes*2 {
		t.Fatalf("token length = %d, want %d", len(token), customerTableTokenBytes*2)
	}
	if normalized, err := normalizeCustomerTableToken("  " + token + "  "); err != nil || normalized != token {
		t.Fatalf("normalizeCustomerTableToken() = %q, %v; want generated token", normalized, err)
	}
	for _, invalid := range []string{"", "short", strings.Repeat("z", customerTableTokenBytes*2)} {
		if _, err := normalizeCustomerTableToken(invalid); err == nil {
			t.Fatalf("normalizeCustomerTableToken(%q) accepted invalid token", invalid)
		}
	}
}
