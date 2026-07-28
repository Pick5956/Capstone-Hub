package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// goldenCase is one labelled question in the evaluation golden set.
// expected_task/expected_tool describe the routing we expect; expect_clarify
// marks intentionally-ambiguous questions where the correct behaviour is to
// ask the user to clarify (router confidence stays below the gate) instead of
// guessing a tool.
type goldenCase struct {
	Name          string     `json:"name"`
	Question      string     `json:"question"`
	ExpectedTask  AITask     `json:"expected_task,omitempty"`
	ExpectedTool  AIToolName `json:"expected_tool,omitempty"`
	ExpectClarify bool       `json:"expect_clarify,omitempty"`
}

func loadGoldenCases(t *testing.T) []goldenCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "ai_live_intent_cases.json"))
	if err != nil {
		t.Fatalf("read golden set: %v", err)
	}
	var cases []goldenCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("decode golden set: %v", err)
	}
	return cases
}

var validGoldenTasks = map[AITask]bool{
	AITaskAnalyzeData:       true,
	AITaskRetrieveFact:      true,
	AITaskRecommendAction:   true,
	AITaskExplainConcept:    true,
	AITaskScopeQuestion:     true,
	AITaskProductHelp:       true,
	AITaskRestaurantAdvice:  true,
	AITaskRestaurantContent: true,
	AITaskGeneralChat:       true,
	AITaskRiskyAction:       true,
	AITaskOutOfScope:        true,
	AITaskUnclear:           true,
}

// TestGoldenSetIsValid runs in normal CI (no live provider) and guarantees the
// golden set stays well-formed as it grows: valid task labels, supported tool
// names, no duplicate questions, and consistent clarify entries. It never calls
// an LLM, so it is fast and deterministic.
func TestGoldenSetIsValid(t *testing.T) {
	cases := loadGoldenCases(t)
	if len(cases) == 0 {
		t.Fatal("golden set is empty")
	}

	seen := make(map[string]bool, len(cases))
	for _, c := range cases {
		if c.Name == "" || c.Question == "" {
			t.Errorf("case has empty name or question: %+v", c)
			continue
		}
		if seen[c.Question] {
			t.Errorf("duplicate question: %q", c.Question)
		}
		seen[c.Question] = true

		if c.ExpectClarify {
			if c.ExpectedTool != "" {
				t.Errorf("%s: clarify case must not set expected_tool", c.Name)
			}
			if c.ExpectedTask != "" {
				t.Errorf("%s: clarify case must not set expected_task", c.Name)
			}
			continue
		}

		if !validGoldenTasks[c.ExpectedTask] {
			t.Errorf("%s: invalid expected_task %q", c.Name, c.ExpectedTask)
		}
		if c.ExpectedTool != "" && !isSupportedReadOnlyTool(c.ExpectedTool) {
			t.Errorf("%s: unsupported expected_tool %q", c.Name, c.ExpectedTool)
		}
	}
}
