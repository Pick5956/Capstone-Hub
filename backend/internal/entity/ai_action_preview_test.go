package entity

import (
	"encoding/json"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm/schema"
)

func TestAIActionPreviewDoesNotExposeConfirmationHashOrResultMetadata(t *testing.T) {
	preview := AIActionPreview{
		ID:                    "preview-1",
		ConfirmationTokenHash: []byte("secret-digest"),
		ResultJSON:            `{"is_available":false}`,
	}
	raw, err := json.Marshal(preview)
	if err != nil {
		t.Fatalf("marshal AIActionPreview: %v", err)
	}
	serialized := string(raw)
	for _, forbidden := range []string{"secret-digest", "confirmation_token", "result_json"} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("private action metadata %q leaked in JSON: %s", forbidden, serialized)
		}
	}
}

func TestAIActionPreviewDeclaresOnlyReviewedCanaryAndTerminalStates(t *testing.T) {
	if AIActionTypeSetMenuAvailability != "set_menu_availability" {
		t.Fatalf("unexpected canary action type %q", AIActionTypeSetMenuAvailability)
	}
	statuses := []string{
		AIActionPreviewStatusPending,
		AIActionPreviewStatusExecuted,
		AIActionPreviewStatusExpired,
		AIActionPreviewStatusStale,
		AIActionPreviewStatusCancelled,
	}
	want := []string{"pending", "executed", "expired", "stale", "cancelled"}
	for index := range want {
		if statuses[index] != want[index] {
			t.Fatalf("status %d = %q, want %q", index, statuses[index], want[index])
		}
	}

	typeInfo := reflect.TypeOf(AIActionPreview{})
	actionField, _ := typeInfo.FieldByName("ActionType")
	statusField, _ := typeInfo.FieldByName("Status")
	tokenField, _ := typeInfo.FieldByName("ConfirmationTokenHash")
	for label, tag := range map[string]string{
		"action": actionField.Tag.Get("gorm"),
		"status": statusField.Tag.Get("gorm"),
		"token":  tokenField.Tag.Get("gorm"),
	} {
		if !strings.Contains(tag, "check:") {
			t.Fatalf("%s field is missing its database check constraint: %q", label, tag)
		}
	}
}

func TestAIActionPreviewKeepsExpectedConcurrencyState(t *testing.T) {
	expectedUpdatedAt := time.Date(2026, time.August, 3, 12, 0, 0, 0, time.UTC)
	preview := AIActionPreview{
		ExpectedAvailability:    true,
		DesiredAvailability:     false,
		ExpectedTargetUpdatedAt: expectedUpdatedAt,
	}
	if !preview.ExpectedAvailability || preview.DesiredAvailability {
		t.Fatal("preview did not retain expected and desired availability independently")
	}
	if !preview.ExpectedTargetUpdatedAt.Equal(expectedUpdatedAt) {
		t.Fatalf("expected target timestamp = %s, want %s", preview.ExpectedTargetUpdatedAt, expectedUpdatedAt)
	}
}

func TestAIActionPreviewGORMMetadataParsesWithSafetyConstraints(t *testing.T) {
	parsed, err := schema.Parse(&AIActionPreview{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("parse AIActionPreview GORM schema: %v", err)
	}
	if parsed.Table != "ai_action_previews" {
		t.Fatalf("table = %q, want ai_action_previews", parsed.Table)
	}
	checks := parsed.ParseCheckConstraints()
	for _, name := range []string{
		"ai_action_previews_canary_action",
		"ai_action_previews_valid_status",
		"ai_action_previews_token_hash_size",
		"ai_action_previews_result_size",
	} {
		if _, ok := checks[name]; !ok {
			t.Fatalf("missing parsed database constraint %q", name)
		}
	}
	for _, relation := range []string{"Restaurant", "Owner", "Conversation", "Turn", "TargetMenuItem"} {
		if _, ok := parsed.Relationships.Relations[relation]; !ok {
			t.Fatalf("missing parsed relationship %q", relation)
		}
	}
}
