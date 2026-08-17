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

func TestRoleDisplayNameMutationUsesRestaurantOverrideForSystemRole(t *testing.T) {
	target, err := roleDisplayNameMutationTargetForRole(&entity.Role{Name: "waiter", RestaurantID: nil}, 17)
	if err != nil {
		t.Fatalf("roleDisplayNameMutationTargetForRole() error = %v", err)
	}
	if target != roleDisplayNameRestaurantOverride {
		t.Fatalf("mutation target = %v, want restaurant display-name override", target)
	}
}

func TestRoleDisplayNameMutationUpdatesSameRestaurantCustomRoleDirectly(t *testing.T) {
	restaurantID := uint(17)
	target, err := roleDisplayNameMutationTargetForRole(&entity.Role{
		Name:         "custom_17_front",
		RestaurantID: &restaurantID,
	}, restaurantID)
	if err != nil {
		t.Fatalf("roleDisplayNameMutationTargetForRole() error = %v", err)
	}
	if target != roleDisplayNameDirect {
		t.Fatalf("mutation target = %v, want direct custom-role update", target)
	}
}

func TestRoleDisplayNameMutationRejectsAnotherRestaurantsCustomRole(t *testing.T) {
	otherRestaurantID := uint(91)
	_, err := roleDisplayNameMutationTargetForRole(&entity.Role{
		Name:         "custom_91_test",
		RestaurantID: &otherRestaurantID,
	}, 17)
	if err == nil {
		t.Fatal("roleDisplayNameMutationTargetForRole() accepted another restaurant's role")
	}
}

func TestRoleDisplayNameMutationKeepsProtectedRoleHierarchy(t *testing.T) {
	owner := &entity.RestaurantMember{Role: &entity.Role{Name: "owner", Permissions: `["*"]`}}
	manager := &entity.RestaurantMember{Role: &entity.Role{Name: "manager", Permissions: `["manage_roles"]`}}

	if canManageRole(owner, &entity.Role{Name: "owner"}) {
		t.Fatal("owner role became editable")
	}
	if !canManageRole(owner, &entity.Role{Name: "manager"}) {
		t.Fatal("owner could not rename the built-in manager role")
	}
	if canManageRole(manager, &entity.Role{Name: "manager"}) {
		t.Fatal("manager could rename the protected manager role")
	}
	if !canManageRole(manager, &entity.Role{Name: "cashier"}) {
		t.Fatal("manager could not rename an ordinary built-in role")
	}
}

func TestSystemRoleSeedNameStillRequiresRestaurantDisplayNameOverride(t *testing.T) {
	role := &entity.Role{
		Name:        "waiter",
		DisplayName: "Waiter",
		IsSystem:    true,
	}

	if roleDisplayNameUpdateIsNoOp(role, roleDisplayNameRestaurantOverride, "Waiter") {
		t.Fatal("seeded display name was treated as an existing restaurant override")
	}

	override := "Waiter"
	role.DisplayNameOverride = &override
	if !roleDisplayNameUpdateIsNoOp(role, roleDisplayNameRestaurantOverride, "Waiter") {
		t.Fatal("matching restaurant display-name override was not treated as a no-op")
	}
}
