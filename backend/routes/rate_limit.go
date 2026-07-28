package routes

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type requestRateBucket struct {
	count      int
	resetAfter time.Time
}

var requestRateState = struct {
	sync.Mutex
	buckets   map[string]requestRateBucket
	lastSweep time.Time
}{
	buckets: map[string]requestRateBucket{},
}

const maxRequestRateBuckets = 10000

// rateLimitRequests limits one HTTP method and route template per trusted
// client IP. main.trustedCloudflareClientIP normalizes c.ClientIP() only when
// the immediate peer is the local reverse proxy, so callers cannot spoof the
// bucket key with forwarding headers sent directly to the backend.
func rateLimitRequests(limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		if limit <= 0 || window <= 0 {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "rate limit unavailable"})
			return
		}

		now := time.Now()
		route := c.FullPath()
		if route == "" {
			route = "<unmatched>"
		}
		key := c.ClientIP() + "|" + c.Request.Method + "|" + route

		requestRateState.Lock()
		if requestRateState.lastSweep.IsZero() || now.Sub(requestRateState.lastSweep) >= window {
			for bucketKey, bucket := range requestRateState.buckets {
				if !now.Before(bucket.resetAfter) {
					delete(requestRateState.buckets, bucketKey)
				}
			}
			requestRateState.lastSweep = now
		}

		bucket, exists := requestRateState.buckets[key]
		if !exists && len(requestRateState.buckets) >= maxRequestRateBuckets {
			requestRateState.Unlock()
			c.Header("Retry-After", strconv.FormatInt(max(1, int64(window/time.Second)), 10))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			return
		}
		if !exists || !now.Before(bucket.resetAfter) {
			bucket = requestRateBucket{resetAfter: now.Add(window)}
		}
		bucket.count++
		requestRateState.buckets[key] = bucket
		requestRateState.Unlock()

		if bucket.count > limit {
			retryAfter := time.Until(bucket.resetAfter)
			c.Header("Retry-After", strconv.FormatInt(max(1, int64(retryAfter/time.Second)), 10))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			return
		}

		c.Next()
	}
}
