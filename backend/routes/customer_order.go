package routes

import (
	"time"

	"Project-M/config"
	"Project-M/internal/controller"
	"Project-M/internal/realtime"

	"github.com/gin-gonic/gin"
)

func SetupCustomerOrderRoutes(api *gin.RouterGroup, orderEvents *realtime.OrderHub) {
	ctrl := controller.ProvideCustomerOrderController(config.DB(), orderEvents)
	public := api.Group("/public/table-orders")

	public.GET("/:token", rateLimitRequests(120, time.Minute), ctrl.GetTable)
	public.POST("/:token/submit", rateLimitRequests(20, time.Minute), ctrl.SubmitOrder)
}
