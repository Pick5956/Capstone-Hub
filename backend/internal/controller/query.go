package controller

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func boundedQueryInt(c *gin.Context, key string, fallback, min, max int) int {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if parsed < min {
		return min
	}
	if parsed > max {
		return max
	}
	return parsed
}

func optionalUintQuery(c *gin.Context, key string, invalidMessage string) (uint, bool) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return 0, true
	}
	parsed, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": invalidMessage})
		return 0, false
	}
	return uint(parsed), true
}
