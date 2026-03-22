package controller

import (
	"net/http"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RoleController struct {
	roleService *service.RoleService
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
