package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"Project-M/internal/entity"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
)

func permissionContractContext(roleName string, permissions string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/v1/roles", nil)
	context.Set("restaurant_member", &entity.RestaurantMember{Role: &entity.Role{
		Name:        roleName,
		Permissions: permissions,
	}})
	return context, recorder
}

func TestRequireManageRolesAllowsExplicitCustomRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := permissionContractContext("custom_1_role_admin", `["manage_roles"]`)

	if _, ok := requireManageRolesMember(context); !ok {
		t.Fatal("custom role with manage_roles was rejected")
	}
}

func TestRequireManageRolesSupportsLegacyManagerButNotLegacyCustomRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	managerContext, _ := permissionContractContext("manager", `["manage_staff"]`)
	if _, ok := requireManageRolesMember(managerContext); !ok {
		t.Fatal("legacy manager manage_staff compatibility was rejected")
	}

	customContext, recorder := permissionContractContext("custom_1_legacy", `["manage_staff"]`)
	if _, ok := requireManageRolesMember(customContext); ok {
		t.Fatal("legacy custom-role manage_staff unexpectedly granted manage_roles")
	}
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("legacy custom role status = %d, want forbidden", recorder.Code)
	}
}

func TestMemberCanUsesGranularRestaurantSettingsCapability(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := permissionContractContext(
		"custom_1_settings",
		`["`+service.PermissionManageRestaurantSettings+`"]`,
	)
	if !memberCan(context, service.PermissionManageRestaurantSettings) {
		t.Fatal("custom role could not use explicit restaurant settings capability")
	}
}
