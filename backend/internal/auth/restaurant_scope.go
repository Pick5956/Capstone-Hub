package auth

import (
	"net/http"
	"strconv"
	"strings"

	"Project-M/internal/repository"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func RestaurantScope(db *gorm.DB) gin.HandlerFunc {
	memberRepo := repository.NewRestaurantMemberRepository(db)

	return func(c *gin.Context) {
		rawID := strings.TrimSpace(c.GetHeader("X-Restaurant-ID"))
		if rawID == "" || shouldSkipRestaurantScope(c) {
			c.Next()
			return
		}

		userID, ok := getUserIDFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token payload"})
			return
		}

		restaurantID64, err := strconv.ParseUint(rawID, 10, 64)
		if err != nil || restaurantID64 == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid X-Restaurant-ID"})
			return
		}

		member, err := memberRepo.FindByUserAndRestaurant(userID, uint(restaurantID64))
		if err != nil || member.Status != "active" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
			return
		}

		c.Set("restaurant_id", uint(restaurantID64))
		c.Set("restaurant_member", member)
		c.Next()
	}
}

func shouldSkipRestaurantScope(c *gin.Context) bool {
	path := c.FullPath()
	method := c.Request.Method

	return path == "/api/v1/restaurants/me" ||
		(path == "/api/v1/restaurants" && method == http.MethodPost) ||
		path == "/api/v1/restaurants/join" ||
		path == "/api/v1/invitations/:token/accept"
}

func getUserIDFromContext(c *gin.Context) (uint, bool) {
	v, ok := c.Get("user_id")
	if !ok {
		return 0, false
	}

	switch n := v.(type) {
	case uint:
		return n, true
	case float64:
		return uint(n), true
	default:
		return 0, false
	}
}
