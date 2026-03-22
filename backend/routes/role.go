package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupRoleRoutes(r *gin.RouterGroup) {
	roleCtrl := controller.ProvideRoleController(config.DB())

	// ดึง Role ทั้งหมดจาก Database
	r.GET("/roles", roleCtrl.GetRoles)
}