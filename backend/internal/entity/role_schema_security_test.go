package entity

import (
	"reflect"
	"strings"
	"testing"
)

func TestRoleNameUniquenessIsTenantScopedAndSoftDeleteAware(t *testing.T) {
	roleType := reflect.TypeOf(Role{})
	restaurantField, ok := roleType.FieldByName("RestaurantID")
	if !ok {
		t.Fatal("Role.RestaurantID field missing")
	}
	nameField, ok := roleType.FieldByName("Name")
	if !ok {
		t.Fatal("Role.Name field missing")
	}

	restaurantTag := restaurantField.Tag.Get("gorm")
	nameTag := nameField.Tag.Get("gorm")
	for _, required := range []string{
		"uniqueIndex:idx_roles_restaurant_name",
		"restaurant_id IS NOT NULL AND deleted_at IS NULL",
	} {
		if !strings.Contains(restaurantTag, required) {
			t.Fatalf("RestaurantID gorm tag missing %q: %s", required, restaurantTag)
		}
	}
	for _, required := range []string{
		"uniqueIndex:idx_roles_restaurant_name",
		"uniqueIndex:idx_roles_system_name",
		"restaurant_id IS NULL AND deleted_at IS NULL",
	} {
		if !strings.Contains(nameTag, required) {
			t.Fatalf("Name gorm tag missing %q: %s", required, nameTag)
		}
	}
	if strings.Contains(nameTag, "gorm:\"unique") || strings.Contains(nameTag, ";unique;") {
		t.Fatalf("Role.Name retained a global unique constraint: %s", nameTag)
	}
}

func TestRolePermissionOverrideDeclaresForeignKeyAssociations(t *testing.T) {
	overrideType := reflect.TypeOf(RestaurantRolePermissionOverride{})
	for _, fieldName := range []string{"Restaurant", "Role"} {
		field, ok := overrideType.FieldByName(fieldName)
		if !ok {
			t.Fatalf("RestaurantRolePermissionOverride.%s association missing", fieldName)
		}
		tag := field.Tag.Get("gorm")
		if !strings.Contains(tag, "OnDelete:CASCADE") {
			t.Fatalf("%s association lacks cascade constraint: %s", fieldName, tag)
		}
	}
}
