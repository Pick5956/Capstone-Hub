package controller

import (
	"context"
	"encoding/json"
	"errors"
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
	AskOperationsForOwner(ctx context.Context, actor service.AIActorContext, req *service.AIAskRequest) (*service.AIAskResponse, error)
	OperationsSnapshot(restaurantID uint) (*service.AISnapshot, error)
	DeleteConversationForOwner(actor service.AIActorContext, conversationID string) error
	AIUsageForOwner(actor service.AIActorContext) (*service.AIUsageSnapshot, error)
	ProactiveInsightsForOwner(actor service.AIActorContext) ([]service.AIInsight, error)
	ExtractReceiptForOwner(actor service.AIActorContext, imageBase64, mimeType string) (*service.ReceiptDraft, error)
	ConfirmAIActionForOwner(actor service.AIActorContext, previewID, confirmationToken string) (*service.AIActionConfirmationResponse, error)
	CancelAIActionForOwner(actor service.AIActorContext, previewID string) error
	OperatingCalendarForOwner(restaurantID uint) (service.AICalendarView, error)
	SetOperatingCalendar(restaurantID uint, view service.AICalendarView) error
}

const maxAIActionConfirmationBodyBytes int64 = 1024

// A 1.5 MB image is ~2 MB of base64 plus JSON overhead. Capping here stops an
// oversized upload before it is parsed, instead of leaning on the global 8 MB limit.
const maxReceiptRequestBodyBytes int64 = 3 << 20

func requireAIOwner(c *gin.Context) bool {
	member, ok := contextMember(c)
	if !ok || member.Role == nil || member.Role.Name != "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "AI operations are available to the restaurant owner only"})
		return false
	}
	return true
}

func ProvideAIController(db *gorm.DB) *AIController {
	return NewAIController(service.ProvideAIServiceWithStores(
		repository.NewAIRepository(db),
		repository.NewAIConversationRepository(db),
		repository.NewAIActionPreviewRepository(db),
		repository.NewMenuRepository(db),
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
	result, err := ctrl.svc.AskOperationsForOwner(c.Request.Context(), service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	}, &req)
	if err != nil {
		if errors.Is(err, service.ErrAIQuotaExceeded) {
			respondAPIError(c, http.StatusTooManyRequests, err)
			return
		}
		if errors.Is(err, repository.ErrAIConversationConflict) {
			respondAPIError(c, http.StatusConflict, err)
			return
		}
		if errors.Is(err, service.ErrAIConversationPersistence) {
			respondAPIError(c, http.StatusInternalServerError, err)
			return
		}
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	// Ask responses can contain a one-time action confirmation token and always
	// contain private restaurant data. Do not let browsers or intermediary
	// caches retain either the JSON response or SSE metadata.
	c.Header("Cache-Control", "no-store, private")
	c.Header("Pragma", "no-cache")

	isStream := c.Query("stream") == "true"
	if isStream {
		c.Header("Content-Type", "text/event-stream")
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

func (ctrl *AIController) ProactiveInsights(c *gin.Context) {
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
	insights, err := ctrl.svc.ProactiveInsightsForOwner(service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	})
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"insights": insights})
}

// GetOperatingCalendar returns the restaurant's forecast open/closed calendar.
func (ctrl *AIController) GetOperatingCalendar(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireAIOwner(c) {
		return
	}
	view, err := ctrl.svc.OperatingCalendarForOwner(restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// UpdateOperatingCalendar replaces the restaurant's forecast open/closed calendar.
func (ctrl *AIController) UpdateOperatingCalendar(c *gin.Context) {
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !requireAIOwner(c) {
		return
	}
	var input service.AICalendarView
	if err := c.ShouldBindJSON(&input); err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	if err := ctrl.svc.SetOperatingCalendar(restaurantID, input); err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	view, err := ctrl.svc.OperatingCalendarForOwner(restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// ExtractReceipt reads a bill photo into a draft expense (owner reviews before saving).
func (ctrl *AIController) ExtractReceipt(c *gin.Context) {
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
	var req struct {
		Image    string `json:"image"`
		MimeType string `json:"mime_type"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxReceiptRequestBodyBytes)
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	draft, err := ctrl.svc.ExtractReceiptForOwner(service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	}, req.Image, req.MimeType)
	if err != nil {
		if errors.Is(err, service.ErrAIQuotaExceeded) {
			respondAPIError(c, http.StatusTooManyRequests, err)
			return
		}
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"draft": draft})
}

func (ctrl *AIController) UsageMetrics(c *gin.Context) {
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
	result, err := ctrl.svc.AIUsageForOwner(service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	})
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (ctrl *AIController) ConfirmAction(c *gin.Context) {
	c.Header("Cache-Control", "no-store, private")
	c.Header("Pragma", "no-cache")
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
	previewID := strings.TrimSpace(c.Param("previewID"))
	if !validAIActionPreviewID(previewID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid AI action preview id"})
		return
	}
	var req service.AIActionConfirmationRequest
	if err := decodeAIActionConfirmationRequest(c, &req); err != nil {
		respondInvalidRequest(c)
		return
	}
	result, err := ctrl.svc.ConfirmAIActionForOwner(service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	}, previewID, req.ConfirmationToken)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrAIActionsDisabled):
			respondAPIError(c, http.StatusForbidden, err)
		case errors.Is(err, service.ErrAIActionUnavailable):
			respondAPIError(c, http.StatusServiceUnavailable, err)
		case errors.Is(err, repository.ErrAIActionPreviewNotFound):
			respondAPIError(c, http.StatusNotFound, err)
		case errors.Is(err, repository.ErrAIActionPreviewInvalidToken):
			respondAPIError(c, http.StatusForbidden, err)
		case errors.Is(err, repository.ErrAIActionPreviewExpired):
			respondAPIError(c, http.StatusGone, err)
		case errors.Is(err, repository.ErrAIActionPreviewStale),
			errors.Is(err, repository.ErrAIActionPreviewCancelled),
			errors.Is(err, repository.ErrAIActionPreviewAlreadyExecuted),
			errors.Is(err, repository.ErrAIActionPreviewInvalidState):
			respondAPIError(c, http.StatusConflict, err)
		default:
			respondAPIError(c, http.StatusInternalServerError, err)
		}
		return
	}
	c.JSON(http.StatusOK, result)
}

func (ctrl *AIController) CancelAction(c *gin.Context) {
	c.Header("Cache-Control", "no-store, private")
	c.Header("Pragma", "no-cache")
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
	previewID := strings.TrimSpace(c.Param("previewID"))
	if !validAIActionPreviewID(previewID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid AI action preview id"})
		return
	}

	err := ctrl.svc.CancelAIActionForOwner(service.AIActorContext{
		RestaurantID: restaurantID,
		OwnerUserID:  userID,
		Role:         "owner",
	}, previewID)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrAIActionPreviewCancelled):
			c.Status(http.StatusNoContent)
		case errors.Is(err, service.ErrAIActionUnavailable):
			respondAPIError(c, http.StatusServiceUnavailable, err)
		case errors.Is(err, repository.ErrAIActionPreviewNotFound):
			respondAPIError(c, http.StatusNotFound, err)
		case errors.Is(err, repository.ErrAIActionPreviewExpired):
			respondAPIError(c, http.StatusGone, err)
		case errors.Is(err, repository.ErrAIActionPreviewStale),
			errors.Is(err, repository.ErrAIActionPreviewAlreadyExecuted),
			errors.Is(err, repository.ErrAIActionPreviewInvalidState):
			respondAPIError(c, http.StatusConflict, err)
		default:
			respondAPIError(c, http.StatusInternalServerError, err)
		}
		return
	}
	c.Status(http.StatusNoContent)
}

func validAIActionPreviewID(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	for _, char := range value {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') &&
			(char < '0' || char > '9') && char != '-' && char != '_' {
			return false
		}
	}
	return true
}

func decodeAIActionConfirmationRequest(c *gin.Context, request *service.AIActionConfirmationRequest) error {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAIActionConfirmationBodyBytes)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(request); err != nil {
		return err
	}
	var trailing interface{}
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return errors.New("multiple JSON values are not allowed")
		}
		return err
	}
	request.ConfirmationToken = strings.TrimSpace(request.ConfirmationToken)
	if request.ConfirmationToken == "" || len(request.ConfirmationToken) > 256 {
		return errors.New("invalid confirmation token")
	}
	return nil
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
