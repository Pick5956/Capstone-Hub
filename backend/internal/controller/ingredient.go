package controller

import (
	"net/http"
	"strconv"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type IngredientController struct {
	svc *service.IngredientService
}

func ProvideIngredientController(db *gorm.DB) *IngredientController {
	return &IngredientController{
		svc: service.ProvideIngredientService(repository.NewIngredientRepository(db)),
	}
}

func (ctrl *IngredientController) List(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_inventory") && !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing inventory permission"})
		return
	}
	items, err := ctrl.svc.List(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ingredients": items})
}

func (ctrl *IngredientController) Create(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_inventory permission"})
		return
	}
	var req service.IngredientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ingredient, err := ctrl.svc.Create(restaurantID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, ingredient)
}

func (ctrl *IngredientController) Update(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_inventory permission"})
		return
	}
	ingredientID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.IngredientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ingredient, err := ctrl.svc.Update(restaurantID, ingredientID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, ingredient)
}

func (ctrl *IngredientController) Delete(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_inventory permission"})
		return
	}
	ingredientID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.Delete(restaurantID, ingredientID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (ctrl *IngredientController) AdjustStock(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_inventory permission"})
		return
	}
	ingredientID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.AdjustStockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, _ := contextUserID(c)
	ingredient, err := ctrl.svc.AdjustStock(restaurantID, ingredientID, userID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, ingredient)
}

func (ctrl *IngredientController) ListTransactions(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_inventory") && !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing inventory permission"})
		return
	}
	var ingredientID uint
	if raw := c.Param("id"); raw != "" && raw != "/" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err == nil {
			ingredientID = uint(id)
		}
	}
	txs, err := ctrl.svc.ListTransactions(restaurantID, ingredientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"transactions": txs})
}
