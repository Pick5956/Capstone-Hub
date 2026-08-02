package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AIController struct {
	svc AIOperationsService
}

type AIOperationsService interface {
	AskOperations(restaurantID uint, req *service.AIAskRequest) (*service.AIAskResponse, error)
	OperationsSnapshot(restaurantID uint) (*service.AISnapshot, error)
}

func ProvideAIController(db *gorm.DB) *AIController {
	return NewAIController(service.ProvideAIService(repository.NewAIRepository(db)))
}

func NewAIController(svc AIOperationsService) *AIController {
	return &AIController{svc: svc}
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
		respondInvalidRequest(c)
		return
	}
	result, err := ctrl.svc.AskOperations(restaurantID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	isStream := c.Query("stream") == "true"
	if isStream {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("Transfer-Encoding", "chunked")

		c.Stream(func(w io.Writer) bool {
			// Stream audited Thai text smoothly (chunking runes for fluid typography)
			runes := []rune(result.Answer)
			chunkSize := 3
			for i := 0; i < len(runes); i += chunkSize {
				end := i + chunkSize
				if end > len(runes) {
					end = len(runes)
				}
				chunk := string(runes[i:end])
				c.SSEvent("token", chunk)
				c.Writer.Flush()
				time.Sleep(15 * time.Millisecond)
			}

			// Stream final structural metadata
			metaJSON, _ := json.Marshal(result)
			c.SSEvent("metadata", string(metaJSON))
			c.Writer.Flush()

			// Signal end of stream
			c.SSEvent("end", "done")
			c.Writer.Flush()
			return false
		})
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
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
