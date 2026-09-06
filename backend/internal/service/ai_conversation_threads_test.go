package service

import (
	"encoding/json"
	"strings"
	"testing"
)

// The automatic title is the question on one line, cut short — never a model
// call. A rename by the owner is stored elsewhere and wins; this only fills
// an empty title, which the repository enforces.
func TestConversationTitleFromQuestion(t *testing.T) {
	if got := aiConversationTitleFromQuestion("  ยอดขาย   สัปดาห์นี้\nเท่าไหร่ "); got != "ยอดขาย สัปดาห์นี้ เท่าไหร่" {
		t.Errorf("whitespace not collapsed: %q", got)
	}
	long := strings.Repeat("ก", aiConversationTitleMaxRunes+15)
	got := aiConversationTitleFromQuestion(long)
	if runes := []rune(got); len(runes) != aiConversationTitleMaxRunes+1 || !strings.HasSuffix(got, "…") {
		t.Errorf("long question not cut with an ellipsis: %q (%d runes)", got, len(runes))
	}
	exact := strings.Repeat("ข", aiConversationTitleMaxRunes)
	if got := aiConversationTitleFromQuestion(exact); got != exact {
		t.Errorf("a question that fits must not get an ellipsis: %q", got)
	}
}

// What a turn keeps for the screen: the chart and the tools, keyed the way
// the ask response is, and never anything called snapshot — the repository
// would refuse the row.
func TestTurnDisplayCarriesChartAndToolsOnly(t *testing.T) {
	response := &AIAskResponse{
		Model:        "gemini-3.5-flash-lite",
		ScopeAssumed: true,
		ToolsUsed:    []AIToolName{AIToolGetSalesForPeriod},
		Chart:        &AIChartData{Kind: "bar", Title: "เทียบ"},
		ActionPlan:   &AIActionPlanResponse{ID: "plan-1"},
		FollowUps:    []string{"วันไหนขายดีสุด"},
	}
	raw, err := json.Marshal(aiTurnDisplayFor(response))
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]interface{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"chart", "tools_used", "scope_assumed", "action_plan_id", "model", "follow_ups"} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("display is missing %q: %s", key, raw)
		}
	}
	if _, ok := decoded["forecast"]; ok {
		t.Errorf("an absent forecast must be omitted, not null: %s", raw)
	}
	if strings.Contains(strings.ToLower(string(raw)), "snapshot") {
		t.Errorf("display must never carry a snapshot: %s", raw)
	}
}
