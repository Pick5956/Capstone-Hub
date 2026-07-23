package controller

import (
	"errors"
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

const maxCustomerOrderRequestBytes = 256 << 10

func ProvideCustomerOrderController(db *gorm.DB, orderEvents *realtime.OrderHub) *CustomerOrderController {
	return &CustomerOrderController{
		customerSvc: service.ProvideCustomerOrderService(repository.NewOrderRepository(db)),
		orderEvents: orderEvents,
	}
}

func (ctrl *CustomerOrderController) GetTable(c *gin.Context) {
	payload, err := ctrl.customerSvc.GetTable(c.Param("token"))
	if err != nil {
		respondAPIError(c, http.StatusNotFound, err)
		return
	}
	c.JSON(http.StatusOK, payload)
}

func (ctrl *CustomerOrderController) SubmitOrder(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxCustomerOrderRequestBytes)
	var req service.SubmitCustomerOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	result, err := ctrl.customerSvc.SubmitOrder(c.Param("token"), c.GetHeader("Idempotency-Key"), &req)
	if err != nil {
		if errors.Is(err, service.ErrCustomerOrderIdempotencyConflict) {
			respondAPIError(c, http.StatusConflict, err)
			return
		}
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
		c.Header("Idempotency-Replayed", "true")
	}
	c.JSON(status, result.Payload)
	if !result.Replayed && result.OrderID != 0 {
		ctrl.orderEvents.Publish(result.RestaurantID, "customer_order.submitted", result.OrderID)
	}
}
