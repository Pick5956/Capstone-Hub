package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupOrderRoutes(v1 *gin.RouterGroup) {
	ctrl := controller.ProvideOrderController(config.DB())

	v1.POST("/orders", ctrl.CreateOrder)
	v1.GET("/orders", ctrl.ListOrders)
	v1.GET("/orders/:id", ctrl.GetOrder)
	v1.PATCH("/orders/:id", ctrl.UpdateOrder)
	v1.POST("/orders/:id/cancel", ctrl.CancelOrder)
	v1.POST("/orders/:id/close", ctrl.CloseOrder)

	v1.POST("/orders/:id/items", ctrl.AddItem)
	v1.PATCH("/orders/:id/items/:itemId", ctrl.UpdateItem)
	v1.DELETE("/orders/:id/items/:itemId", ctrl.DeleteItem)
	v1.PATCH("/orders/:id/items/:itemId/status", ctrl.UpdateItemStatus)
	v1.POST("/orders/:id/send-to-kitchen", ctrl.SendToKitchen)

	v1.GET("/kitchen/queue", ctrl.KitchenQueue)
}
