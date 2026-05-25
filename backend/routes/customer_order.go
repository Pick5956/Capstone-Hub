package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupCustomerOrderRoutes(api *gin.RouterGroup) {
	ctrl := controller.ProvideCustomerOrderController(config.DB())
	public := api.Group("/public/table-orders")

	public.GET("/:token", ctrl.GetTable)
	public.POST("/:token/submit", ctrl.SubmitOrder)
}
