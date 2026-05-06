package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupIngredientRoutes(v1 *gin.RouterGroup) {
	ingredientCtrl := controller.ProvideIngredientController(config.DB())

	v1.GET("/ingredients", ingredientCtrl.List)
	v1.POST("/ingredients", ingredientCtrl.Create)
	v1.PUT("/ingredients/:id", ingredientCtrl.Update)
	v1.DELETE("/ingredients/:id", ingredientCtrl.Delete)
	v1.POST("/ingredients/:id/adjust", ingredientCtrl.AdjustStock)
	v1.GET("/ingredients/:id/transactions", ingredientCtrl.ListTransactions)
}
