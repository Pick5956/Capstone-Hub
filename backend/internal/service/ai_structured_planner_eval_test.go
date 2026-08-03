package service

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const (
	structuredPlannerEvalFixtureVersion = "1"
	structuredPlannerEvalActorRole      = "owner"
	structuredPlannerEvalReferenceTime  = "2026-08-03T12:00:00+07:00"
	structuredPlannerEvalCaseCount      = 16
)

type structuredPlannerEvalFixture struct {
	SchemaVersion string                      `json:"schema_version"`
	ActorRole     string                      `json:"actor_role"`
	ReferenceTime string                      `json:"reference_time"`
	Cases         []structuredPlannerEvalCase `json:"cases"`
}

type structuredPlannerEvalCase struct {
	Name     string                           `json:"name"`
	Category string                           `json:"category"`
	Question string                           `json:"question"`
	Context  []StructuredPlannerContextItem   `json:"context"`
	Expected structuredPlannerEvalExpectation `json:"expected"`
}

type structuredPlannerEvalExpectation struct {
	Tasks                   []AITask                           `json:"tasks"`
	Domains                 []ResolvedPlanDomain               `json:"domains"`
	Operations              []ResolvedPlanOperation            `json:"operations"`
	RequiredMetrics         []ResolvedPlanMetric               `json:"required_metrics"`
	RequiredGroupBy         []ResolvedPlanGroupDimension       `json:"required_group_by,omitempty"`
	ToolHints               []AIToolName                       `json:"tool_hints"`
	NeedsClarification      *bool                              `json:"needs_clarification"`
	Risk                    ResolvedPlanRiskLevel              `json:"risk"`
	ReadOnly                *bool                              `json:"read_only"`
	RequiresConfirmation    *bool                              `json:"requires_confirmation"`
	Action                  *structuredPlannerEvalAction       `json:"action,omitempty"`
	TimeRange               *structuredPlannerEvalTimeRange    `json:"time_range,omitempty"`
	DayPart                 *structuredPlannerEvalDayPart      `json:"day_part,omitempty"`
	Ranking                 *structuredPlannerEvalRanking      `json:"ranking,omitempty"`
	RequiredInheritedFields []structuredPlannerEvalInheritance `json:"required_inherited_fields,omitempty"`
	Entity                  *structuredPlannerEvalEntity       `json:"entity,omitempty"`
}

type structuredPlannerEvalAction struct {
	Type        ResolvedPlanActionType `json:"type"`
	IsAvailable *bool                  `json:"is_available"`
}

type structuredPlannerEvalTimeRange struct {
	Kind      ResolvedPlanTimeRangeKind `json:"kind"`
	StartDate string                    `json:"start_date"`
	EndDate   string                    `json:"end_date"`
}

type structuredPlannerEvalDayPart struct {
	StartHour int `json:"start_hour"`
	EndHour   int `json:"end_hour"`
}

type structuredPlannerEvalRanking struct {
	Metric    ResolvedPlanMetric        `json:"metric"`
	Direction ResolvedPlanRankDirection `json:"direction"`
	Rank      int                       `json:"rank"`
}

type structuredPlannerEvalInheritance struct {
	Field        ResolvedPlanField `json:"field"`
	SourceTurnID string            `json:"source_turn_id"`
}

type structuredPlannerEvalEntity struct {
	Type         ResolvedPlanEntityType `json:"type"`
	NameContains string                 `json:"name_contains,omitempty"`
	ResultIndex  int                    `json:"result_index,omitempty"`
	SourceTurnID string                 `json:"source_turn_id,omitempty"`
}

func loadStructuredPlannerEvalFixture(t *testing.T) structuredPlannerEvalFixture {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", "ai_structured_planner_cases.json"))
	if err != nil {
		t.Fatalf("read structured planner evaluation fixture: %v", err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()

	var fixture structuredPlannerEvalFixture
	if err := decoder.Decode(&fixture); err != nil {
		t.Fatalf("decode structured planner evaluation fixture: %v", err)
	}
	if err := requireStructuredPlannerEvalEOF(decoder); err != nil {
		t.Fatalf("decode structured planner evaluation fixture: %v", err)
	}
	return fixture
}

func requireStructuredPlannerEvalEOF(decoder *json.Decoder) error {
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return ErrStructuredPlannerJSON
		}
		return err
	}
	return nil
}

// TestStructuredPlannerEvalFixtureIsValid is a normal-CI guard. It validates
// only local JSON and contracts; it never constructs a provider or calls an
// external service.
func TestStructuredPlannerEvalFixtureIsValid(t *testing.T) {
	fixture := loadStructuredPlannerEvalFixture(t)
	if fixture.SchemaVersion != structuredPlannerEvalFixtureVersion {
		t.Fatalf("fixture schema_version = %q, want %q", fixture.SchemaVersion, structuredPlannerEvalFixtureVersion)
	}
	if fixture.ActorRole != structuredPlannerEvalActorRole {
		t.Fatalf("fixture actor_role = %q, want owner-only scenarios", fixture.ActorRole)
	}
	if fixture.ReferenceTime != structuredPlannerEvalReferenceTime {
		t.Fatalf("fixture reference_time = %q, want fixed Bangkok time %q", fixture.ReferenceTime, structuredPlannerEvalReferenceTime)
	}
	referenceTime, err := time.Parse(time.RFC3339, fixture.ReferenceTime)
	if err != nil {
		t.Fatalf("parse fixture reference_time: %v", err)
	}
	_, offsetSeconds := referenceTime.Zone()
	if offsetSeconds != 7*60*60 {
		t.Fatalf("fixture reference_time offset = %d, want Bangkok UTC+07:00", offsetSeconds)
	}
	if len(fixture.Cases) != structuredPlannerEvalCaseCount {
		t.Fatalf("fixture cases = %d, want bounded set of %d", len(fixture.Cases), structuredPlannerEvalCaseCount)
	}

	wantCategories := map[string]int{
		"direct_read":  6,
		"follow_up":    4,
		"clarify":      2,
		"risky":        2,
		"out_of_scope": 2,
	}
	categoryCounts := make(map[string]int, len(wantCategories))
	seenNames := make(map[string]struct{}, len(fixture.Cases))
	seenQuestions := make(map[string]struct{}, len(fixture.Cases))
	for caseIndex, testCase := range fixture.Cases {
		if strings.TrimSpace(testCase.Name) == "" || strings.TrimSpace(testCase.Question) == "" {
			t.Errorf("case[%d] requires non-empty name and question", caseIndex)
			continue
		}
		if _, exists := seenNames[testCase.Name]; exists {
			t.Errorf("case[%d] has duplicate name %q", caseIndex, testCase.Name)
		}
		seenNames[testCase.Name] = struct{}{}
		if _, exists := seenQuestions[testCase.Question]; exists {
			t.Errorf("case[%d] has duplicate question", caseIndex)
		}
		seenQuestions[testCase.Question] = struct{}{}
		if _, supported := wantCategories[testCase.Category]; !supported {
			t.Errorf("%s: unsupported category %q", testCase.Name, testCase.Category)
		} else {
			categoryCounts[testCase.Category]++
		}

		normalized, normalizeErr := normalizeStructuredPlannerRequest(StructuredPlannerRequest{
			Question:      testCase.Question,
			Context:       testCase.Context,
			ReferenceTime: referenceTime,
		})
		if normalizeErr != nil {
			t.Errorf("%s: invalid planner request: %v", testCase.Name, normalizeErr)
			continue
		}
		validateStructuredPlannerEvalExpectation(t, testCase, normalized.Context)
	}
	for category, want := range wantCategories {
		if got := categoryCounts[category]; got != want {
			t.Errorf("fixture category %q has %d cases, want %d", category, got, want)
		}
	}
}

func validateStructuredPlannerEvalExpectation(t *testing.T, testCase structuredPlannerEvalCase, contextItems []StructuredPlannerContextItem) {
	t.Helper()
	expected := testCase.Expected
	if len(expected.Tasks) == 0 || len(expected.Domains) == 0 || len(expected.Operations) == 0 || len(expected.ToolHints) == 0 {
		t.Errorf("%s: expected tasks, domains, operations, and tool_hints are required", testCase.Name)
		return
	}
	for _, task := range expected.Tasks {
		if !containsValue(resolvedPlanTasks, task) {
			t.Errorf("%s: unsupported task %q", testCase.Name, task)
		}
	}
	for _, domain := range expected.Domains {
		if !containsValue(resolvedPlanDomains, domain) {
			t.Errorf("%s: unsupported domain %q", testCase.Name, domain)
		}
	}
	operationPairIsValid := false
	for _, operation := range expected.Operations {
		if !containsValue(resolvedPlanOperations, operation) {
			t.Errorf("%s: unsupported operation %q", testCase.Name, operation)
			continue
		}
		for _, task := range expected.Tasks {
			if taskAllowsOperation(task, operation) {
				operationPairIsValid = true
			}
		}
	}
	if !operationPairIsValid {
		t.Errorf("%s: no expected task permits any expected operation", testCase.Name)
	}
	for _, metric := range expected.RequiredMetrics {
		if !containsValue(resolvedPlanMetrics, metric) {
			t.Errorf("%s: unsupported metric %q", testCase.Name, metric)
		}
	}
	for _, group := range expected.RequiredGroupBy {
		if !containsValue(resolvedPlanGroupDimensions, group) {
			t.Errorf("%s: unsupported group_by %q", testCase.Name, group)
		}
	}
	for _, tool := range expected.ToolHints {
		if tool != "" && !isSupportedReadOnlyTool(tool) {
			t.Errorf("%s: unsupported tool_hint %q", testCase.Name, tool)
		}
	}
	if expected.NeedsClarification == nil || expected.ReadOnly == nil || expected.RequiresConfirmation == nil {
		t.Errorf("%s: expected policy booleans must be explicit", testCase.Name)
		return
	}
	if !containsValue(resolvedPlanRiskLevels, expected.Risk) {
		t.Errorf("%s: unsupported risk %q", testCase.Name, expected.Risk)
	}
	if containsValue(expected.Operations, ResolvedPlanOperationExecuteAction) {
		if expected.Risk != ResolvedPlanRiskHigh || *expected.ReadOnly || !*expected.RequiresConfirmation {
			t.Errorf("%s: risky execution must expect high risk, write access, and confirmation", testCase.Name)
		}
	} else if !*expected.ReadOnly || *expected.RequiresConfirmation {
		t.Errorf("%s: non-execution case must remain read-only without confirmation", testCase.Name)
	}
	expectsMenuExecutionAction := testCase.Category == "risky" &&
		containsValue(expected.Tasks, AITaskRiskyAction) &&
		containsValue(expected.Domains, ResolvedPlanDomainMenu) &&
		containsValue(expected.Operations, ResolvedPlanOperationExecuteAction)
	if expectsMenuExecutionAction && expected.Action == nil {
		t.Errorf("%s: risky menu execution requires an expected action", testCase.Name)
	}
	if !expectsMenuExecutionAction && expected.Action != nil {
		t.Errorf("%s: expected action is only allowed for risky menu execution", testCase.Name)
	}
	if expected.Action != nil {
		if !containsValue(resolvedPlanActionTypes, expected.Action.Type) {
			t.Errorf("%s: unsupported expected action type %q", testCase.Name, expected.Action.Type)
		}
		if expected.Action.IsAvailable == nil {
			t.Errorf("%s: expected action must set is_available explicitly", testCase.Name)
		}
	}
	if *expected.NeedsClarification {
		if !containsValue(expected.Tasks, AITaskUnclear) || !containsValue(expected.Operations, ResolvedPlanOperationClarify) {
			t.Errorf("%s: clarification must allow unclear/clarify", testCase.Name)
		}
	}

	if expected.TimeRange != nil {
		rangeValue := ResolvedPlanTimeRange{
			Kind:      expected.TimeRange.Kind,
			Label:     "evaluation expectation",
			StartDate: expected.TimeRange.StartDate,
			EndDate:   expected.TimeRange.EndDate,
			Timezone:  ResolvedPlanTimezone,
		}
		if err := rangeValue.validate("evaluation.time_range"); err != nil {
			t.Errorf("%s: invalid expected time range: %v", testCase.Name, err)
		}
	}
	if expected.DayPart != nil {
		dayPart := ResolvedPlanDayPart{Label: "evaluation expectation", StartHour: expected.DayPart.StartHour, EndHour: expected.DayPart.EndHour}
		if err := dayPart.validate(); err != nil {
			t.Errorf("%s: invalid expected day part: %v", testCase.Name, err)
		}
	}
	if expected.Ranking != nil {
		ranking := ResolvedPlanRanking{
			Metric: expected.Ranking.Metric, Direction: expected.Ranking.Direction,
			Rank: expected.Ranking.Rank, Limit: maxPlannerUsage(expected.Ranking.Rank),
		}
		if err := ranking.validate(expected.RequiredMetrics); err != nil {
			t.Errorf("%s: invalid expected ranking: %v", testCase.Name, err)
		}
	}

	contextByID := make(map[string]StructuredPlannerContextItem, len(contextItems))
	for _, item := range contextItems {
		contextByID[item.ID] = item
	}
	seenInheritedFields := make(map[ResolvedPlanField]struct{}, len(expected.RequiredInheritedFields))
	for _, inherited := range expected.RequiredInheritedFields {
		if !containsValue(resolvedPlanFields, inherited.Field) {
			t.Errorf("%s: unsupported inherited field %q", testCase.Name, inherited.Field)
		}
		if _, duplicate := seenInheritedFields[inherited.Field]; duplicate {
			t.Errorf("%s: duplicate inherited field %q", testCase.Name, inherited.Field)
		}
		seenInheritedFields[inherited.Field] = struct{}{}
		if _, exists := contextByID[inherited.SourceTurnID]; !exists {
			t.Errorf("%s: inherited source %q is absent from context", testCase.Name, inherited.SourceTurnID)
		}
	}
	if testCase.Category == "follow_up" && (len(contextItems) == 0 || len(expected.RequiredInheritedFields) == 0) {
		t.Errorf("%s: follow_up case requires context and an inherited-field expectation", testCase.Name)
	}
	if expected.Entity != nil {
		if !containsValue(resolvedPlanEntityTypes, expected.Entity.Type) {
			t.Errorf("%s: unsupported expected entity type %q", testCase.Name, expected.Entity.Type)
		}
		if expected.Entity.ResultIndex < 0 || expected.Entity.ResultIndex > 100 {
			t.Errorf("%s: expected entity result_index is out of range", testCase.Name)
		}
		if expected.Entity.ResultIndex > 0 && expected.Entity.SourceTurnID == "" {
			t.Errorf("%s: result-index entity requires source_turn_id", testCase.Name)
		}
		if expected.Entity.SourceTurnID != "" {
			if _, exists := contextByID[expected.Entity.SourceTurnID]; !exists {
				t.Errorf("%s: entity source %q is absent from context", testCase.Name, expected.Entity.SourceTurnID)
			}
		}
	}
}
