package controller

import (
	"testing"

	"Project-M/internal/entity"

	"github.com/gin-gonic/gin"
)

func kitchenPermissionContext(member *entity.RestaurantMember) *gin.Context {
	context, _ := gin.CreateTestContext(nil)
	context.Set("restaurant_member", member)
	return context
}

func TestKitchenStatusManagementRequiresUpdatePermission(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, roleName := range []string{"owner", "manager", "chef"} {
		context := kitchenPermissionContext(&entity.RestaurantMember{
			Role: &entity.Role{Name: roleName},
		})
		if !memberCan(context, "update_order_status") {
			t.Fatalf("%s should be allowed to manage kitchen item status", roleName)
		}
	}

	viewOnlyPermissions := `["view_kitchen"]`
	viewOnlyContext := kitchenPermissionContext(&entity.RestaurantMember{
		PermissionsOverride: &viewOnlyPermissions,
		Role:                &entity.Role{Name: "chef"},
	})
	if memberCan(viewOnlyContext, "update_order_status") {
		t.Fatal("view-only kitchen member should not be allowed to manage kitchen item status")
	}
}
