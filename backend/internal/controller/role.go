package controller

import (
	"errors"
	"net/http"
	"strconv"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RoleController struct {
	roleService *service.RoleService
}

type updateRolePermissionsRequest struct {
	Permissions []string `json:"permissions"`
}

type roleRequest struct {
	DisplayName string   `json:"display_name"`
	Permissions []string `json:"permissions"`
}

func ProvideRoleController(db *gorm.DB) *RoleController {
	roleRepo := repository.NewRoleRepository(db)
	auditRepo := repository.NewRestaurantAuditLogRepository(db)
	roleService := service.ProvideRoleService(roleRepo, auditRepo)
	return &RoleController{
		roleService: roleService,
	}
}

func (ctrl *RoleController) UpdateRolePermissions(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageRolesMember(c)
	if !ok {
		return
	}

	rawID := c.Param("roleId")
	roleID, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || roleID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role id"})
		return
	}

	var req updateRolePermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}

	role, err := ctrl.roleService.UpdateRolePermissions(uint(roleID), restaurantID, member, req.Permissions)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"role": role})
}

func (ctrl *RoleController) GetScopedRoles(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	roles, err := ctrl.roleService.GetAssignableRoles(restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": roles})
}

func (ctrl *RoleController) CreateCustomRole(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageRolesMember(c)
	if !ok {
		return
	}
	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	role, err := ctrl.roleService.CreateCustomRole(restaurantID, member, &service.RoleRequest{
		DisplayName: req.DisplayName,
		Permissions: req.Permissions,
	})
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"role": role})
}

func (ctrl *RoleController) UpdateRoleDisplayName(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageRolesMember(c)
	if !ok {
		return
	}
	roleID, err := parseRoleID(c)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	role, err := ctrl.roleService.UpdateRoleDisplayName(roleID, restaurantID, member, &service.RoleRequest{
		DisplayName: req.DisplayName,
	})
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"role": role})
}

func (ctrl *RoleController) DeleteCustomRole(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageRolesMember(c)
	if !ok {
		return
	}
	roleID, err := parseRoleID(c)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	if err := ctrl.roleService.DeleteCustomRole(roleID, restaurantID, member); err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func parseRoleID(c *gin.Context) (uint, error) {
	rawID := c.Param("roleId")
	roleID, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || roleID == 0 {
		return 0, errors.New("invalid role id")
	}
	return uint(roleID), nil
}
