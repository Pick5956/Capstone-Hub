package service

import (
	"encoding/json"
	"math"
	"reflect"
	"strings"
	"testing"
)

func validResolvedPlan() ResolvedPlan {
	return ResolvedPlan{
		SchemaVersion:    ResolvedPlanSchemaVersion,
		OriginalQuestion: "Which menu is the second best seller this month?",
		ResolvedQuestion: "Rank menus by quantity sold this month and return rank 2.",
		Task:             AITaskRetrieveFact,
		Domain:           ResolvedPlanDomainMenu,
		Operation:        ResolvedPlanOperationRank,
		Parameters: ResolvedPlanParameters{
			Metrics:  []ResolvedPlanMetric{ResolvedPlanMetricQuantity},
			GroupBy:  []ResolvedPlanGroupDimension{ResolvedPlanGroupMenu},
			Entities: []ResolvedPlanEntityRef{},
			TimeRange: &ResolvedPlanTimeRange{
				Kind:      ResolvedPlanTimeRangeMonth,
				Label:     "this month",
				StartDate: "2026-08-01",
				EndDate:   "2026-09-01",
				Timezone:  ResolvedPlanTimezone,
			},
			CompareTimeRange: nil,
			DayPart:          nil,
			Filters:          []ResolvedPlanFilter{},
			Ranking: &ResolvedPlanRanking{
				Metric:    ResolvedPlanMetricQuantity,
				Direction: ResolvedPlanRankHigh,
				Rank:      2,
				Limit:     1,
			},
		},
		ToolHint: AIToolGetTopSellingMenus,
		Resolution: ResolvedPlanResolution{
			InheritedFields:       []ResolvedPlanInheritedField{},
			MissingFields:         []ResolvedPlanField{},
			NeedsClarification:    false,
			ClarificationQuestion: "",
			Confidence:            0.96,
		},
		Policy: ResolvedPlanPolicy{
			Risk:                 ResolvedPlanRiskLow,
			ReadOnly:             true,
			RequiresConfirmation: false,
		},
		ResponseStyle: ResolvedPlanResponseNormal,
	}
}

func TestResolvedPlanNormalizeIsIdempotentAndDoesNotMutateInput(t *testing.T) {
	plan := validResolvedPlan()
	plan.SchemaVersion = " 1.0 "
	plan.OriginalQuestion = "  Which menu?  "
	plan.ResolvedQuestion = "  Rank the menus.  "
	plan.Task = AITask(" RETRIEVE_FACT ")
	plan.Domain = ResolvedPlanDomain(" MENU ")
	plan.Operation = ResolvedPlanOperation(" RANK ")
	plan.Parameters.Metrics = []ResolvedPlanMetric{" QUANTITY ", "quantity"}
	plan.Parameters.GroupBy = []ResolvedPlanGroupDimension{" MENU ", "menu"}
	plan.Parameters.TimeRange.Label = " this month "
	plan.Parameters.Filters = []ResolvedPlanFilter{{
		Field:    " ORDER.STATUS ",
		Operator: ResolvedPlanFilterOperator(" IN "),
		Values:   []string{" served ", "served"},
	}}
	plan.ToolHint = AIToolName(" GET_TOP_SELLING_MENUS ")
	plan.Resolution.InheritedFields = []ResolvedPlanInheritedField{{
		Field:        ResolvedPlanField(" PARAMETERS.RANKING "),
		Source:       ResolvedPlanContextSource(" CONVERSATION_HISTORY "),
		SourceTurnID: " turn-1 ",
	}}
	plan.Policy.Risk = ResolvedPlanRiskLevel(" LOW ")
	plan.ResponseStyle = ResolvedPlanResponseStyle(" NORMAL ")

	originalMetrics := append([]ResolvedPlanMetric(nil), plan.Parameters.Metrics...)
	originalFilterValues := append([]string(nil), plan.Parameters.Filters[0].Values...)
	originalRangeLabel := plan.Parameters.TimeRange.Label

	normalized := plan.Normalize()
	if err := normalized.Validate(); err != nil {
		t.Fatalf("normalized plan should be valid: %v", err)
	}
	if normalized.OriginalQuestion != "Which menu?" || normalized.ResolvedQuestion != "Rank the menus." {
		t.Fatalf("questions were not trimmed: %#v", normalized)
	}
	if got := normalized.Parameters.Metrics; !reflect.DeepEqual(got, []ResolvedPlanMetric{ResolvedPlanMetricQuantity}) {
		t.Fatalf("metrics = %#v, want stable deduplicated quantity", got)
	}
	if got := normalized.Parameters.Filters[0].Values; !reflect.DeepEqual(got, []string{"served"}) {
		t.Fatalf("filter values = %#v, want [served]", got)
	}
	if !reflect.DeepEqual(normalized, normalized.Normalize()) {
		t.Fatal("Normalize is not idempotent")
	}

	if !reflect.DeepEqual(plan.Parameters.Metrics, originalMetrics) {
		t.Fatalf("Normalize mutated input metrics: %#v", plan.Parameters.Metrics)
	}
	if !reflect.DeepEqual(plan.Parameters.Filters[0].Values, originalFilterValues) {
		t.Fatalf("Normalize mutated input filter values: %#v", plan.Parameters.Filters[0].Values)
	}
	if plan.Parameters.TimeRange.Label != originalRangeLabel {
		t.Fatalf("Normalize mutated input time range: %q", plan.Parameters.TimeRange.Label)
	}

	normalized.Parameters.Metrics[0] = ResolvedPlanMetricRevenue
	normalized.Parameters.Filters[0].Values[0] = "cancelled"
	normalized.Parameters.TimeRange.Label = "changed"
	if !reflect.DeepEqual(plan.Parameters.Metrics, originalMetrics) ||
		!reflect.DeepEqual(plan.Parameters.Filters[0].Values, originalFilterValues) ||
		plan.Parameters.TimeRange.Label != originalRangeLabel {
		t.Fatal("normalized plan still aliases input data")
	}
}

func TestResolvedPlanValidateAcceptsRepresentativePlans(t *testing.T) {
	menuRank := validResolvedPlan()
	menuRank.Resolution.InheritedFields = []ResolvedPlanInheritedField{{
		Field:        ResolvedPlanFieldRanking,
		Source:       ResolvedPlanSourceConversation,
		SourceTurnID: "history-4",
	}}

	salesCompare := validResolvedPlan()
	salesCompare.OriginalQuestion = "Compare this month with last month."
	salesCompare.ResolvedQuestion = salesCompare.OriginalQuestion
	salesCompare.Task = AITaskAnalyzeData
	salesCompare.Domain = ResolvedPlanDomainSales
	salesCompare.Operation = ResolvedPlanOperationCompare
	salesCompare.Parameters.Metrics = []ResolvedPlanMetric{ResolvedPlanMetricRevenue, ResolvedPlanMetricOrderCount}
	salesCompare.Parameters.GroupBy = []ResolvedPlanGroupDimension{}
	salesCompare.Parameters.Ranking = nil
	salesCompare.Parameters.CompareTimeRange = &ResolvedPlanTimeRange{
		Kind:      ResolvedPlanTimeRangeMonth,
		Label:     "last month",
		StartDate: "2026-07-01",
		EndDate:   "2026-08-01",
		Timezone:  ResolvedPlanTimezone,
	}
	salesCompare.ToolHint = ""

	inventoryFact := validResolvedPlan()
	inventoryFact.OriginalQuestion = "Which ingredients are low in stock?"
	inventoryFact.ResolvedQuestion = inventoryFact.OriginalQuestion
	inventoryFact.Domain = ResolvedPlanDomainInventory
	inventoryFact.Operation = ResolvedPlanOperationRetrieve
	inventoryFact.Parameters.Metrics = []ResolvedPlanMetric{ResolvedPlanMetricStockLevel}
	inventoryFact.Parameters.GroupBy = []ResolvedPlanGroupDimension{ResolvedPlanGroupIngredient}
	inventoryFact.Parameters.TimeRange = nil
	inventoryFact.Parameters.Ranking = nil
	inventoryFact.ToolHint = AIToolGetLowStockIngredients

	generalChat := validResolvedPlan()
	generalChat.OriginalQuestion = "Thanks."
	generalChat.ResolvedQuestion = generalChat.OriginalQuestion
	generalChat.Task = AITaskGeneralChat
	generalChat.Domain = ResolvedPlanDomainGeneral
	generalChat.Operation = ResolvedPlanOperationChat
	generalChat.Parameters = emptyResolvedPlanParameters()
	generalChat.ToolHint = ""

	clarification := validResolvedPlan()
	clarification.OriginalQuestion = "How about that one?"
	clarification.ResolvedQuestion = clarification.OriginalQuestion
	clarification.Task = AITaskUnclear
	clarification.Domain = ResolvedPlanDomainMenu
	clarification.Operation = ResolvedPlanOperationClarify
	clarification.Parameters = emptyResolvedPlanParameters()
	clarification.ToolHint = ""
	clarification.Resolution.MissingFields = []ResolvedPlanField{ResolvedPlanFieldEntities}
	clarification.Resolution.NeedsClarification = true
	clarification.Resolution.ClarificationQuestion = "Which menu do you mean?"

	riskyAction := validResolvedPlan()
	riskyAction.OriginalQuestion = "Delete this menu."
	riskyAction.ResolvedQuestion = riskyAction.OriginalQuestion
	riskyAction.Task = AITaskRiskyAction
	riskyAction.Domain = ResolvedPlanDomainMenu
	riskyAction.Operation = ResolvedPlanOperationExecuteAction
	riskyAction.Parameters = emptyResolvedPlanParameters()
	riskyAction.ToolHint = ""
	riskyAction.Policy = ResolvedPlanPolicy{
		Risk:                 ResolvedPlanRiskHigh,
		ReadOnly:             false,
		RequiresConfirmation: true,
	}

	entityCompare := validResolvedPlan()
	entityCompare.OriginalQuestion = "Compare pad thai with fried rice."
	entityCompare.ResolvedQuestion = entityCompare.OriginalQuestion
	entityCompare.Operation = ResolvedPlanOperationCompare
	entityCompare.Parameters.Metrics = []ResolvedPlanMetric{ResolvedPlanMetricPrice}
	entityCompare.Parameters.GroupBy = []ResolvedPlanGroupDimension{}
	entityCompare.Parameters.Entities = []ResolvedPlanEntityRef{
		{Type: ResolvedPlanEntityMenu, Name: "Pad Thai"},
		{Type: ResolvedPlanEntityMenu, Name: "Fried Rice"},
	}
	entityCompare.Parameters.TimeRange = nil
	entityCompare.Parameters.Ranking = nil
	entityCompare.ToolHint = ""

	followUpDetail := validResolvedPlan()
	followUpDetail.OriginalQuestion = "And what is its cost?"
	followUpDetail.ResolvedQuestion = "What is the cost of menu rank 2 from the previous result?"
	followUpDetail.Operation = ResolvedPlanOperationDetail
	followUpDetail.Parameters.Metrics = []ResolvedPlanMetric{ResolvedPlanMetricCost}
	followUpDetail.Parameters.GroupBy = []ResolvedPlanGroupDimension{}
	followUpDetail.Parameters.Entities = []ResolvedPlanEntityRef{{
		Type: ResolvedPlanEntityMenu, ResultIndex: 2, SourceTurnID: "turn-7",
	}}
	followUpDetail.Parameters.TimeRange = nil
	followUpDetail.Parameters.Ranking = nil
	followUpDetail.ToolHint = ""
	followUpDetail.Resolution.InheritedFields = []ResolvedPlanInheritedField{{
		Field: ResolvedPlanFieldEntities, Source: ResolvedPlanSourceConversation, SourceTurnID: "turn-7",
	}}

	tests := map[string]ResolvedPlan{
		"menu rank with inherited context": menuRank,
		"sales period comparison":          salesCompare,
		"inventory fact":                   inventoryFact,
		"general chat":                     generalChat,
		"clarification":                    clarification,
		"future confirmed action":          riskyAction,
		"entity comparison":                entityCompare,
		"follow-up entity provenance":      followUpDetail,
	}
	for name, plan := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := NormalizeAndValidateResolvedPlan(plan); err != nil {
				t.Fatalf("representative plan should be valid: %v", err)
			}
		})
	}
}

func TestResolvedPlanValidateRejectsInvalidPlans(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*ResolvedPlan)
	}{
		{"missing schema version", func(p *ResolvedPlan) { p.SchemaVersion = "" }},
		{"unsupported schema version", func(p *ResolvedPlan) { p.SchemaVersion = "2.0" }},
		{"missing original question", func(p *ResolvedPlan) { p.OriginalQuestion = "" }},
		{"unknown task", func(p *ResolvedPlan) { p.Task = AITask("unknown") }},
		{"unknown domain", func(p *ResolvedPlan) { p.Domain = ResolvedPlanDomain("unknown") }},
		{"unknown operation", func(p *ResolvedPlan) { p.Operation = ResolvedPlanOperation("unknown") }},
		{"task operation mismatch", func(p *ResolvedPlan) { p.Operation = ResolvedPlanOperationChat }},
		{"unknown response style", func(p *ResolvedPlan) { p.ResponseStyle = ResolvedPlanResponseStyle("essay") }},
		{"unknown metric", func(p *ResolvedPlan) { p.Parameters.Metrics[0] = ResolvedPlanMetric("likes") }},
		{"duplicate metric", func(p *ResolvedPlan) { p.Parameters.Metrics = append(p.Parameters.Metrics, p.Parameters.Metrics[0]) }},
		{"unknown group", func(p *ResolvedPlan) { p.Parameters.GroupBy[0] = ResolvedPlanGroupDimension("branch") }},
		{"too many groups", func(p *ResolvedPlan) {
			p.Parameters.GroupBy = []ResolvedPlanGroupDimension{ResolvedPlanGroupMenu, ResolvedPlanGroupDay, ResolvedPlanGroupHour}
		}},
		{"unknown entity type", func(p *ResolvedPlan) {
			p.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityType("supplier"), Name: "A"}}
		}},
		{"empty entity reference", func(p *ResolvedPlan) {
			p.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityMenu}}
		}},
		{"result entity without source turn", func(p *ResolvedPlan) {
			p.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityMenu, ResultIndex: 2}}
		}},
		{"entity source absent from inherited fields", func(p *ResolvedPlan) {
			p.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityMenu, Name: "Pad Thai", SourceTurnID: "turn-1"}}
		}},
		{"inherited entity source absent from entity", func(p *ResolvedPlan) {
			p.Parameters.Entities = []ResolvedPlanEntityRef{{Type: ResolvedPlanEntityMenu, Name: "Pad Thai"}}
			p.Resolution.InheritedFields = []ResolvedPlanInheritedField{{
				Field: ResolvedPlanFieldEntities, Source: ResolvedPlanSourceConversation, SourceTurnID: "turn-1",
			}}
		}},
		{"duplicate entity reference", func(p *ResolvedPlan) {
			entity := ResolvedPlanEntityRef{Type: ResolvedPlanEntityMenu, Name: "Pad Thai"}
			p.Parameters.Entities = []ResolvedPlanEntityRef{entity, entity}
		}},
		{"wrong timezone", func(p *ResolvedPlan) { p.Parameters.TimeRange.Timezone = "UTC" }},
		{"invalid date", func(p *ResolvedPlan) { p.Parameters.TimeRange.StartDate = "2026-02-30" }},
		{"reversed dates", func(p *ResolvedPlan) { p.Parameters.TimeRange.EndDate = "2026-07-01" }},
		{"compare range without primary", func(p *ResolvedPlan) {
			p.Parameters.CompareTimeRange = p.Parameters.TimeRange
			p.Parameters.TimeRange = nil
		}},
		{"same comparison ranges", func(p *ResolvedPlan) {
			copyRange := *p.Parameters.TimeRange
			p.Parameters.CompareTimeRange = &copyRange
		}},
		{"same comparison bounds with different kind", func(p *ResolvedPlan) {
			copyRange := *p.Parameters.TimeRange
			copyRange.Kind = ResolvedPlanTimeRangeCustom
			p.Parameters.CompareTimeRange = &copyRange
		}},
		{"invalid day part", func(p *ResolvedPlan) {
			p.Parameters.DayPart = &ResolvedPlanDayPart{Label: "late", StartHour: 22, EndHour: 21}
		}},
		{"unsafe filter field", func(p *ResolvedPlan) {
			p.Parameters.Filters = []ResolvedPlanFilter{{Field: "order.status;drop", Operator: ResolvedPlanFilterEqual, Values: []string{"served"}}}
		}},
		{"empty filter values", func(p *ResolvedPlan) {
			p.Parameters.Filters = []ResolvedPlanFilter{{Field: "order.status", Operator: ResolvedPlanFilterEqual, Values: []string{}}}
		}},
		{"rank missing ranking", func(p *ResolvedPlan) { p.Parameters.Ranking = nil }},
		{"ranking on non-rank operation", func(p *ResolvedPlan) { p.Operation = ResolvedPlanOperationRetrieve }},
		{"rank missing group", func(p *ResolvedPlan) { p.Parameters.GroupBy = []ResolvedPlanGroupDimension{} }},
		{"ranking metric absent", func(p *ResolvedPlan) { p.Parameters.Ranking.Metric = ResolvedPlanMetricRevenue }},
		{"unknown rank direction", func(p *ResolvedPlan) { p.Parameters.Ranking.Direction = ResolvedPlanRankDirection("sideways") }},
		{"rank below one", func(p *ResolvedPlan) { p.Parameters.Ranking.Rank = 0 }},
		{"ranking limit too high", func(p *ResolvedPlan) { p.Parameters.Ranking.Limit = 101 }},
		{"compare missing second target", func(p *ResolvedPlan) {
			p.Operation = ResolvedPlanOperationCompare
			p.Parameters.Ranking = nil
		}},
		{"retrieve missing executable parameters", func(p *ResolvedPlan) {
			p.Operation = ResolvedPlanOperationRetrieve
			p.Parameters.Metrics = []ResolvedPlanMetric{}
			p.Parameters.GroupBy = []ResolvedPlanGroupDimension{}
			p.Parameters.Ranking = nil
			p.ToolHint = ""
		}},
		{"confidence below zero", func(p *ResolvedPlan) { p.Resolution.Confidence = -0.1 }},
		{"confidence above one", func(p *ResolvedPlan) { p.Resolution.Confidence = 1.1 }},
		{"confidence NaN", func(p *ResolvedPlan) { p.Resolution.Confidence = math.NaN() }},
		{"confidence positive infinity", func(p *ResolvedPlan) { p.Resolution.Confidence = math.Inf(1) }},
		{"inherited field without source turn", func(p *ResolvedPlan) {
			p.Resolution.InheritedFields = []ResolvedPlanInheritedField{{Field: ResolvedPlanFieldEntities, Source: ResolvedPlanSourceConversation}}
		}},
		{"unknown missing field", func(p *ResolvedPlan) {
			p.Resolution.MissingFields = []ResolvedPlanField{"parameters.unknown"}
			p.Resolution.NeedsClarification = true
			p.Resolution.ClarificationQuestion = "What is missing?"
		}},
		{"field both inherited and missing", func(p *ResolvedPlan) {
			p.Resolution.InheritedFields = []ResolvedPlanInheritedField{{
				Field: ResolvedPlanFieldEntities, Source: ResolvedPlanSourceConversation, SourceTurnID: "turn-1",
			}}
			p.Resolution.MissingFields = []ResolvedPlanField{ResolvedPlanFieldEntities}
			p.Resolution.NeedsClarification = true
			p.Resolution.ClarificationQuestion = "Which menu?"
		}},
		{"clarification flag without unclear task", func(p *ResolvedPlan) {
			p.Resolution.MissingFields = []ResolvedPlanField{ResolvedPlanFieldEntities}
			p.Resolution.NeedsClarification = true
			p.Resolution.ClarificationQuestion = "Which menu?"
		}},
		{"non-execution is not read only", func(p *ResolvedPlan) { p.Policy.ReadOnly = false }},
		{"read-only asks for confirmation", func(p *ResolvedPlan) { p.Policy.RequiresConfirmation = true }},
		{"unsupported tool", func(p *ResolvedPlan) { p.ToolHint = AIToolName("drop_database") }},
		{"tool domain mismatch", func(p *ResolvedPlan) { p.ToolHint = AIToolGetLowStockIngredients }},
		{"chat smuggles tool", func(p *ResolvedPlan) {
			p.Task = AITaskGeneralChat
			p.Operation = ResolvedPlanOperationChat
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			plan := validResolvedPlan().Normalize()
			test.mutate(&plan)
			if err := plan.Validate(); err == nil {
				t.Fatal("Validate accepted an invalid plan")
			}
		})
	}
}

func TestResolvedPlanValidateConfidenceBoundaries(t *testing.T) {
	for _, confidence := range []float64{0, 1} {
		plan := validResolvedPlan()
		plan.Resolution.Confidence = confidence
		if err := plan.Validate(); err != nil {
			t.Fatalf("confidence %v should be accepted: %v", confidence, err)
		}
	}
}

func TestResolvedPlanJSONRoundTrip(t *testing.T) {
	plan := validResolvedPlan()
	plan.Resolution.Confidence = 0
	payload, err := json.Marshal(plan)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	for _, key := range []string{
		`"schema_version"`, `"original_question"`, `"resolved_question"`,
		`"compare_time_range"`, `"inherited_fields"`, `"response_style"`,
	} {
		if !strings.Contains(string(payload), key) {
			t.Fatalf("JSON is missing snake_case key %s: %s", key, payload)
		}
	}

	var decoded ResolvedPlan
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	decoded, err = NormalizeAndValidateResolvedPlan(decoded)
	if err != nil {
		t.Fatalf("round-tripped plan is invalid: %v", err)
	}
	if !reflect.DeepEqual(decoded, plan) {
		t.Fatalf("round trip changed plan\n got: %#v\nwant: %#v", decoded, plan)
	}
}

func TestResolvedPlanJSONSchemaIsStrictAndSelfContained(t *testing.T) {
	schema := ResolvedPlanJSONSchema()
	payload, err := json.Marshal(schema)
	if err != nil {
		t.Fatalf("schema must be valid JSON: %v", err)
	}
	if len(payload) == 0 {
		t.Fatal("schema JSON is empty")
	}
	if schema["title"] != "ResolvedPlan" || schema["additionalProperties"] != false {
		t.Fatalf("unexpected root schema: %#v", schema)
	}

	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("root properties has type %T", schema["properties"])
	}
	parameters, ok := properties["parameters"].(map[string]any)
	if !ok || parameters["additionalProperties"] != false {
		t.Fatalf("parameters schema is not strict: %#v", properties["parameters"])
	}
	policy, ok := properties["policy"].(map[string]any)
	if !ok || policy["additionalProperties"] != false {
		t.Fatalf("policy schema is not strict: %#v", properties["policy"])
	}

	required, ok := schema["required"].([]string)
	if !ok || len(required) != 11 {
		t.Fatalf("root required = %#v, want all 11 fields", schema["required"])
	}

	toolSchema, ok := properties["tool_hint"].(map[string]any)
	if !ok {
		t.Fatalf("tool_hint schema has type %T", properties["tool_hint"])
	}
	filterArray := parameters["properties"].(map[string]any)["filters"].(map[string]any)
	filterSchema := filterArray["items"].(map[string]any)
	filterValues := filterSchema["properties"].(map[string]any)["values"].(map[string]any)
	if filterValues["minItems"] != 1 {
		t.Fatalf("filter values minItems = %#v, want 1", filterValues["minItems"])
	}
	toolValues, ok := toolSchema["enum"].([]string)
	tools := supportedReadOnlyToolNames()
	if !ok || len(toolValues) != len(tools)+1 || toolValues[0] != "" {
		t.Fatalf("tool_hint enum = %#v", toolSchema["enum"])
	}
	for i, tool := range tools {
		if toolValues[i+1] != string(tool) {
			t.Fatalf("tool_hint enum[%d] = %q, want %q", i+1, toolValues[i+1], tool)
		}
		hasDomain := false
		for _, domain := range resolvedPlanDomains {
			if toolSupportsResolvedPlanDomain(tool, domain) {
				hasDomain = true
				break
			}
		}
		if !hasDomain {
			t.Fatalf("supported tool %q has no ResolvedPlan domain policy", tool)
		}
	}

	taskSchema := properties["task"].(map[string]any)
	taskValues := taskSchema["enum"].([]string)
	taskValues[0] = "tampered"
	secondSchema := ResolvedPlanJSONSchema()
	secondProperties := secondSchema["properties"].(map[string]any)
	secondTaskValues := secondProperties["task"].(map[string]any)["enum"].([]string)
	if secondTaskValues[0] == "tampered" {
		t.Fatal("ResolvedPlanJSONSchema returned shared mutable enum data")
	}
}

func emptyResolvedPlanParameters() ResolvedPlanParameters {
	return ResolvedPlanParameters{
		Metrics:          []ResolvedPlanMetric{},
		GroupBy:          []ResolvedPlanGroupDimension{},
		Entities:         []ResolvedPlanEntityRef{},
		TimeRange:        nil,
		CompareTimeRange: nil,
		DayPart:          nil,
		Filters:          []ResolvedPlanFilter{},
		Ranking:          nil,
	}
}
