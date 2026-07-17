package main

import (
	"Project-M/config"
	"Project-M/routes"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

const maxRequestBodyBytes int64 = 8 << 20

func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("Referrer-Policy", "no-referrer")
		c.Writer.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
			c.Writer.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		c.Next()
	}
}

func RequestSizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}

func CORSMiddleware() gin.HandlerFunc {
	allowedOrigins := configuredAllowedOrigins()
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && (allowedOrigins[origin] || isAllowedDevOrigin(origin)) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Restaurant-ID, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PATCH, PUT, DELETE")

		//
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Type")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func isAllowedDevOrigin(origin string) bool {
	if isReleaseMode() {
		return false
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	if parsed.Port() != "3000" {
		return false
	}
	host := parsed.Hostname()
	if host == "localhost" || host == "127.0.0.1" {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsPrivate() || ip.IsLoopback()
}

func isReleaseMode() bool {
	return gin.Mode() == gin.ReleaseMode || os.Getenv("GIN_MODE") == gin.ReleaseMode
}

func main() {
	// Honor GIN_MODE from the environment. Production (docker-compose) sets
	// GIN_MODE=release, which keeps CORS locked to the configured origins. When
	// it is unset (local dev) gin stays in debug mode so isAllowedDevOrigin lets
	// http://localhost:3000 through and browser auth calls are not CORS-blocked.
	if mode := strings.TrimSpace(os.Getenv("GIN_MODE")); mode != "" {
		gin.SetMode(mode)
	}
	config.ConnectionDB()
	if err := config.ValidateRuntimeEnvironment(); err != nil {
		log.Fatal(err)
	}

	config.SetupDatabase()

	r := gin.Default()
	r.MaxMultipartMemory = maxRequestBodyBytes
	_ = r.SetTrustedProxies(nil)
	r.Use(SecurityHeaders())
	r.Use(RequestSizeLimit(maxRequestBodyBytes))
	r.Use(CORSMiddleware())
	r.Static("/uploads", "./uploads")
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	routes.SetupRoutes(r)
	host := os.Getenv("SERVER_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	if err := r.Run(host + ":" + port); err != nil {
		log.Fatal(err)
	}
}

func configuredAllowedOrigins() map[string]bool {
	origins := map[string]bool{}
	if !isReleaseMode() {
		origins["http://localhost:3000"] = true
		origins["http://127.0.0.1:3000"] = true
	}

	if frontendURL := strings.TrimRight(strings.TrimSpace(os.Getenv("FRONTEND_URL")), "/"); frontendURL != "" {
		origins[frontendURL] = true
	}

	for _, raw := range strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",") {
		origin := strings.TrimRight(strings.TrimSpace(raw), "/")
		if origin != "" {
			origins[origin] = true
		}
	}

	return origins
}
