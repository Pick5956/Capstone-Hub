package controller

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"Project-M/internal/entity"

	"github.com/gin-gonic/gin"
)

func menuBackgroundTestPNG(t *testing.T) []byte {
	t.Helper()
	canvas := image.NewNRGBA(image.Rect(0, 0, 80, 60))
	for y := 0; y < 60; y++ {
		for x := 0; x < 80; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	for y := 12; y < 48; y++ {
		for x := 18; x < 62; x++ {
			canvas.SetNRGBA(x, y, color.NRGBA{R: 190, G: 35, B: 25, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, canvas); err != nil {
		t.Fatalf("encode menu background fixture: %v", err)
	}
	return encoded.Bytes()
}

func menuBackgroundMultipartRequest(t *testing.T, path string, fields map[string]string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("image", "menu.png")
	if err != nil {
		t.Fatalf("create image form part: %v", err)
	}
	if _, err := part.Write(menuBackgroundTestPNG(t)); err != nil {
		t.Fatalf("write image form part: %v", err)
	}
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("write multipart field %s: %v", key, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, path, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func menuBackgroundContext(t *testing.T, request *http.Request, withRestaurant, withPermission bool) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	if withRestaurant {
		context.Set("restaurant_id", uint(7))
	}
	if withPermission {
		context.Set("restaurant_member", &entity.RestaurantMember{
			Role: &entity.Role{Name: "manager", Permissions: `["manage_menu"]`},
		})
	}
	return context, recorder
}

func TestPreviewMenuImageBackgroundReturnsNoStoreDataURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := menuBackgroundMultipartRequest(t, "/api/v1/menu-items/preview-background", map[string]string{
		"background_strength": "65",
	})
	context, recorder := menuBackgroundContext(t, request, true, true)

	(&MenuController{}).PreviewMenuImageBackground(context)

	if recorder.Code != http.StatusOK {
		t.Fatalf("preview status = %d body=%s, want 200", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	var response struct {
		CanRemove      bool    `json:"can_remove"`
		PreviewDataURL string  `json:"preview_data_url"`
		RemovedRatio   float64 `json:"removed_ratio"`
		Strength       int     `json:"strength"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode preview response: %v", err)
	}
	if !response.CanRemove || !strings.HasPrefix(response.PreviewDataURL, "data:image/png;base64,") {
		t.Fatalf("preview response = %+v, want removable PNG data URL", response)
	}
	if response.RemovedRatio <= 0 || response.RemovedRatio >= 1 || response.Strength != 65 {
		t.Fatalf("preview metadata = ratio %f strength %d", response.RemovedRatio, response.Strength)
	}
}

func TestPreviewMenuImageBackgroundDefaultsStrengthAndRequiresScopePermission(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("default strength", func(t *testing.T) {
		request := menuBackgroundMultipartRequest(t, "/api/v1/menu-items/preview-background", nil)
		context, recorder := menuBackgroundContext(t, request, true, true)
		(&MenuController{}).PreviewMenuImageBackground(context)

		if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"strength":50`) {
			t.Fatalf("default preview status=%d body=%s", recorder.Code, recorder.Body.String())
		}
	})

	t.Run("manage menu permission", func(t *testing.T) {
		request := menuBackgroundMultipartRequest(t, "/api/v1/menu-items/preview-background", nil)
		context, recorder := menuBackgroundContext(t, request, true, false)
		(&MenuController{}).PreviewMenuImageBackground(context)

		if recorder.Code != http.StatusForbidden {
			t.Fatalf("missing permission status = %d, want 403", recorder.Code)
		}
	})

	t.Run("restaurant scope", func(t *testing.T) {
		request := menuBackgroundMultipartRequest(t, "/api/v1/menu-items/preview-background", nil)
		context, recorder := menuBackgroundContext(t, request, false, true)
		(&MenuController{}).PreviewMenuImageBackground(context)

		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("missing restaurant status = %d, want 400", recorder.Code)
		}
	})
}

func TestPreviewMenuImageBackgroundRejectsInvalidStrength(t *testing.T) {
	request := menuBackgroundMultipartRequest(t, "/api/v1/menu-items/preview-background", map[string]string{
		"background_strength": "101",
	})
	context, recorder := menuBackgroundContext(t, request, true, true)

	(&MenuController{}).PreviewMenuImageBackground(context)

	if recorder.Code != http.StatusBadRequest || !strings.Contains(recorder.Body.String(), "INVALID_BACKGROUND_STRENGTH") {
		t.Fatalf("invalid strength status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestMenuBackgroundOptInSelectionErrorsUseExplicitCodes(t *testing.T) {
	for _, test := range []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{name: "background not detected", err: errBackgroundNotDetected, wantStatus: http.StatusUnprocessableEntity, wantCode: "BACKGROUND_NOT_DETECTED"},
		{name: "processed image too large", err: errProcessedImageTooLarge, wantStatus: http.StatusRequestEntityTooLarge, wantCode: "PROCESSED_IMAGE_TOO_LARGE"},
	} {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)

			respondMenuBackgroundSelectionError(context, test.err)

			if recorder.Code != test.wantStatus || !strings.Contains(recorder.Body.String(), test.wantCode) {
				t.Fatalf("selection error status=%d body=%s, want %d %s", recorder.Code, recorder.Body.String(), test.wantStatus, test.wantCode)
			}
		})
	}
}
