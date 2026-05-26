package controller

import (
	"net/url"
	"os"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
)

func publicURL(c *gin.Context, path string) string {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_BACKEND_URL")), "/")
	if baseURL != "" {
		if parsed, err := url.Parse(baseURL); err == nil && isAllowedPublicURL(parsed) {
			if !strings.HasPrefix(path, "/") {
				path = "/" + path
			}
			return parsed.Scheme + "://" + parsed.Host + path
		}
	}

	scheme := requestScheme(c)
	host := safeHost(c.Request.Host)
	if host == "" {
		host = "localhost"
	}

	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return scheme + "://" + host + path
}

func requestScheme(c *gin.Context) string {
	proto := strings.TrimSpace(c.GetHeader("X-Forwarded-Proto"))
	if proto == "https" || proto == "http" {
		return proto
	}
	if c.Request.TLS != nil {
		return "https"
	}
	return "http"
}

func isAllowedPublicURL(parsed *url.URL) bool {
	return (parsed.Scheme == "https" || parsed.Scheme == "http") && safeHost(parsed.Host) != ""
}

func safeHost(host string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}
	for _, r := range host {
		if unicode.IsControl(r) || unicode.IsSpace(r) || r == '/' || r == '\\' || r == '@' {
			return ""
		}
	}
	return host
}
