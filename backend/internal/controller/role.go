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
	roleService := service.ProvideRoleService(roleRepo)
	return &RoleController{
		roleService: roleService,
	}
}

func (ctrl *RoleController) GetRoles(c *gin.Context) {
	roles, err := ctrl.roleService.GetAllRoles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch roles", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": roles})
}

func (ctrl *RoleController) UpdateRolePermissions(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageStaffMember(c)
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role, err := ctrl.roleService.UpdateRolePermissions(uint(roleID), restaurantID, member.Role.Name, req.Permissions)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch roles", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": roles})
}

func (ctrl *RoleController) CreateCustomRole(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageStaffMember(c)
	if !ok {
		return
	}
	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role, err := ctrl.roleService.CreateCustomRole(restaurantID, member.Role.Name, &service.RoleRequest{
		DisplayName: req.DisplayName,
		Permissions: req.Permissions,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"role": role})
}

func (ctrl *RoleController) UpdateCustomRole(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageStaffMember(c)
	if !ok {
		return
	}
	roleID, err := parseRoleID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role, err := ctrl.roleService.UpdateCustomRole(roleID, restaurantID, member.Role.Name, &service.RoleRequest{
		DisplayName: req.DisplayName,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"role": role})
}

func (ctrl *RoleController) DeleteCustomRole(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	member, ok := requireManageStaffMember(c)
	if !ok {
		return
	}
	roleID, err := parseRoleID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ctrl.roleService.DeleteCustomRole(roleID, restaurantID, member.Role.Name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
