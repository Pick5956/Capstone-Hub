package controller

import (
	"net/http"

	"Project-M/internal/realtime"
	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CustomerOrderController struct {
	customerSvc *service.CustomerOrderService
	orderEvents *realtime.OrderHub
}

func ProvideCustomerOrderController(db *gorm.DB, orderEvents *realtime.OrderHub) *CustomerOrderController {
	return &CustomerOrderController{
		customerSvc: service.ProvideCustomerOrderService(repository.NewOrderRepository(db)),
		orderEvents: orderEvents,
	}
}

func (ctrl *CustomerOrderController) GetTable(c *gin.Context) {
	payload, err := ctrl.customerSvc.GetTable(c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, payload)
}

func (ctrl *CustomerOrderController) SubmitOrder(c *gin.Context) {
	var req service.SubmitCustomerOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payload, err := ctrl.customerSvc.SubmitOrder(c.Param("token"), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, payload)
	if payload.Order != nil {
		ctrl.orderEvents.Publish(payload.Restaurant.ID, "customer_order.submitted", payload.Order.ID)
	}
}
