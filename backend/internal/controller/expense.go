package controller

import (
	"net/http"
	"strconv"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ExpenseController struct {
	svc *service.ExpenseService
}

func ProvideExpenseController(db *gorm.DB) *ExpenseController {
	return &ExpenseController{
		svc: service.ProvideExpenseService(repository.NewExpenseRepository(db)),
	}
}

func (ctrl *ExpenseController) expenseIDParam(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		respondInvalidRequest(c)
		return 0, false
	}
	return uint(id), true
}

func (ctrl *ExpenseController) List(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing expense permission", "manage_expenses", "view_reports")
	if !ok {
		return
	}
	result, err := ctrl.svc.List(restaurantID, c.Query("from"), c.Query("until"), c.Query("category"))
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (ctrl *ExpenseController) Create(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_expenses", "missing manage_expenses permission")
	if !ok {
		return
	}
	userID, ok := contextUserID(c)
	if !ok {
		return
	}
	var req service.ExpenseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	expense, err := ctrl.svc.Create(restaurantID, userID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"expense": expense})
}

func (ctrl *ExpenseController) Update(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_expenses", "missing manage_expenses permission")
	if !ok {
		return
	}
	expenseID, ok := ctrl.expenseIDParam(c)
	if !ok {
		return
	}
	var req service.ExpenseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	expense, err := ctrl.svc.Update(restaurantID, expenseID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"expense": expense})
}

func (ctrl *ExpenseController) Delete(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_expenses", "missing manage_expenses permission")
	if !ok {
		return
	}
	expenseID, ok := ctrl.expenseIDParam(c)
	if !ok {
		return
	}
	if err := ctrl.svc.Delete(restaurantID, expenseID); err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.Status(http.StatusNoContent)
}
