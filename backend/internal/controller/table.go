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
