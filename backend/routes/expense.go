package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupExpenseRoutes(v1 *gin.RouterGroup) {
	ctrl := controller.ProvideExpenseController(config.DB())

	v1.GET("/expenses", ctrl.List)
	v1.POST("/expenses", ctrl.Create)
	v1.PUT("/expenses/:id", ctrl.Update)
	v1.DELETE("/expenses/:id", ctrl.Delete)
}
