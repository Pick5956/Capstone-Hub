package service

// Regression cover for three rules that rejected correct plans and left the
// structured planner unusable. Each test names the real failure it prevents,
// measured against live providers before the fix:
//
//  1. Groq answered HTTP 400 for every request because the wire schema carried
//     `uniqueItems`, a keyword its strict mode refuses.
//  2. Gemini returned a correct plan for "เมนูไหนกำไรดีที่สุด" that was thrown
//     away because task=analyze_data was not allowed to use operation=rank,
//     while task=retrieve_fact was.
//  3. The same plan would still have failed for leaving group_by empty, even
//     though domain=menu leaves nothing else to rank by.

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestGroqStrictSchemaDropsUnsupportedKeywords(t *testing.T) {
	sanitized := sanitizeSchemaForGroqStrict(ResolvedPlanJSONSchema())
	encoded, err := json.Marshal(sanitized)
	if err != nil {
		t.Fatalf("encode sanitized schema: %v", err)
	}
	if strings.Contains(string(encoded), "uniqueItems") {
		t.Fatal("uniqueItems must not survive: Groq strict mode rejects the whole request over it")
	}
	// The constraints that carry meaning must survive.
	for _, keyword := range []string{"properties", "required", "enum", "maxItems", "type"} {
		if !strings.Contains(string(encoded), keyword) {
			t.Fatalf("sanitising removed %q, which the contract still needs", keyword)
		}
	}
}

// Sanitising must not reach back into the caller's schema: the same value is
// handed to the next provider in the fallback chain.
func TestGroqStrictSchemaSanitiseLeavesOriginalIntact(t *testing.T) {
	original := ResolvedPlanJSONSchema()
	before, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("encode original: %v", err)
	}
	_ = sanitizeSchemaForGroqStrict(original)
	after, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("re-encode original: %v", err)
	}
	if string(before) != string(after) {
		t.Fatal("the shared schema was mutated; the fallback provider would see a weakened contract")
	}
	if !strings.Contains(string(after), "uniqueItems") {
		t.Fatal("the original schema should still declare uniqueItems for providers that support it")
	}
}

func TestAnalyzeDataAllowsRank(t *testing.T) {
	if !taskAllowsOperation(AITaskAnalyzeData, ResolvedPlanOperationRank) {
		t.Fatal("analyze_data must allow rank: ranking menus by margin is analysis")
	}
	// The neighbouring task always allowed it; both labels must behave the same.
	if !taskAllowsOperation(AITaskRetrieveFact, ResolvedPlanOperationRank) {
		t.Fatal("retrieve_fact must keep allowing rank")
	}
	// Guard rails that must not have moved.
	if taskAllowsOperation(AITaskAnalyzeData, ResolvedPlanOperationExecuteAction) {
		t.Fatal("analyze_data must never allow execute_action")
	}
	if taskAllowsOperation(AITaskOutOfScope, ResolvedPlanOperationRank) {
		t.Fatal("out_of_scope must not gain operations")
	}
}

func TestImpliedGroupByFillsUnambiguousDomains(t *testing.T) {
	cases := []struct {
		domain   ResolvedPlanDomain
		expected ResolvedPlanGroupDimension
	}{
		{ResolvedPlanDomainMenu, ResolvedPlanGroupMenu},
		{ResolvedPlanDomainInventory, ResolvedPlanGroupIngredient},
		{ResolvedPlanDomainTable, ResolvedPlanGroupTable},
		{ResolvedPlanDomainStaff, ResolvedPlanGroupStaffMember},
	}
	for _, tc := range cases {
		got := fillImpliedGroupBy(tc.domain, ResolvedPlanOperationRank, nil)
		if len(got) != 1 || got[0] != tc.expected {
			t.Fatalf("domain %q: expected group_by %v, got %v", tc.domain, tc.expected, got)
		}
	}
}

func TestImpliedGroupByLeavesAmbiguousAndStatedValuesAlone(t *testing.T) {
	// Sales can be ranked by menu, weekday or hour — the plan has to say which.
	if got := fillImpliedGroupBy(ResolvedPlanDomainSales, ResolvedPlanOperationRank, nil); len(got) != 0 {
		t.Fatalf("ambiguous domain must not be guessed, got %v", got)
	}
	// A stated grouping always wins.
	stated := []ResolvedPlanGroupDimension{ResolvedPlanGroupWeekday}
	got := fillImpliedGroupBy(ResolvedPlanDomainMenu, ResolvedPlanOperationRank, stated)
	if len(got) != 1 || got[0] != ResolvedPlanGroupWeekday {
		t.Fatalf("stated group_by must be preserved, got %v", got)
	}
	// Operations that do not group are untouched.
	if got := fillImpliedGroupBy(ResolvedPlanDomainMenu, ResolvedPlanOperationRetrieve, nil); len(got) != 0 {
		t.Fatalf("retrieve must not gain a grouping, got %v", got)
	}
}

// End to end on the exact plan Gemini returned in the live probe: it must now
// survive normalisation and validation.
func TestGeminiMarginRankingPlanNowValidates(t *testing.T) {
	raw := `{"schema_version":"1.1","original_question":"เมนูไหนกำไรดีที่สุด",` +
		`"resolved_question":"แสดงเมนูที่มีกำไรดีที่สุด","task":"analyze_data","domain":"menu",` +
		`"operation":"rank","action":null,"parameters":{"metrics":["margin"],"group_by":[],` +
		`"entities":[],"time_range":{"kind":"all_time","label":"ตลอดเวลา","start_date":"","end_date":"",` +
		`"timezone":"Asia/Bangkok"},"compare_time_range":null,"day_part":null,"filters":[],` +
		`"ranking":{"metric":"margin","direction":"high","rank":1,"limit":1}},` +
		`"tool_hint":"get_highest_margin_menu","resolution":{"inherited_fields":[],"missing_fields":[],` +
		`"needs_clarification":false,"clarification_question":"","confidence":1},` +
		`"policy":{"risk":"low","read_only":true,"requires_confirmation":false},"response_style":"normal"}`

	plan, err := ParseStructuredPlannerResolvedPlan(raw, "เมนูไหนกำไรดีที่สุด")
	if err != nil {
		t.Fatalf("the plan the provider actually returned must validate, got: %v", err)
	}
	if len(plan.Parameters.GroupBy) != 1 || plan.Parameters.GroupBy[0] != ResolvedPlanGroupMenu {
		t.Fatalf("expected group_by to be filled with menu, got %v", plan.Parameters.GroupBy)
	}

	decision, err := AuthorizeResolvedPlan(plan, AIActorContext{RestaurantID: 1, OwnerUserID: 1, Role: "owner"})
	if err != nil {
		t.Fatalf("authorising the plan failed: %v", err)
	}
	if decision.SelectedTool != AIToolGetHighestMarginMenu {
		t.Fatalf("expected the margin tool, got %q", decision.SelectedTool)
	}
}

// Ranking is part of the request for a recommendation: "the five ingredients
// with the fewest days left" is exactly the plan Gemini returned and the old
// rule threw away for using operation=recommend instead of rank.
func TestRankingAllowedForRecommendAndList(t *testing.T) {
	for _, operation := range []ResolvedPlanOperation{
		ResolvedPlanOperationRank, ResolvedPlanOperationRecommend, ResolvedPlanOperationList,
	} {
		if !operationSupportsRanking(operation) {
			t.Fatalf("operation %q must be allowed to carry a ranking", operation)
		}
	}
	for _, operation := range []ResolvedPlanOperation{
		ResolvedPlanOperationRetrieve, ResolvedPlanOperationExplain, ResolvedPlanOperationChat,
	} {
		if operationSupportsRanking(operation) {
			t.Fatalf("operation %q should not carry a ranking", operation)
		}
	}
}

// A ranking attached to an operation that cannot order results is dropped rather
// than failing the plan: the field is noise, not a reason to lose the routing.
func TestNormalizeDropsRankingForOperationsThatCannotOrder(t *testing.T) {
	plan := ResolvedPlan{
		Task:      AITaskRetrieveFact,
		Domain:    ResolvedPlanDomainSales,
		Operation: ResolvedPlanOperationRetrieve,
		Parameters: ResolvedPlanParameters{
			Ranking: &ResolvedPlanRanking{
				Metric: ResolvedPlanMetricRevenue, Direction: "high", Rank: 1, Limit: 1,
			},
		},
	}
	normalized := plan.Normalize()
	if normalized.Parameters.Ranking != nil {
		t.Fatal("a ranking on a retrieve operation should be dropped, not kept")
	}

	kept := plan
	kept.Operation = ResolvedPlanOperationRecommend
	if kept.Normalize().Parameters.Ranking == nil {
		t.Fatal("a ranking on a recommendation must be preserved")
	}
}

// Groq returned this exact plan for "วัตถุดิบไหนใกล้หมด": correct in every
// respect except that resolution.missing_fields copied the object shape of its
// neighbour inherited_fields. The name it carries is what the contract wants.
func TestMissingFieldsWrittenAsObjectsAreReadAsNames(t *testing.T) {
	raw := `{"schema_version":"1.1","original_question":"วัตถุดิบไหนใกล้หมด",` +
		`"resolved_question":"Which ingredients are near depletion?","task":"unclear",` +
		`"domain":"inventory","operation":"clarify","action":null,` +
		`"parameters":{"metrics":[],"group_by":[],"entities":[],"time_range":null,` +
		`"compare_time_range":null,"day_part":null,"filters":[],"ranking":null},` +
		`"tool_hint":"","resolution":{"inherited_fields":[],` +
		`"missing_fields":[{"field":"task","source":"conversation_history","source_turn_id":"1"},` +
		`{"field":"domain","source":"conversation_history","source_turn_id":"1"}],` +
		`"needs_clarification":true,"clarification_question":"ช่วยระบุช่วงเวลาด้วยครับ","confidence":0.6},` +
		`"policy":{"risk":"low","read_only":true,"requires_confirmation":false},"response_style":"normal"}`

	plan, err := ParseStructuredPlannerResolvedPlan(raw, "วัตถุดิบไหนใกล้หมด")
	if err != nil {
		t.Fatalf("object-shaped missing_fields should be read as names, got: %v", err)
	}
	if len(plan.Resolution.MissingFields) != 2 {
		t.Fatalf("expected both names to survive, got %v", plan.Resolution.MissingFields)
	}
	if plan.Resolution.MissingFields[0] != ResolvedPlanField("task") {
		t.Fatalf("expected the field name, got %q", plan.Resolution.MissingFields[0])
	}
}

// Plain names keep working, and an object with no usable name is still refused.
func TestMissingFieldsCoercionLeavesOtherShapesAlone(t *testing.T) {
	base := `{"schema_version":"1.1","original_question":"q","resolved_question":"q",` +
		`"task":"unclear","domain":"inventory","operation":"clarify","action":null,` +
		`"parameters":{"metrics":[],"group_by":[],"entities":[],"time_range":null,` +
		`"compare_time_range":null,"day_part":null,"filters":[],"ranking":null},` +
		`"tool_hint":"","resolution":{"inherited_fields":[],` +
		`"missing_fields":%s,"needs_clarification":true,` +
		`"clarification_question":"ระบุเพิ่มหน่อยครับ","confidence":0.5},` +
		`"policy":{"risk":"low","read_only":true,"requires_confirmation":false},"response_style":"normal"}`

	plain := strings.Replace(base, "%s", `["task"]`, 1)
	if _, err := ParseStructuredPlannerResolvedPlan(plain, "q"); err != nil {
		t.Fatalf("a plain list of names must still parse: %v", err)
	}

	nameless := strings.Replace(base, "%s", `[{"source":"conversation_history"}]`, 1)
	if _, err := ParseStructuredPlannerResolvedPlan(nameless, "q"); err == nil {
		t.Fatal("an object with no field name must still be rejected")
	}
}
