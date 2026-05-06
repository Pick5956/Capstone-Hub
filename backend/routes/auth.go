package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"
	"net/http"
	"sync"
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

type authRateBucket struct {
	Count      int
	ResetAfter time.Time
}

var authRateState = struct {
	sync.Mutex
	buckets map[string]authRateBucket
}{
	buckets: map[string]authRateBucket{},
}

func rateLimitAuth(limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		key := c.ClientIP() + ":" + c.FullPath()

		authRateState.Lock()
		bucket := authRateState.buckets[key]
		if bucket.ResetAfter.IsZero() || now.After(bucket.ResetAfter) {
			bucket = authRateBucket{ResetAfter: now.Add(window)}
		}
		bucket.Count += 1
		authRateState.buckets[key] = bucket
		authRateState.Unlock()

		if bucket.Count > limit {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			return
		}

		c.Next()
	}
}
