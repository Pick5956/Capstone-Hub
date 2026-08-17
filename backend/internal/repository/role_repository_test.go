package repository

import (
	"testing"

	"Project-M/internal/entity"
)

func TestCloneRoleWithDisplayNameOverrideDoesNotMutateGlobalDefault(t *testing.T) {
	canonical := &entity.Role{Name: "waiter", DisplayName: "Waiter", IsSystem: true}
	override := "พนักงานหน้าร้าน"

	effective := cloneRoleWithDisplayNameOverride(canonical, &override)

	if effective == canonical {
		t.Fatal("effective role reused the global role pointer")
	}
	if canonical.DisplayName != "Waiter" || canonical.DisplayNameOverride != nil {
		t.Fatalf("global role was mutated: %#v", canonical)
	}
	if effective.DisplayName != override || effective.DisplayNameOverride == nil || *effective.DisplayNameOverride != override {
		t.Fatalf("effective role did not carry override: %#v", effective)
	}
}

func TestCloneRoleWithoutOverrideKeepsDefaultAndNoMarker(t *testing.T) {
	canonical := &entity.Role{Name: "waiter", DisplayName: "Waiter", IsSystem: true}

	effective := cloneRoleWithDisplayNameOverride(canonical, nil)

	if effective == canonical {
		t.Fatal("effective role reused the global role pointer")
	}
	if effective.DisplayName != "Waiter" || effective.DisplayNameOverride != nil {
		t.Fatalf("default role changed without an override: %#v", effective)
	}
}
