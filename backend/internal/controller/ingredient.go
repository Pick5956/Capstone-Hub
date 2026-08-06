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
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing inventory permission", "view_inventory", "manage_inventory")
	if !ok {
		return
	}
	items, err := ctrl.svc.List(restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ingredients": items})
}

func (ctrl *IngredientController) ListCategories(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing inventory permission", "view_inventory", "manage_inventory")
	if !ok {
		return
	}
	items, err := ctrl.svc.ListCategories(restaurantID, memberCan(c, "manage_inventory"))
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"categories": items})
}

func (ctrl *IngredientController) CreateCategory(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_inventory", "missing manage_inventory permission")
	if !ok {
		return
	}
	var req service.IngredientCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	category, err := ctrl.svc.CreateCategory(restaurantID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, category)
}

func (ctrl *IngredientController) Create(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_inventory", "missing manage_inventory permission")
	if !ok {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid user context"})
		return
	}
	var req service.IngredientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	ingredient, err := ctrl.svc.Create(restaurantID, userID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, ingredient)
}

func (ctrl *IngredientController) Update(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_inventory", "missing manage_inventory permission")
	if !ok {
		return
	}
	ingredientID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.IngredientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	ingredient, err := ctrl.svc.Update(restaurantID, ingredientID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, ingredient)
}

func (ctrl *IngredientController) Delete(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_inventory", "missing manage_inventory permission")
	if !ok {
		return
	}
	ingredientID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := ctrl.svc.Delete(restaurantID, ingredientID); err != nil {
		respondAPIError(c, http.StatusConflict, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (ctrl *IngredientController) AdjustStock(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_inventory", "missing manage_inventory permission")
	if !ok {
		return
	}
	ingredientID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.AdjustStockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	if !requireStockExpensePermission(c, req.Amount) {
		return
	}
	userID, _ := contextUserID(c)
	ingredient, err := ctrl.svc.AdjustStock(restaurantID, ingredientID, userID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, ingredient)
}

func requireStockExpensePermission(c *gin.Context, amount float64) bool {
	if amount <= 0 {
		return true
	}
	return requirePermission(c, "manage_expenses", "missing manage_expenses permission")
}

func (ctrl *IngredientController) ListTransactions(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing inventory permission", "view_inventory", "manage_inventory")
	if !ok {
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
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"transactions": txs})
}
