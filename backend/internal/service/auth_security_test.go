package service

import (
	"strings"
	"testing"
)

func TestValidateLocalPasswordUsesSharedEightToSeventyTwoBytePolicy(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{name: "seven bytes", password: "1234567", wantErr: true},
		{name: "eight bytes", password: "12345678", wantErr: false},
		{name: "seventy two bytes", password: strings.Repeat("a", 72), wantErr: false},
		{name: "seventy three bytes", password: strings.Repeat("a", 73), wantErr: true},
		{name: "multibyte over byte limit", password: strings.Repeat("ก", 25), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateLocalPassword(tt.password)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateLocalPassword() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
