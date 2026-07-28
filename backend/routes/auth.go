package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"
	"time"

	"github.com/gin-gonic/gin"
)

func SetupAuthRoutes(r *gin.RouterGroup) {
	userCtrl := controller.ProvideUserController(config.DB()) //setup method
	r.POST("/login", rateLimitAuth(10, time.Minute), userCtrl.Login)
	r.POST("/google-login", rateLimitAuth(20, time.Minute), userCtrl.GoogleLogin)
	r.POST("/register", rateLimitAuth(5, time.Minute), userCtrl.Register)
	r.POST("/forgot-password", rateLimitAuth(5, time.Minute), userCtrl.ForgotPassword)
	r.POST("/reset-password", rateLimitAuth(10, time.Minute), userCtrl.ResetPassword)
}

func rateLimitAuth(limit int, window time.Duration) gin.HandlerFunc {
	return rateLimitRequests(limit, window)
}
