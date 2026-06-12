package controller

import (
	"net/http"
	"strconv"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type OrderController struct {
	orderSvc *service.OrderService
}

func ProvideOrderController(db *gorm.DB) *OrderController {
	return &OrderController{
		orderSvc: service.ProvideOrderService(repository.NewOrderRepository(db)),
	}
}

func requireOrderAccess(c *gin.Context, permission string) bool {
	if memberCan(c, permission) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "missing " + permission + " permission"})
	return false
}

func (ctrl *OrderController) CreateOrder(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "take_order") {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var req service.OpenOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := ctrl.orderSvc.OpenOrder(restaurantID, userID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, order)
}

func (ctrl *OrderController) ListOrders(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "view_orders") {
		return
	}
	tableID, ok := optionalUintQuery(c, "table_id", "invalid table_id")
	if !ok {
		return
	}
	page := boundedQueryInt(c, "page", 1, 1, 100000)
	limit := boundedQueryInt(c, "limit", 100, 1, 200)
	orders, err := ctrl.orderSvc.ListOrders(restaurantID, c.Query("status"), tableID, c.Query("date"), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

// resolveOrder accepts either a numeric database ID (backward compat) or an
// order_number string such as "A001" and returns the matching order.
func (ctrl *OrderController) resolveOrder(c *gin.Context, restaurantID uint) (*entity.Order, bool) {
	raw := strings.TrimSpace(c.Param("id"))
	if raw == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing order id"})
		return nil, false
	}
	// If the param is purely numeric treat it as a database ID (legacy / internal calls).
	if n, err := strconv.ParseUint(raw, 10, 64); err == nil {
		order, err := ctrl.orderSvc.GetOrder(restaurantID, uint(n))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return nil, false
		}
		return order, true
	}
	// Otherwise treat it as an order_number string.
	order, err := ctrl.orderSvc.GetOrderByNumber(restaurantID, strings.ToUpper(raw))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return nil, false
	}
	return order, true
}

func (ctrl *OrderController) GetOrder(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "view_orders") {
		return
	}
	order, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) UpdateOrder(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "take_order") {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	resolved, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return
	}
	var req service.UpdateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := ctrl.orderSvc.UpdateOrder(restaurantID, userID, resolved.ID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) CancelOrder(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "take_order") {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	resolved, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return
	}
	member, _ := contextMember(c)
	if member != nil && member.Role != nil && member.Role.Name == "waiter" {
		if resolved.Status != entity.OrderStatusOpen {
			c.JSON(http.StatusForbidden, gin.H{"error": "waiter can only cancel open orders before kitchen send"})
			return
		}
	}
	var req service.CancelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := ctrl.orderSvc.CancelOrder(restaurantID, userID, resolved.ID, req.Reason)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) CloseOrder(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "take_order") {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	resolved, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return
	}
	order, err := ctrl.orderSvc.CloseOrder(restaurantID, userID, resolved.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) Bill(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "view_orders") {
		return
	}
	resolved, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return
	}
	bill, err := ctrl.orderSvc.Bill(restaurantID, resolved.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	c.JSON(http.StatusOK, bill)
}

func (ctrl *OrderController) PayOrder(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "take_payment") {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	resolved, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return
	}
	var req service.PayOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := ctrl.orderSvc.PayOrder(restaurantID, userID, resolved.ID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) AddItem(c *gin.Context) {
	restaurantID, orderID, ok := ctrl.orderIDContext(c, "take_order")
	if !ok {
		return
	}
	var req service.AddOrderItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := ctrl.orderSvc.AddItem(restaurantID, orderID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, order)
}

func (ctrl *OrderController) UpdateItem(c *gin.Context) {
	restaurantID, orderID, ok := ctrl.orderIDContext(c, "take_order")
	if !ok {
		return
	}
	itemID, ok := parseUintParam(c, "itemId")
	if !ok {
		return
	}
	var req service.UpdateOrderItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := ctrl.orderSvc.UpdateItem(restaurantID, orderID, itemID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) DeleteItem(c *gin.Context) {
	restaurantID, orderID, ok := ctrl.orderIDContext(c, "take_order")
	if !ok {
		return
	}
	itemID, ok := parseUintParam(c, "itemId")
	if !ok {
		return
	}
	order, err := ctrl.orderSvc.DeleteItem(restaurantID, orderID, itemID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) SendToKitchen(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "take_order") {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	resolved, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return
	}
	order, err := ctrl.orderSvc.SendToKitchen(restaurantID, userID, resolved.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) UpdateItemStatus(c *gin.Context) {
	restaurantID, orderID, ok := ctrl.orderIDContext(c, "update_order_status")
	if !ok {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	itemID, ok := parseUintParam(c, "itemId")
	if !ok {
		return
	}
	var req service.StatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := ctrl.orderSvc.UpdateItemStatus(restaurantID, userID, orderID, itemID, strings.TrimSpace(req.Status), req.Reason)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (ctrl *OrderController) KitchenQueue(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireOrderAccess(c, "view_kitchen") {
		return
	}
	orders, err := ctrl.orderSvc.KitchenQueue(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func (ctrl *OrderController) orderIDContext(c *gin.Context, permission string) (uint, uint, bool) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return 0, 0, false
	}
	if !requireOrderAccess(c, permission) {
		return 0, 0, false
	}
	resolved, ok := ctrl.resolveOrder(c, restaurantID)
	if !ok {
		return 0, 0, false
	}
	return restaurantID, resolved.ID, true
}
