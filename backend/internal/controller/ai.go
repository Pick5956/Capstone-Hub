package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
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
	AskOperationsForOwner(actor service.AIActorContext, req *service.AIAskRequest) (*service.AIAskResponse, error)
	OperationsSnapshot(restaurantID uint) (*service.AISnapshot, error)
	DeleteConversationForOwner(actor service.AIActorContext, conversationID string) error
}

func requireAIOwner(c *gin.Context) bool {
	member, ok := contextMember(c)
	if !ok || member.Role == nil || member.Role.Name != "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "AI operations are available to the restaurant owner only"})
		return false
	}
	return true
}

func ProvideAIController(db *gorm.DB) *AIController {
	return NewAIController(service.ProvideAIServiceWithConversationStore(
		repository.NewAIRepository(db),
		repository.NewAIConversationRepository(db),
	))
}

func NewAIController(svc AIOperationsService) *AIController {
	return &AIController{svc: svc}
}

func (ctrl *AIController) AskOperations(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireAIOwner(c) {
		return
	}
	userID, ok := contextUserID(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authenticated owner is required"})
		return
	}
	var req service.AIAskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	result, err := ctrl.svc.AskOperationsForOwner(service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	}, &req)
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

func (ctrl *AIController) DeleteConversation(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireAIOwner(c) {
		return
	}
	userID, ok := contextUserID(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authenticated owner is required"})
		return
	}
	conversationID := strings.TrimSpace(c.Param("conversationID"))
	if conversationID == "" || len(conversationID) > 64 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}
	if err := ctrl.svc.DeleteConversationForOwner(service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	}, conversationID); err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (ctrl *AIController) OperationsSnapshot(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireAIOwner(c) {
		return
	}
	result, err := ctrl.svc.OperationsSnapshot(restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
