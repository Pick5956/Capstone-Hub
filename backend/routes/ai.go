package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupAIRoutes(v1 *gin.RouterGroup) {
	aiCtrl := controller.ProvideAIController(config.DB())

	v1.GET("/ai/operations/snapshot", aiCtrl.OperationsSnapshot)
	v1.POST("/ai/operations/ask", aiCtrl.AskOperations)
}
