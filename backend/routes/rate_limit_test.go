package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRateLimitRequestsUsesClientMethodAndRouteTemplate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	_ = router.SetTrustedProxies(nil)
	router.GET(
		"/public/:token",
		rateLimitRequests(1, time.Minute),
		func(c *gin.Context) { c.Status(http.StatusNoContent) },
	)
	router.POST(
		"/public/:token",
		rateLimitRequests(1, time.Minute),
		func(c *gin.Context) { c.Status(http.StatusNoContent) },
	)

	send := func(method, path, remoteAddr string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(method, path, nil)
		request.RemoteAddr = remoteAddr
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}

	if got := send(http.MethodGet, "/public/first-secret", "192.0.2.10:41000").Code; got != http.StatusNoContent {
		t.Fatalf("first GET status = %d, want 204", got)
	}
	limited := send(http.MethodGet, "/public/another-secret", "192.0.2.10:41001")
	if limited.Code != http.StatusTooManyRequests {
		t.Fatalf("same IP and route-template GET status = %d, want 429", limited.Code)
	}
	if limited.Header().Get("Retry-After") == "" {
		t.Fatal("limited response has no Retry-After header")
	}
	if got := send(http.MethodPost, "/public/first-secret", "192.0.2.10:41002").Code; got != http.StatusNoContent {
		t.Fatalf("POST should have an independent method bucket, status = %d", got)
	}
	if got := send(http.MethodGet, "/public/first-secret", "192.0.2.11:41003").Code; got != http.StatusNoContent {
		t.Fatalf("different client IP should have an independent bucket, status = %d", got)
	}
}
