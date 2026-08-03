package service

import (
	"testing"

	"Project-M/internal/entity"
)

func TestRolePermissionMutationUsesRestaurantOverrideForSystemRole(t *testing.T) {
	target, err := rolePermissionMutationTargetForRole(&entity.Role{Name: "waiter", RestaurantID: nil}, 17)
	if err != nil {
		t.Fatalf("rolePermissionMutationTargetForRole() error = %v", err)
	}
	if target != rolePermissionRestaurantOverride {
		t.Fatalf("mutation target = %v, want restaurant override", target)
	}
}

func TestRolePermissionMutationRejectsAnotherRestaurantsCustomRole(t *testing.T) {
	otherRestaurantID := uint(91)
	_, err := rolePermissionMutationTargetForRole(&entity.Role{
		Name:         "custom_91_test",
		RestaurantID: &otherRestaurantID,
	}, 17)
	if err == nil {
		t.Fatal("rolePermissionMutationTargetForRole() accepted another restaurant's role")
	}
}
