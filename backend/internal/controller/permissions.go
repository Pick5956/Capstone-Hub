package controller

import (
	"net/http"

	"Project-M/internal/entity"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
)

func requirePermission(c *gin.Context, permission string, message string) bool {
	if memberCan(c, permission) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": message})
	return false
}

func requireAnyPermission(c *gin.Context, message string, permissions ...string) bool {
	if memberCanAny(c, permissions...) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": message})
	return false
}

func requireRestaurantWithPermission(c *gin.Context, permission string, message string) (uint, bool) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return 0, false
	}
	if !requirePermission(c, permission, message) {
		return 0, false
	}
	return restaurantID, true
}

func requireRestaurantWithAnyPermission(c *gin.Context, message string, permissions ...string) (uint, bool) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return 0, false
	}
	if !requireAnyPermission(c, message, permissions...) {
		return 0, false
	}
	return restaurantID, true
}

func requireManageRolesMember(c *gin.Context) (*entity.RestaurantMember, bool) {
	member, ok := contextMember(c)
	if !ok || member.Role == nil || !memberCan(c, service.PermissionManageRoles) {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_roles permission"})
		return nil, false
	}
	return member, true
}
