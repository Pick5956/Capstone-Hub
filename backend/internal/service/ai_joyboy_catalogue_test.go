package service

import (
	"strings"
	"testing"
)

// Joyboy has no classifier, so a tool is only as findable as its description.
// A tool offered with legacy's wording is a tool the model has to guess at, and
// the guess is silent when it goes wrong.
func TestEveryOfferedToolIsDescribedForJoyboy(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		guide, described := joyboyToolGuide[AIToolName(spec.Name)]
		if !described {
			t.Errorf("%s is offered with legacy's description, not joyboy's", spec.Name)
			continue
		}
		if spec.Description != guide {
			t.Errorf("%s did not receive its joyboy description", spec.Name)
		}
		// The point of these descriptions is the questions they name.
		if !strings.Contains(guide, "ใช้ตอบ") {
			t.Errorf("%s describes what it returns but not what it answers", spec.Name)
		}
	}
}

// A guide entry for a tool nobody offers is dead text that will drift.
func TestTheGuideDescribesNothingUnreachable(t *testing.T) {
	offered := map[string]struct{}{}
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		offered[spec.Name] = struct{}{}
	}
	for name := range joyboyToolGuide {
		if _, ok := offered[string(name)]; !ok {
			t.Errorf("%s is described but never offered", name)
		}
	}
}

// Withheld tools must stay runnable: they are still reachable through legacy,
// and a fact sheet rendering is still expected for them.
func TestWithheldToolsAreNotOfferedButStillWork(t *testing.T) {
	for _, spec := range (&joyboyTools{service: &AIService{}, restaurantID: 1}).Catalogue() {
		if _, withheld := joyboyToolsNotOffered[AIToolName(spec.Name)]; withheld {
			t.Fatalf("%s is withheld yet still offered", spec.Name)
		}
	}
	for name := range joyboyToolsNotOffered {
		if !isSupportedReadOnlyTool(name) {
			t.Errorf("%s is withheld from a list it was never on", name)
		}
		if _, ok := joyboyFactBody(AIToolResult{Tool: name}); !ok {
			t.Errorf("%s lost its fact sheet rendering", name)
		}
	}
}
