package service

import (
	"reflect"
	"testing"
)

func TestNormalizePermissionsAcceptsExpenseManagement(t *testing.T) {
	permissions, err := normalizePermissions([]string{"manage_expenses"})
	if err != nil {
		t.Fatalf("normalizePermissions() error = %v", err)
	}

	want := []string{"manage_expenses"}
	if !reflect.DeepEqual(permissions, want) {
		t.Fatalf("normalizePermissions() = %#v, want %#v", permissions, want)
	}
}
