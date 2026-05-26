package controller

import (
	"net/http"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type TableController struct {
	tableSvc *service.TableService
}

func ProvideTableController(db *gorm.DB) *TableController {
	return &TableController{
		tableSvc: service.ProvideTableService(repository.NewTableRepository(db)),
	}
}

func (ctrl *TableController) ListTables(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_tables") && !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing table permission"})
		return
	}
	tables, err := ctrl.tableSvc.ListTables(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tables": tables})
}

func (ctrl *TableController) CreateTable(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	var req service.TableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	table, err := ctrl.tableSvc.CreateTable(restaurantID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, table)
}

func (ctrl *TableController) BulkCreateTables(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	var req service.BulkCreateTablesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tables, err := ctrl.tableSvc.BulkCreateTables(restaurantID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"tables": tables})
}

func (ctrl *TableController) UpdateTable(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	tableID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.TableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	table, err := ctrl.tableSvc.UpdateTable(restaurantID, tableID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, table)
}

func (ctrl *TableController) UpdateTableStatus(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") && !memberCan(c, "take_order") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing table status permission"})
		return
	}
	tableID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req struct {
		ReservationName  string `json:"reservation_name"`
		Status           string `json:"status" binding:"required"`
		ReservationPhone string `json:"reservation_phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !memberCan(c, "manage_table") && req.Status != "free" && req.Status != "reserved" {
		c.JSON(http.StatusForbidden, gin.H{"error": "take_order can only mark tables free or reserved"})
		return
	}
	table, err := ctrl.tableSvc.UpdateTableStatus(restaurantID, tableID, req.Status, req.ReservationPhone, req.ReservationName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, table)
}

func (ctrl *TableController) RegenerateCustomerToken(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	tableID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	table, err := ctrl.tableSvc.RegenerateCustomerToken(restaurantID, tableID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, table)
}

func (ctrl *TableController) MoveTableZone(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	tableID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.MoveTableZoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	table, err := ctrl.tableSvc.MoveTableZone(restaurantID, tableID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, table)
}

func (ctrl *TableController) DeleteTable(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	tableID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := ctrl.tableSvc.DeleteTable(restaurantID, tableID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (ctrl *TableController) ListZones(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_tables") && !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing table permission"})
		return
	}
	zones, err := ctrl.tableSvc.ListZones(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"zones": zones})
}

func (ctrl *TableController) CreateZone(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	var req service.TableZoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	zone, err := ctrl.tableSvc.CreateZone(restaurantID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, zone)
}

func (ctrl *TableController) UpdateZone(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	zoneID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.TableZoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	zone, err := ctrl.tableSvc.UpdateZone(restaurantID, zoneID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, zone)
}

func (ctrl *TableController) DeleteZone(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	zoneID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := ctrl.tableSvc.DeleteZone(restaurantID, zoneID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (ctrl *TableController) ListTags(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_tables") && !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing table permission"})
		return
	}
	tags, err := ctrl.tableSvc.ListTags(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tags": tags})
}

func (ctrl *TableController) CreateTag(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	var req service.TableTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tag, err := ctrl.tableSvc.CreateTag(restaurantID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, tag)
}

func (ctrl *TableController) UpdateTag(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	tagID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.TableTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tag, err := ctrl.tableSvc.UpdateTag(restaurantID, tagID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tag)
}

func (ctrl *TableController) DeleteTag(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_table") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_table permission"})
		return
	}
	tagID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := ctrl.tableSvc.DeleteTag(restaurantID, tagID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
