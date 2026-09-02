package service

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"unicode"
)

// Every gap a fact sheet can report must say, in Thai, what it means and what
// the true answer is. This test reads the package source for every reason code
// passed to joyboyNoData and fails for any that the meaning map does not cover —
// so a new tool cannot ship a bare English code, which is the exact input that
// produced "เงินจม 35,770 บาท" over an empty shelf.
func TestEveryNoDataReasonHasAMeaning(t *testing.T) {
	call := regexp.MustCompile(`joyboyNoData\("([a-z_]+)"\)`)
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		body, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, match := range call.FindAllStringSubmatch(string(body), -1) {
			seen[match[1]] = true
		}
	}
	if len(seen) < 10 {
		t.Fatalf("found only %d no_data reasons in the package source — the scan is broken", len(seen))
	}
	for reason := range seen {
		note, known := joyboyNoDataMeaning[reason]
		if !known {
			t.Errorf("no_data reason %q has no Thai meaning in joyboyNoDataMeaning", reason)
			continue
		}
		if !strings.ContainsFunc(note, unicode.IsLetter) || !containsThai(note) {
			t.Errorf("the meaning for %q must be written in Thai for the model to relay: %q", reason, note)
		}
	}
	// And the reverse: an entry nobody uses is dead text that will drift.
	for reason := range joyboyNoDataMeaning {
		if !seen[reason] {
			t.Errorf("joyboyNoDataMeaning has %q but no sheet uses it", reason)
		}
	}
}

// The rendered gap carries the note on its own line, so the model reads a
// sentence rather than a code.
func TestNoDataSheetCarriesItsMeaning(t *testing.T) {
	body := joyboyNoData("every_stocked_ingredient_was_used_in_period")
	if !strings.Contains(body, "status=no_data") || !strings.Contains(body, "\nnote=") {
		t.Fatalf("a no_data line must be followed by its note:\n%s", body)
	}
	if !strings.Contains(body, "0 บาท") {
		t.Errorf("the dead-stock gap must state the zero the owner asked for:\n%s", body)
	}
}

func containsThai(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Thai, r) {
			return true
		}
	}
	return false
}
