package controller

import (
	"strings"

	"github.com/gin-gonic/gin"
)

func publicURL(c *gin.Context, path string) string {
	scheme := strings.TrimSpace(c.GetHeader("X-Forwarded-Proto"))
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	host := strings.TrimSpace(c.GetHeader("X-Forwarded-Host"))
	if host == "" {
		host = c.Request.Host
	}

	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return scheme + "://" + host + path
}
