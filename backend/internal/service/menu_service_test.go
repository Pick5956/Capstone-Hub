package service

import (
	"math"
	"testing"
)

// optionGroupNormalizer is a MenuService with no repository. Every case below
// passes options with no ingredients, and the ingredient table is only reached
// when an option actually names one - so there is nothing to stub.
func optionGroupNormalizer() *MenuService { return &MenuService{} }

func TestNormalizeMenuOptionGroupsRejectsInvalidSelectionBounds(t *testing.T) {
	_, err := optionGroupNormalizer().normalizeMenuOptionGroups(1, 1, []MenuOptionGroupRequest{
		{
			Name:      "Size",
			MinSelect: 2,
			MaxSelect: 1,
			Options: []MenuOptionRequest{
				{Name: "Regular"},
				{Name: "Large"},
			},
		},
	})
	if err == nil || err.Error() != "option max_select must be greater than or equal to min_select" {
		t.Fatalf("normalizeMenuOptionGroups() error = %v", err)
	}
}

func TestNormalizeMenuOptionGroupsRejectsNegativePrice(t *testing.T) {
	_, err := optionGroupNormalizer().normalizeMenuOptionGroups(1, 1, []MenuOptionGroupRequest{
		{
			Name: "Size",
			Options: []MenuOptionRequest{
				{Name: "Regular", PriceDelta: -0.01},
			},
		},
	})
	if err == nil || err.Error() != "option price must be zero or greater" {
		t.Fatalf("normalizeMenuOptionGroups() error = %v", err)
	}
}

func TestNormalizeMenuOptionGroupsRejectsBlankAndDuplicateNames(t *testing.T) {
	tests := []struct {
		name    string
		request []MenuOptionGroupRequest
		wantErr string
	}{
		{
			name:    "blank group",
			request: []MenuOptionGroupRequest{{Name: "  ", Options: []MenuOptionRequest{{Name: "Regular"}}}},
			wantErr: "option group name is required",
		},
		{
			name: "duplicate groups",
			request: []MenuOptionGroupRequest{
				{Name: "Size", Options: []MenuOptionRequest{{Name: "Regular"}}},
				{Name: " size ", Options: []MenuOptionRequest{{Name: "Large"}}},
			},
			wantErr: "option group names must be unique",
		},
		{
			name:    "blank option",
			request: []MenuOptionGroupRequest{{Name: "Size", Options: []MenuOptionRequest{{Name: "  "}}}},
			wantErr: "option name is required",
		},
		{
			name: "duplicate options",
			request: []MenuOptionGroupRequest{{
				Name:    "Size",
				Options: []MenuOptionRequest{{Name: "Regular"}, {Name: " regular "}},
			}},
			wantErr: "option names must be unique within a group",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := optionGroupNormalizer().normalizeMenuOptionGroups(1, 1, test.request)
			if err == nil || err.Error() != test.wantErr {
				t.Fatalf("normalizeMenuOptionGroups() error = %v, want %q", err, test.wantErr)
			}
		})
	}
}

func TestNormalizeMenuOptionGroupsRejectsImpossibleActiveSelections(t *testing.T) {
	inactive := false
	defaultActive := true
	tests := []struct {
		name    string
		group   MenuOptionGroupRequest
		wantErr string
	}{
		{
			name: "minimum exceeds active options",
			group: MenuOptionGroupRequest{
				Name:      "Size",
				MinSelect: 2,
				MaxSelect: 2,
				Options: []MenuOptionRequest{
					{Name: "Regular"},
					{Name: "Large", IsActive: &inactive},
				},
			},
			wantErr: "option min_select cannot exceed active options",
		},
		{
			name: "defaults exceed maximum",
			group: MenuOptionGroupRequest{
				Name:      "Toppings",
				MaxSelect: 1,
				Options: []MenuOptionRequest{
					{Name: "Egg", IsDefault: true, IsActive: &defaultActive},
					{Name: "Cheese", IsDefault: true, IsActive: &defaultActive},
				},
			},
			wantErr: "default options cannot exceed max_select",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := optionGroupNormalizer().normalizeMenuOptionGroups(1, 1, []MenuOptionGroupRequest{test.group})
			if err == nil || err.Error() != test.wantErr {
				t.Fatalf("normalizeMenuOptionGroups() error = %v, want %q", err, test.wantErr)
			}
		})
	}
}

func TestNormalizeRecipeQuantityRestatesInStockUnit(t *testing.T) {
	// No unit, or the shelf's own unit, is stored exactly as typed.
	if qty, unit, err := normalizeRecipeQuantity(2, "", "kg"); err != nil || qty != 2 || unit != "kg" {
		t.Fatalf("normalizeRecipeQuantity(empty) = %v %q, %v; want 2 kg, nil", qty, unit, err)
	}
	if qty, unit, err := normalizeRecipeQuantity(2, " KG ", "kg"); err != nil || qty != 2 || unit != "kg" {
		t.Fatalf("normalizeRecipeQuantity(case) = %v %q, %v; want 2 kg, nil", qty, unit, err)
	}

	// The point of the feature: 5 grams against a kilogram shelf is 0.005 kg,
	// so nobody has to type the zeros that are easy to get wrong.
	qty, unit, err := normalizeRecipeQuantity(5, "กรัม", "กิโลกรัม")
	if err != nil || unit != "กิโลกรัม" || math.Abs(qty-0.005) > 1e-9 {
		t.Fatalf("normalizeRecipeQuantity(g->kg) = %v %q, %v; want 0.005 กิโลกรัม, nil", qty, unit, err)
	}
	qty, _, err = normalizeRecipeQuantity(250, "มิลลิลิตร", "ลิตร")
	if err != nil || math.Abs(qty-0.25) > 1e-9 {
		t.Fatalf("normalizeRecipeQuantity(ml->l) = %v, %v; want 0.25, nil", qty, err)
	}

	// Counting units belong to no family, so there is nothing to convert and
	// the request is refused rather than approximated.
	if _, _, err := normalizeRecipeQuantity(3, "ฟอง", "กิโลกรัม"); err == nil {
		t.Fatal("normalizeRecipeQuantity(cross-family) error = nil, want refusal")
	}
	if _, _, err := normalizeRecipeQuantity(3, "หน่วยที่ไม่รู้จัก", "กรัม"); err == nil {
		t.Fatal("normalizeRecipeQuantity(unknown unit) error = nil, want refusal")
	}
}

func TestCategoryLinksDeduplicatedInput(t *testing.T) {
	links := categoryLinks(7, 11, []uint{2, 3})
	if len(links) != 2 {
		t.Fatalf("categoryLinks() len = %d, want 2", len(links))
	}
	if links[0].RestaurantID != 7 || links[0].MenuItemID != 11 || links[0].CategoryID != 2 {
		t.Fatalf("categoryLinks() first link = %#v", links[0])
	}
}
