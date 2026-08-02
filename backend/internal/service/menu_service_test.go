package service

import "testing"

func TestNormalizeMenuOptionGroupsRejectsInvalidSelectionBounds(t *testing.T) {
	_, err := normalizeMenuOptionGroups(1, 1, []MenuOptionGroupRequest{
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
	_, err := normalizeMenuOptionGroups(1, 1, []MenuOptionGroupRequest{
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
			_, err := normalizeMenuOptionGroups(1, 1, test.request)
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
			_, err := normalizeMenuOptionGroups(1, 1, []MenuOptionGroupRequest{test.group})
			if err == nil || err.Error() != test.wantErr {
				t.Fatalf("normalizeMenuOptionGroups() error = %v, want %q", err, test.wantErr)
			}
		})
	}
}

func TestNormalizeRecipeUnitUsesIngredientStockUnit(t *testing.T) {
	if got, err := normalizeRecipeUnit("", "kg"); err != nil || got != "kg" {
		t.Fatalf("normalizeRecipeUnit(empty) = %q, %v; want kg, nil", got, err)
	}
	if got, err := normalizeRecipeUnit(" KG ", "kg"); err != nil || got != "kg" {
		t.Fatalf("normalizeRecipeUnit(case) = %q, %v; want kg, nil", got, err)
	}
	if _, err := normalizeRecipeUnit("g", "kg"); err == nil || err.Error() != "recipe unit must match the ingredient stock unit" {
		t.Fatalf("normalizeRecipeUnit(mismatch) error = %v", err)
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
