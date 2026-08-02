package routes

import (
	"testing"

	"Project-M/internal/realtime"

	"github.com/gin-gonic/gin"
)

func TestOrderRoutesDoNotExposeLegacyUnpaidClose(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	v1 := router.Group("/api/v1")
	SetupOrderRoutes(v1, realtime.NewOrderHub())

	routes := map[string]bool{}
	for _, route := range router.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	if routes["POST /api/v1/orders/:id/close"] {
		t.Fatal("legacy close route must not be exposed")
	}
	if !routes["POST /api/v1/orders/:id/close-empty-table"] {
		t.Fatal("close-empty-table recovery route must remain exposed")
	}
	if !routes["POST /api/v1/orders/:id/pay"] {
		t.Fatal("payment route must remain exposed")
	}
}
