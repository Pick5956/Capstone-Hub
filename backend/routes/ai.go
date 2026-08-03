package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"
	"time"

	"github.com/gin-gonic/gin"
)

func SetupAIRoutes(v1 *gin.RouterGroup) {
	aiCtrl := controller.ProvideAIController(config.DB())

	v1.GET("/ai/operations/snapshot", rateLimitRequests(60, time.Minute), aiCtrl.OperationsSnapshot)
	v1.GET("/ai/operations/metrics", rateLimitRequests(30, time.Minute), aiCtrl.UsageMetrics)
	v1.POST("/ai/operations/ask", rateLimitRequests(20, time.Minute), aiCtrl.AskOperations)
	v1.DELETE("/ai/operations/conversations/:conversationID", rateLimitRequests(20, time.Minute), aiCtrl.DeleteConversation)
}
