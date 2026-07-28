package auth

import (
	"net/http"
	"os"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Authorization เป็นฟังก์ชั่นตรวจเช็ค Cookie
func Authorizes(db *gorm.DB) gin.HandlerFunc {
	userRepo := repository.NewUserRepository(db)

	return func(c *gin.Context) {

		authHeader := strings.TrimSpace(c.Request.Header.Get("Authorization"))
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "No Authorization header provided"})
			return
		}

		clientToken, ok := strings.CutPrefix(authHeader, "Bearer ")
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Incorrect Format of Authorization Token"})
			return
		}
		clientToken = strings.TrimSpace(clientToken)
		if clientToken == "" || strings.ContainsAny(clientToken, " \t\r\n") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Incorrect Format of Authorization Token"})
			return
		}

		jwtWrapper := JwtWrapper{
			SecretKey: os.Getenv("JWT_SECRET"),
			Issuer:    Issuer,
		}

		claims, err := jwtWrapper.ValidateToken(clientToken)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}
		user, err := userRepo.FindById(claims.UserID)
		if err != nil || !claimsMatchActiveUser(user, claims) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("user_role", claims.Role)
		c.Next()
	}
}

func claimsMatchActiveUser(user *entity.User, claims *JwtClaims) bool {
	return user != nil &&
		claims != nil &&
		user.Status == "active" &&
		user.TokenVersion != 0 &&
		user.TokenVersion == claims.TokenVersion
}
