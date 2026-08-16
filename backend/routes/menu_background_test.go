package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestMenuBackgroundPreviewRouteIsRegisteredAndRateLimited(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	_ = router.SetTrustedProxies(nil)
	v1 := router.Group("/api/v1")
	SetupMenuTableRoutes(v1)

	found := false
	for _, route := range router.Routes() {
		if route.Method == http.MethodPost && route.Path == "/api/v1/menu-items/preview-background" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("POST /api/v1/menu-items/preview-background is not registered")
	}

	for requestNumber := 1; requestNumber <= 31; requestNumber++ {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/menu-items/preview-background", nil)
		request.RemoteAddr = "198.51.100.204:45123"
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		if requestNumber <= 30 && recorder.Code == http.StatusTooManyRequests {
			t.Fatalf("preview request %d was rate limited before the 30/minute allowance", requestNumber)
		}
		if requestNumber == 31 && recorder.Code != http.StatusTooManyRequests {
			t.Fatalf("preview request 31 status = %d, want 429", recorder.Code)
		}
	}
}

func TestMenuImageUploadRouteIsRegisteredAndRateLimited(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	_ = router.SetTrustedProxies(nil)
	v1 := router.Group("/api/v1")
	SetupMenuTableRoutes(v1)

	found := false
	for _, route := range router.Routes() {
		if route.Method == http.MethodPost && route.Path == "/api/v1/menu-items/upload-image" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("POST /api/v1/menu-items/upload-image is not registered")
	}

	for requestNumber := 1; requestNumber <= 31; requestNumber++ {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/menu-items/upload-image", nil)
		request.RemoteAddr = "198.51.100.204:45123"
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		if requestNumber <= 30 && recorder.Code == http.StatusTooManyRequests {
			t.Fatalf("upload request %d was rate limited before the 30/minute allowance", requestNumber)
		}
		if requestNumber == 31 && recorder.Code != http.StatusTooManyRequests {
			t.Fatalf("upload request 31 status = %d, want 429", recorder.Code)
		}
	}
}
