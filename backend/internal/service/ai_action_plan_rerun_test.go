package service

import (
	"encoding/json"
	"strings"
	"testing"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

// fakeAIActionPlanStore records what the confirm loop writes back.
type fakeAIActionPlanStore struct {
	recorded []repository.AIActionPlanItemOutcome
}

func (f *fakeAIActionPlanStore) CreateAIActionPlan(repository.CreateAIActionPlanParams) (*entity.AIActionPlan, string, error) {
	return nil, "", nil
}
func (f *fakeAIActionPlanStore) FindAIActionPlan(uint, uint, string) (*entity.AIActionPlan, error) {
	return nil, nil
}
func (f *fakeAIActionPlanStore) PendingAIActionPlan(uint, uint) (*entity.AIActionPlan, error) {
	return nil, nil
}
func (f *fakeAIActionPlanStore) ClaimAIActionPlan(uint, uint, string, string) (*entity.AIActionPlan, bool, error) {
	return nil, false, nil
}
func (f *fakeAIActionPlanStore) RecordAIActionPlanItem(outcome repository.AIActionPlanItemOutcome) error {
	f.recorded = append(f.recorded, outcome)
	return nil
}
func (f *fakeAIActionPlanStore) FinishAIActionPlan(string, []repository.AIActionPlanItemOutcome) (*entity.AIActionPlan, error) {
	return nil, nil
}
func (f *fakeAIActionPlanStore) CancelAIActionPlan(uint, uint, string) (*entity.AIActionPlan, error) {
	return nil, nil
}

func storedPlanItem(t *testing.T, id uint, status string, payload AIActionItemPayload) entity.AIActionPlanItem {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return entity.AIActionPlanItem{
		ID: id, Seq: int(id), Status: status,
		ActionType: entity.AIActionTypeAdjustIngredientStock,
		PayloadJSON: string(raw), PreviewJSON: "{}",
	}
}

// The first attempt wrote item 1 (a delivery of 2000 g) and died before item 2.
// The plan sat in "executing" past the claim timeout and was claimed again. The
// second attempt must run item 2 only: running item 1 again books the delivery
// twice, together with the expense row the system adds by itself and nobody can
// delete.
func TestRerunSkipsItemsThatAlreadyExecuted(t *testing.T) {
	port := newAIActionPortFixture()
	store := &fakeAIActionPlanStore{}
	plan := &entity.AIActionPlan{ID: "plan-1", Items: []entity.AIActionPlanItem{
		storedPlanItem(t, 1, entity.AIActionItemStatusExecuted, AIActionItemPayload{IngredientID: 2, Kind: "in", Quantity: 2000}),
		storedPlanItem(t, 2, entity.AIActionItemStatusPending, AIActionItemPayload{IngredientID: 1, Kind: "in", Quantity: 500}),
	}}

	outcomes := runAIActionPlanItems(store, AIActionPorts{Ingredients: port}, AIActorContext{RestaurantID: 1, OwnerUserID: 1}, plan)

	if len(port.adjusted) != 1 || port.adjusted[0].Quantity != 500 {
		t.Fatalf("only the unfinished item may run, got writes %+v", port.adjusted)
	}
	// The totals still count the item done on the earlier attempt, so the owner
	// reads "2 of 2" rather than "1 of 2" over a plan that did fully happen.
	if len(outcomes) != 2 || !outcomes[0].Succeeded || !outcomes[1].Succeeded {
		t.Fatalf("both items should report success, got %+v", outcomes)
	}
	// Only the item that ran this time is written back; the other is already on
	// disk from the first attempt.
	if len(store.recorded) != 1 || store.recorded[0].ItemID != 2 {
		t.Fatalf("expected the outcome of item 2 alone to be recorded, got %+v", store.recorded)
	}
}

// Each outcome is written as it happens, not batched at the end — that is the
// only way a crash between two items leaves a record for the next attempt to
// read.
func TestEachItemOutcomeIsRecordedBeforeTheNextRuns(t *testing.T) {
	port := newAIActionPortFixture()
	store := &fakeAIActionPlanStore{}
	plan := &entity.AIActionPlan{ID: "plan-2", Items: []entity.AIActionPlanItem{
		storedPlanItem(t, 1, entity.AIActionItemStatusPending, AIActionItemPayload{IngredientID: 2, Kind: "in", Quantity: 100}),
		// Previewed against a stock of 999 that the row no longer holds, so this
		// one is refused by the changed-meanwhile guard.
		storedPlanItem(t, 2, entity.AIActionItemStatusPending, AIActionItemPayload{IngredientID: 1, Kind: "adjust", Quantity: 100, ExpectedStock: floatPtr(999)}),
	}}

	outcomes := runAIActionPlanItems(store, AIActionPorts{Ingredients: port}, AIActorContext{RestaurantID: 1, OwnerUserID: 1}, plan)

	if len(store.recorded) != 2 {
		t.Fatalf("every item's outcome must be recorded, got %d", len(store.recorded))
	}
	if !store.recorded[0].Succeeded || store.recorded[0].ItemID != 1 {
		t.Errorf("item 1 should be recorded as executed: %+v", store.recorded[0])
	}
	if store.recorded[1].Succeeded || store.recorded[1].ErrorText == "" {
		t.Errorf("item 2 (row moved since the preview) should be recorded as failed with a reason: %+v", store.recorded[1])
	}
	if len(outcomes) != 2 {
		t.Fatalf("expected two outcomes, got %d", len(outcomes))
	}
}

// The chat shows the confirmation's Message and nothing else, so the reason an
// item was refused has to be in it — "ไม่สำเร็จ 1 รายการ" alone leaves the owner
// guessing whether to retry.
func TestConfirmationMessageCarriesEachFailureReason(t *testing.T) {
	plan := &entity.AIActionPlan{ID: "plan-3", Status: entity.AIActionPlanStatusPartial, Items: []entity.AIActionPlanItem{
		{ID: 1, Status: entity.AIActionItemStatusExecuted, PreviewJSON: `{"title":"กะเพรา"}`},
		{ID: 2, Status: entity.AIActionItemStatusFailed, PreviewJSON: `{"title":"หมูสับ"}`,
			ErrorText: "ข้อมูลเปลี่ยนไประหว่างรอยืนยัน: สต๊อก หมูสับ 5000 กรัม → 9000 กรัม ยังไม่ได้แก้ ขอให้สั่งใหม่อีกครั้ง"},
	}}
	confirmation := newAIActionPlanConfirmation(plan, false)
	for _, want := range []string{"สำเร็จ 1 รายการ ไม่สำเร็จ 1 รายการ", "หมูสับ: ", "5000 กรัม → 9000 กรัม"} {
		if !strings.Contains(confirmation.Message, want) {
			t.Errorf("the message should carry %q:\n%s", want, confirmation.Message)
		}
	}
	if strings.Contains(confirmation.Message, "กะเพรา:") {
		t.Errorf("a succeeded item must not be listed as a failure:\n%s", confirmation.Message)
	}
}
