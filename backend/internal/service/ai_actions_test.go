package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"gorm.io/gorm"
)

type fakeAIActionStore struct {
	createdParams repository.CreateSetMenuAvailabilityPreviewParams
	created       *entity.AIActionPreview
	createdToken  string
	createErr     error
	createCalls   int

	confirmed       *entity.AIActionPreview
	confirmReplayed bool
	confirmErr      error
	confirmCalls    int
	confirmedScope  [2]uint
	confirmedID     string
	confirmedToken  string
	cancelled       *entity.AIActionPreview
	cancelErr       error
	cancelCalls     int
	cancelledScope  [2]uint
	cancelledID     string
	cleanupCalls    int
}

func (f *fakeAIActionStore) CreateSetMenuAvailabilityPreview(params repository.CreateSetMenuAvailabilityPreviewParams) (*entity.AIActionPreview, string, error) {
	f.createCalls++
	f.createdParams = params
	return f.created, f.createdToken, f.createErr
}

func (f *fakeAIActionStore) ConfirmSetMenuAvailability(restaurantID, ownerUserID uint, previewID, token string) (*entity.AIActionPreview, bool, error) {
	f.confirmCalls++
	f.confirmedScope = [2]uint{restaurantID, ownerUserID}
	f.confirmedID = previewID
	f.confirmedToken = token
	return f.confirmed, f.confirmReplayed, f.confirmErr
}

func (f *fakeAIActionStore) CancelPreview(restaurantID, ownerUserID uint, previewID string) (*entity.AIActionPreview, error) {
	f.cancelCalls++
	f.cancelledScope = [2]uint{restaurantID, ownerUserID}
	f.cancelledID = previewID
	return f.cancelled, f.cancelErr
}

func (f *fakeAIActionStore) CleanupActionPreviews(_ int) (int64, error) {
	f.cleanupCalls++
	return 0, nil
}

type fakeAIActionMenuResolver struct {
	item      *entity.MenuItem
	findErr   error
	nameItems []entity.MenuItem
	nameErr   error
	findCalls int
	nameCalls int
}

func (f *fakeAIActionMenuResolver) FindMenuItem(_, _ uint) (*entity.MenuItem, error) {
	f.findCalls++
	return f.item, f.findErr
}

func (f *fakeAIActionMenuResolver) FindMenuItemsByExactName(_ uint, _ string, _ int) ([]entity.MenuItem, error) {
	f.nameCalls++
	return f.nameItems, f.nameErr
}

func aiActionTestPlan() ResolvedPlan {
	plan := validResolvedPlan()
	plan.OriginalQuestion = "ปิดขายเมนู Pad Thai"
	plan.ResolvedQuestion = plan.OriginalQuestion
	plan.Task = AITaskRiskyAction
	plan.Domain = ResolvedPlanDomainMenu
	plan.Operation = ResolvedPlanOperationExecuteAction
	plan.Action = &ResolvedPlanAction{
		Type:      ResolvedPlanActionSetMenuAvailability,
		Arguments: ResolvedPlanActionArguments{IsAvailable: false},
	}
	plan.Parameters = emptyResolvedPlanParameters()
	plan.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityMenu, ID: "42", Name: "Pad Thai"}}
	plan.ToolHint = ""
	plan.Policy = ResolvedPlanPolicy{Risk: ResolvedPlanRiskHigh, ReadOnly: false, RequiresConfirmation: true}
	return plan
}

func enableAIActionsForTest(t *testing.T, restaurantIDs string) {
	t.Helper()
	t.Setenv("AI_ORCHESTRATOR_MODE", "planner")
	t.Setenv("AI_ACTIONS_ENABLED", "true")
	t.Setenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS", restaurantIDs)
}

func TestAIActionsRequireBothFeatureFlagAndRestaurantAllowlist(t *testing.T) {
	t.Setenv("AI_ACTIONS_ENABLED", "false")
	t.Setenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS", "7")
	if aiActionsEnabledForRestaurant(7) {
		t.Fatal("disabled action feature accepted an allowlisted restaurant")
	}
	t.Setenv("AI_ACTIONS_ENABLED", "true")
	t.Setenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS", "")
	if aiActionsEnabledForRestaurant(7) {
		t.Fatal("action feature accepted a restaurant without an allowlist")
	}
	t.Setenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS", " 8, 7 ")
	if !aiActionsEnabledForRestaurant(7) || aiActionsEnabledForRestaurant(9) {
		t.Fatal("restaurant action allowlist was not enforced")
	}
	t.Setenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS", "*")
	if !aiActionsEnabledForRestaurant(99) {
		t.Fatal("explicit wildcard did not allow a restaurant")
	}
}

func TestAIActionPreviewCleanupRunsInBoundedIntervals(t *testing.T) {
	store := &fakeAIActionStore{}
	service := &AIService{actionStore: store}
	for index := 0; index < 101; index++ {
		service.maybeCleanupAIActionPreviews()
	}
	if store.cleanupCalls != 2 {
		t.Fatalf("cleanup calls = %d, want first request and request 100", store.cleanupCalls)
	}
}

func TestMaybeCreateAIActionPreviewUsesTrustedOwnerAndResolvedMenu(t *testing.T) {
	enableAIActionsForTest(t, "7")
	now := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	menu := &entity.MenuItem{Name: "Pad Thai", IsAvailable: true}
	menu.ID = 42
	store := &fakeAIActionStore{
		created: &entity.AIActionPreview{
			ID:                   "preview-1",
			ActionType:           entity.AIActionTypeSetMenuAvailability,
			Status:               entity.AIActionPreviewStatusPending,
			TargetMenuItemID:     42,
			TargetMenuItemName:   "Pad Thai",
			ExpectedAvailability: true,
			DesiredAvailability:  false,
			ExpiresAt:            now.Add(repository.AIActionPreviewTTL),
		},
		createdToken: "one-time-token",
	}
	resolver := &fakeAIActionMenuResolver{item: menu}
	service := &AIService{actionStore: store, actionMenuResolver: resolver}
	plan := aiActionTestPlan()
	response := &AIAskResponse{Answer: "blocked", ResolvedPlan: &plan}

	err := service.maybeCreateAIActionPreview(
		AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "owner"},
		"conversation-1",
		response,
	)
	if err != nil {
		t.Fatalf("maybeCreateAIActionPreview() error = %v", err)
	}
	if store.createCalls != 1 || resolver.findCalls != 1 {
		t.Fatalf("action calls = store %d resolver %d", store.createCalls, resolver.findCalls)
	}
	if store.createdParams.RestaurantID != 7 || store.createdParams.OwnerUserID != 11 ||
		store.createdParams.TargetMenuItemID != 42 || store.createdParams.DesiredAvailability ||
		store.createdParams.ConversationID != "conversation-1" {
		t.Fatalf("trusted action params = %+v", store.createdParams)
	}
	if response.ActionPreview == nil || response.ActionPreview.ConfirmationToken != "one-time-token" ||
		response.ActionPreview.Target.MenuItemID != 42 || response.ActionPreview.Requested.IsAvailable {
		t.Fatalf("action preview response = %+v", response.ActionPreview)
	}
}

func TestPlannerAskFlowReturnsPreviewWithoutExecutingTheAction(t *testing.T) {
	enableAIActionsForTest(t, "7")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	plan := aiActionTestPlan()
	plannerProvider := &structuredPlannerMockProvider{
		name: StructuredPlannerProviderGroq,
		response: StructuredPlannerProviderResponse{
			RawJSON: structuredPlannerTestJSON(t, plan),
			Model:   "planner-model",
		},
	}
	menu := &entity.MenuItem{Name: "Pad Thai", IsAvailable: true}
	menu.ID = 42
	store := &fakeAIActionStore{
		created: &entity.AIActionPreview{
			ID: "preview-ask", ActionType: entity.AIActionTypeSetMenuAvailability,
			Status: entity.AIActionPreviewStatusPending, TargetMenuItemID: 42,
			TargetMenuItemName: "Pad Thai", ExpectedAvailability: true,
			DesiredAvailability: false, ExpiresAt: time.Now().Add(repository.AIActionPreviewTTL),
		},
		createdToken: "one-time-token",
	}
	service := &AIService{
		structuredPlannerProviders: []StructuredPlannerProvider{plannerProvider},
		actionStore:                store,
		actionMenuResolver:         &fakeAIActionMenuResolver{item: menu},
	}

	response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{Question: plan.OriginalQuestion})
	if err != nil {
		t.Fatalf("AskOperationsForOwner() error = %v", err)
	}
	if response.ActionPreview == nil || response.Model != "local-action-preview" || store.createCalls != 1 || store.confirmCalls != 0 {
		t.Fatalf("planner action response = %+v create=%d confirm=%d", response, store.createCalls, store.confirmCalls)
	}
	if response.ResolvedPlan == nil || response.ResolvedPlan.Action == nil || response.Planner == nil {
		t.Fatalf("planner metadata/action contract missing: %+v", response)
	}
}

func TestMixedMenuActionAndDocsKeepsPreviewConfirmBoundary(t *testing.T) {
	enableAIActionsForTest(t, "7")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")
	plan := aiActionTestPlan()
	plannerProvider := &structuredPlannerMockProvider{
		name: StructuredPlannerProviderGroq,
		response: StructuredPlannerProviderResponse{
			RawJSON: structuredPlannerTestJSON(t, plan),
			Model:   "planner-model",
		},
	}
	menu := &entity.MenuItem{Name: "Pad Thai", IsAvailable: true}
	menu.ID = 42
	store := &fakeAIActionStore{
		created: &entity.AIActionPreview{
			ID: "preview-mixed", ActionType: entity.AIActionTypeSetMenuAvailability,
			Status: entity.AIActionPreviewStatusPending, TargetMenuItemID: 42,
			TargetMenuItemName: "Pad Thai", ExpectedAvailability: true,
			DesiredAvailability: false, ExpiresAt: time.Now().Add(repository.AIActionPreviewTTL),
		},
		createdToken: "one-time-token",
	}
	service := &AIService{
		structuredPlannerProviders: []StructuredPlannerProvider{plannerProvider},
		actionStore:                store,
		actionMenuResolver:         &fakeAIActionMenuResolver{item: menu},
	}

	response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "ปิดขายเมนู Pad Thai และ PromptPay ยืนยันอัตโนมัติหรือไม่",
	})
	if err != nil {
		t.Fatalf("AskOperationsForOwner() error = %v", err)
	}
	if response.ActionPreview == nil || store.createCalls != 1 || store.confirmCalls != 0 {
		t.Fatalf("mixed action bypassed preview/confirm: response=%+v create=%d confirm=%d", response, store.createCalls, store.confirmCalls)
	}
	if response.ResolvedPlan == nil || response.ResolvedPlan.Action == nil || response.Planner == nil {
		t.Fatalf("mixed action lost trusted planner metadata: %+v", response)
	}
	if len(response.DocSources) != 1 || response.DocSources[0].URL != "/docs/billing-and-payments#payment-methods" {
		t.Fatalf("mixed docs provenance = %+v", response.DocSources)
	}
	if !strings.Contains(response.Answer, "/docs/billing-and-payments#payment-methods") {
		t.Fatalf("mixed answer has no clickable docs citation: %q", response.Answer)
	}
}

func TestMaybeCreateAIActionPreviewFailsClosedOnTargetMismatchAndAmbiguity(t *testing.T) {
	enableAIActionsForTest(t, "7")
	for name, resolver := range map[string]*fakeAIActionMenuResolver{
		"id and name mismatch": {
			item: func() *entity.MenuItem {
				item := &entity.MenuItem{Name: "Another Menu"}
				item.ID = 42
				return item
			}(),
		},
		"duplicate name": {
			nameItems: []entity.MenuItem{{Name: "Pad Thai"}, {Name: "Pad Thai"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			store := &fakeAIActionStore{}
			service := &AIService{actionStore: store, actionMenuResolver: resolver}
			plan := aiActionTestPlan()
			if name == "duplicate name" {
				plan.Parameters.Entities[0].ID = ""
			}
			response := &AIAskResponse{ResolvedPlan: &plan}
			if err := service.maybeCreateAIActionPreview(ownerActor(), "", response); err != nil {
				t.Fatalf("maybeCreateAIActionPreview() error = %v", err)
			}
			if store.createCalls != 0 || response.ActionPreview != nil || response.Intent != AIIntentUnclear {
				t.Fatalf("unsafe target reached preview: calls=%d response=%+v", store.createCalls, response)
			}
		})
	}
}

func TestMaybeCreateAIActionPreviewLeavesGuardInRollbackModes(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "shadow")
	t.Setenv("AI_ACTIONS_ENABLED", "true")
	t.Setenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS", "7")
	store := &fakeAIActionStore{}
	service := &AIService{actionStore: store, actionMenuResolver: &fakeAIActionMenuResolver{}}
	plan := aiActionTestPlan()
	response := &AIAskResponse{Answer: "safety guard", ResolvedPlan: &plan}
	if err := service.maybeCreateAIActionPreview(ownerActor(), "", response); err != nil {
		t.Fatal(err)
	}
	if store.createCalls != 0 || response.ActionPreview != nil || response.Answer != "safety guard" {
		t.Fatalf("shadow mode changed action state: calls=%d response=%+v", store.createCalls, response)
	}
}

func TestConfirmAIActionForOwnerEnforcesFlagScopeAndReturnsIdempotentResult(t *testing.T) {
	enableAIActionsForTest(t, "7")
	completedAt := time.Date(2026, time.August, 3, 12, 1, 0, 0, time.UTC)
	store := &fakeAIActionStore{
		confirmed: &entity.AIActionPreview{
			ID:                  "preview-1",
			Status:              entity.AIActionPreviewStatusExecuted,
			TargetMenuItemID:    42,
			TargetMenuItemName:  "Pad Thai",
			DesiredAvailability: false,
			CompletedAt:         &completedAt,
		},
		confirmReplayed: true,
	}
	service := &AIService{actionStore: store}
	result, err := service.ConfirmAIActionForOwner(
		AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "owner"},
		"preview-1",
		"one-time-token",
	)
	if err != nil {
		t.Fatalf("ConfirmAIActionForOwner() error = %v", err)
	}
	if store.confirmCalls != 1 || store.confirmedScope != [2]uint{7, 11} ||
		store.confirmedID != "preview-1" || store.confirmedToken != "one-time-token" {
		t.Fatalf("confirm scope = %+v id=%q token=%q", store.confirmedScope, store.confirmedID, store.confirmedToken)
	}
	if !result.Replayed || result.Result.MenuItemID != 42 || result.Result.IsAvailable {
		t.Fatalf("confirmation result = %+v", result)
	}

	_, err = service.ConfirmAIActionForOwner(AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "manager"}, "preview-1", "token")
	if err == nil || store.confirmCalls != 1 {
		t.Fatal("non-owner reached the action store")
	}
	t.Setenv("AI_ACTIONS_ALLOWED_RESTAURANT_IDS", "8")
	_, err = service.ConfirmAIActionForOwner(ownerActor(), "preview-1", "token")
	if !errors.Is(err, ErrAIActionsDisabled) || store.confirmCalls != 1 {
		t.Fatal("non-allowlisted restaurant reached the action store")
	}
}

func TestCancelAIActionForOwnerScopesThePreviewAndTreatsRepeatedCancelAsSuccess(t *testing.T) {
	store := &fakeAIActionStore{
		cancelled: &entity.AIActionPreview{ID: "preview-1", Status: entity.AIActionPreviewStatusCancelled},
	}
	service := &AIService{actionStore: store}
	actor := AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "owner"}

	if err := service.CancelAIActionForOwner(actor, " preview-1 "); err != nil {
		t.Fatalf("CancelAIActionForOwner() error = %v", err)
	}
	if store.cancelCalls != 1 || store.cancelledScope != [2]uint{7, 11} || store.cancelledID != "preview-1" {
		t.Fatalf("cancel scope = %+v id=%q calls=%d", store.cancelledScope, store.cancelledID, store.cancelCalls)
	}

	store.cancelErr = repository.ErrAIActionPreviewCancelled
	if err := service.CancelAIActionForOwner(actor, "preview-1"); err != nil {
		t.Fatalf("repeated CancelAIActionForOwner() error = %v", err)
	}

	if err := service.CancelAIActionForOwner(AIActorContext{RestaurantID: 7, OwnerUserID: 11, Role: "manager"}, "preview-1"); err == nil {
		t.Fatal("non-owner cancellation succeeded")
	}
	if store.cancelCalls != 2 {
		t.Fatalf("non-owner reached cancel store: calls=%d", store.cancelCalls)
	}
}

func TestResolveAIActionMenuMapsMissingIDWithoutLeakingRepositoryError(t *testing.T) {
	service := &AIService{actionMenuResolver: &fakeAIActionMenuResolver{findErr: gorm.ErrRecordNotFound}}
	_, err := service.resolveAIActionMenu(7, ResolvedPlanEntityRef{Type: ResolvedPlanEntityMenu, ID: "42"})
	if !errors.Is(err, errAIActionTargetNotFound) {
		t.Fatalf("resolve missing menu error = %v", err)
	}
}
