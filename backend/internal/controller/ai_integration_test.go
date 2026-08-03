package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
)

type fakeAIOperationsService struct {
	askResponse      *service.AIAskResponse
	askErr           error
	snapshotResponse *service.AISnapshot
	snapshotErr      error
	askCalls         int
	snapshotCalls    int
	restaurantID     uint
	actor            service.AIActorContext
	request          *service.AIAskRequest
	deleteCalls      int
	deletedID        string
}

func (f *fakeAIOperationsService) AskOperationsForOwner(_ context.Context, actor service.AIActorContext, req *service.AIAskRequest) (*service.AIAskResponse, error) {
	f.askCalls++
	f.actor = actor
	f.restaurantID = actor.RestaurantID
	f.request = req
	return f.askResponse, f.askErr
}

func (f *fakeAIOperationsService) OperationsSnapshot(restaurantID uint) (*service.AISnapshot, error) {
	f.snapshotCalls++
	f.restaurantID = restaurantID
	return f.snapshotResponse, f.snapshotErr
}

func (f *fakeAIOperationsService) DeleteConversationForOwner(actor service.AIActorContext, conversationID string) error {
	f.deleteCalls++
	f.actor = actor
	f.deletedID = conversationID
	return f.askErr
}

func testAIRouter(svc AIOperationsService, member *entity.RestaurantMember, includeRestaurant bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	ctrl := NewAIController(svc)
	router.Use(func(c *gin.Context) {
		if includeRestaurant {
			c.Set("restaurant_id", uint(12))
		}
		if member != nil {
			c.Set("restaurant_member", member)
			c.Set("user_id", uint(99))
		}
		c.Next()
	})
	router.POST("/ai/operations/ask", ctrl.AskOperations)
	router.GET("/ai/operations/snapshot", ctrl.OperationsSnapshot)
	router.DELETE("/ai/operations/conversations/:conversationID", ctrl.DeleteConversation)
	return router
}

func memberWithRole(name, permissions string) *entity.RestaurantMember {
	return &entity.RestaurantMember{Role: &entity.Role{Name: name, Permissions: permissions}}
}

func TestAskOperationsRequiresRestaurantContext(t *testing.T) {
	svc := &fakeAIOperationsService{}
	router := testAIRouter(svc, memberWithRole("owner", `["*"]`), false)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/ai/operations/ask", strings.NewReader(`{"question":"hello"}`)))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("AskOperations without restaurant context status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if svc.askCalls != 0 {
		t.Fatal("AskOperations must not reach the service without restaurant context")
	}
}

func TestAskOperationsRejectsNonOwner(t *testing.T) {
	for _, role := range []string{"manager", "waiter"} {
		t.Run(role, func(t *testing.T) {
			svc := &fakeAIOperationsService{}
			router := testAIRouter(svc, memberWithRole(role, `["view_reports","manage_inventory"]`), true)
			recorder := httptest.NewRecorder()

			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/ai/operations/ask", strings.NewReader(`{"question":"ยอดขายวันนี้"}`)))

			if recorder.Code != http.StatusForbidden {
				t.Fatalf("AskOperations for %s status = %d, want %d", role, recorder.Code, http.StatusForbidden)
			}
			if svc.askCalls != 0 {
				t.Fatal("AskOperations must not reach the service for a non-owner")
			}
		})
	}
}

func TestAskOperationsReturnsServiceResponseSchema(t *testing.T) {
	svc := &fakeAIOperationsService{
		askResponse: &service.AIAskResponse{
			Answer: "ผมยังไม่เข้าใจคำขอนี้ครับ",
			Intent: service.AIIntentUnclear,
			Model:  "fake-router",
			Snapshot: service.AISnapshot{
				GeneratedAt: "2026-05-26T17:00:00+07:00",
			},
		},
	}
	router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/ai/operations/ask", strings.NewReader(`{"question":"rytyt","history":[{"role":"user","content":"menu"}]}`)))

	if recorder.Code != http.StatusOK {
		t.Fatalf("AskOperations success status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if svc.restaurantID != 12 || svc.actor.OwnerUserID != 99 || svc.actor.Role != "owner" || svc.request == nil || svc.request.Question != "rytyt" || len(svc.request.History) != 1 {
		t.Fatalf("AskOperations did not forward the scoped request correctly: restaurant=%d request=%+v", svc.restaurantID, svc.request)
	}
	var response service.AIAskResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode AskOperations response: %v", err)
	}
	if response.Intent != service.AIIntentUnclear || response.Model != "fake-router" || response.Answer == "" {
		t.Fatalf("AskOperations response = %+v, want unclear response contract", response)
	}
}

func TestDeleteAIConversationUsesOwnerAndRestaurantScope(t *testing.T) {
	svc := &fakeAIOperationsService{}
	router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodDelete, "/ai/operations/conversations/conversation-123", nil))

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("DeleteConversation status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if svc.deleteCalls != 1 || svc.deletedID != "conversation-123" || svc.actor.RestaurantID != 12 || svc.actor.OwnerUserID != 99 || svc.actor.Role != "owner" {
		t.Fatalf("DeleteConversation scope = calls %d id %q actor %+v", svc.deleteCalls, svc.deletedID, svc.actor)
	}
}

func TestAskOperationsReturnsBadRequestForInvalidBodyAndServiceError(t *testing.T) {
	t.Run("invalid json", func(t *testing.T) {
		svc := &fakeAIOperationsService{}
		router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
		recorder := httptest.NewRecorder()

		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/ai/operations/ask", strings.NewReader(`{`)))

		if recorder.Code != http.StatusBadRequest || svc.askCalls != 0 {
			t.Fatalf("invalid JSON status=%d askCalls=%d, want bad request without service call", recorder.Code, svc.askCalls)
		}
	})

	t.Run("service error", func(t *testing.T) {
		svc := &fakeAIOperationsService{askErr: errors.New("provider unavailable")}
		router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
		recorder := httptest.NewRecorder()

		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/ai/operations/ask", strings.NewReader(`{"question":"สรุปยอดขาย"}`)))

		if recorder.Code != http.StatusBadRequest || svc.askCalls != 1 {
			t.Fatalf("service error status=%d askCalls=%d, want bad request after one service call", recorder.Code, svc.askCalls)
		}
	})

	t.Run("conversation conflict", func(t *testing.T) {
		svc := &fakeAIOperationsService{askErr: repository.ErrAIConversationConflict}
		router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
		recorder := httptest.NewRecorder()

		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/ai/operations/ask", strings.NewReader(`{"question":"ยอดขายวันนี้"}`)))

		if recorder.Code != http.StatusConflict || svc.askCalls != 1 {
			t.Fatalf("conversation conflict status=%d askCalls=%d, want conflict", recorder.Code, svc.askCalls)
		}
	})

	t.Run("conversation persistence failure", func(t *testing.T) {
		svc := &fakeAIOperationsService{askErr: service.ErrAIConversationPersistence}
		router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
		recorder := httptest.NewRecorder()

		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/ai/operations/ask", strings.NewReader(`{"question":"ยอดขายวันนี้"}`)))

		if recorder.Code != http.StatusInternalServerError || svc.askCalls != 1 {
			t.Fatalf("conversation persistence status=%d askCalls=%d, want internal server error", recorder.Code, svc.askCalls)
		}
	})
}

func TestOperationsSnapshotReturnsPayloadAndMapsServiceFailure(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &fakeAIOperationsService{snapshotResponse: &service.AISnapshot{GeneratedAt: "2026-05-26T17:00:00+07:00"}}
		router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
		recorder := httptest.NewRecorder()

		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/ai/operations/snapshot", nil))

		if recorder.Code != http.StatusOK || svc.snapshotCalls != 1 || svc.restaurantID != 12 {
			t.Fatalf("snapshot success status=%d calls=%d restaurant=%d", recorder.Code, svc.snapshotCalls, svc.restaurantID)
		}
	})

	t.Run("service error", func(t *testing.T) {
		svc := &fakeAIOperationsService{snapshotErr: errors.New("snapshot unavailable")}
		router := testAIRouter(svc, memberWithRole("owner", `["*"]`), true)
		recorder := httptest.NewRecorder()

		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/ai/operations/snapshot", nil))

		if recorder.Code != http.StatusInternalServerError || svc.snapshotCalls != 1 {
			t.Fatalf("snapshot error status=%d calls=%d, want internal server error", recorder.Code, svc.snapshotCalls)
		}
	})
}
