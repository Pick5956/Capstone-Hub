package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"
	"Project-M/internal/realtime"

	"github.com/gin-gonic/gin"
)

func SetupCustomerOrderRoutes(api *gin.RouterGroup, orderEvents *realtime.OrderHub) {
	ctrl := controller.ProvideCustomerOrderController(config.DB(), orderEvents)
	public := api.Group("/public/table-orders")

	public.GET("/:token", ctrl.GetTable)
	public.POST("/:token/submit", ctrl.SubmitOrder)
}
