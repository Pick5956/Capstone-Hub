package service

import (
	"io"
	"os"
	"regexp"
	"strings"
	"testing"
)

// The examples in aiStockExtractionPrompt must not use item names the demo shop
// actually stocks or sells.
//
// This has now bitten three times. "ไข่ไก่ฟองละ 6 บาท" was an example; an owner
// typed just "ไข่ไก่" and the model returned the whole example row, proposing a
// price change to 6 baht that nobody asked for. Fixing it, the replacement
// examples used ซอสหอยนางรม and น้ำมันพืช — both real ingredients — so the same
// trap was laid again while removing it.
//
// A model shown an example whose subject matches the user's words will copy the
// example's values. Keeping the two name sets disjoint is what stops that, and
// it cannot be held by reading carefully, because it was missed by reading
// carefully twice.
func TestPromptExamplesAvoidRealShopItemNames(t *testing.T) {
	names := seededItemNames(t)
	if len(names) < 10 {
		t.Skipf("read only %d seeded names — nothing to check against", len(names))
	}
	examples := aiStockExtractionPrompt
	if index := strings.Index(examples, "ตัวอย่าง"); index >= 0 {
		examples = examples[index:]
	}
	for _, name := range names {
		if len([]rune(name)) < 3 {
			continue // "กุ้ง"-length fragments match too much to be meaningful
		}
		if strings.Contains(examples, name) {
			t.Errorf("prompt example uses %q, a real item in the demo shop — "+
				"the model copies example values when the subject matches the user's words", name)
		}
	}
}

// seededItemNames reads the demo seed commands for the shop's own item names.
// Reading the seeds rather than hardcoding a list keeps this honest: a name
// added to the demo data starts being checked without anyone remembering to.
func seededItemNames(t *testing.T) []string {
	t.Helper()
	// Only Name: fields. Matching every quoted Thai string would also pick up
	// units and descriptions ("กรัม"), and an example is free to say "500 กรัม".
	pattern := regexp.MustCompile(`Name:\s*"([\x{0E00}-\x{0E7F}][^"]{2,30})"`)
	seen := map[string]struct{}{}
	for _, path := range []string{
		"../../cmd/seed_demo_ingredients/main.go",
		"../../cmd/seed_demo_menu/main.go",
	} {
		file, err := os.Open(path)
		if err != nil {
			continue // the seed command is optional; skip rather than fail the suite
		}
		body, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			continue
		}
		for _, match := range pattern.FindAllStringSubmatch(string(body), -1) {
			name := strings.TrimSpace(match[1])
			// Seed files also hold prose (units, descriptions); item names have no
			// spaces and no digits.
			if name == "" || strings.ContainsAny(name, " 0123456789") {
				continue
			}
			seen[name] = struct{}{}
		}
	}
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	return names
}
