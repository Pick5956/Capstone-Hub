package controller

import (
	"net/http"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AIController struct {
	svc *service.AIService
}

func ProvideAIController(db *gorm.DB) *AIController {
	return &AIController{
		svc: service.ProvideAIService(repository.NewAIRepository(db)),
	}
}

func (ctrl *AIController) AskOperations(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_reports") && !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing AI operations permission"})
		return
	}
	var req service.AIAskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := ctrl.svc.AskOperations(restaurantID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (ctrl *AIController) OperationsSnapshot(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_reports") && !memberCan(c, "manage_inventory") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing AI operations permission"})
		return
	}
	result, err := ctrl.svc.OperationsSnapshot(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
