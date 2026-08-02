package entity

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestAIConversationModelsDoNotContainOperationalSnapshots(t *testing.T) {
	for _, model := range []interface{}{AIConversation{}, AIConversationTurn{}} {
		modelType := reflect.TypeOf(model)
		for index := 0; index < modelType.NumField(); index++ {
			field := modelType.Field(index)
			if strings.Contains(strings.ToLower(field.Name), "snapshot") {
				t.Fatalf("%s must not persist operational snapshot field %s", modelType.Name(), field.Name)
			}
		}
	}
}

func TestAIConversationMetadataIsNotSerializedToClients(t *testing.T) {
	conversationJSON, err := json.Marshal(AIConversation{StateJSON: `{"domain":"menu"}`})
	if err != nil {
		t.Fatalf("marshal AIConversation: %v", err)
	}
	turnJSON, err := json.Marshal(AIConversationTurn{
		ResolvedPlanJSON:     `{"domain":"menu"}`,
		ContextDeltaJSON:     `{"metric":"price"}`,
		ResultEntityRefsJSON: `[{"kind":"menu","id":1}]`,
	})
	if err != nil {
		t.Fatalf("marshal AIConversationTurn: %v", err)
	}

	for _, raw := range []string{string(conversationJSON), string(turnJSON)} {
		for _, forbidden := range []string{"state_json", "resolved_plan_json", "context_delta_json", "result_entity_refs_json"} {
			if strings.Contains(raw, forbidden) {
				t.Fatalf("private AI metadata %q leaked in JSON: %s", forbidden, raw)
			}
		}
	}
}

func TestAIConversationTurnCascadeConstraintIsDeclared(t *testing.T) {
	field, ok := reflect.TypeOf(AIConversationTurn{}).FieldByName("Conversation")
	if !ok {
		t.Fatal("AIConversationTurn has no Conversation relationship")
	}
	tag := field.Tag.Get("gorm")
	if !strings.Contains(tag, "OnDelete:CASCADE") {
		t.Fatalf("conversation turn relationship must cascade on parent deletion: %q", tag)
	}
}
