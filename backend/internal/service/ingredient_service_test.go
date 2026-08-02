package service

import (
	"testing"

	"Project-M/internal/entity"
)

func TestValidateIngredientNumbers(t *testing.T) {
	tests := []struct {
		name    string
		req     IngredientRequest
		wantErr string
	}{
		{
			name: "accepts valid inventory values",
			req: IngredientRequest{
				Stock:                   0,
				MinStock:                1.25,
				CostPerUnit:             12.50,
				YieldPercent:            85,
			},
		},
		{
			name:    "rejects negative stock",
			req:     IngredientRequest{Stock: -0.01},
			wantErr: "stock must be zero or greater",
		},
		{
			name:    "rejects negative minimum stock",
			req:     IngredientRequest{MinStock: -0.01},
			wantErr: "minimum stock must be zero or greater",
		},
		{
			name:    "rejects negative cost",
			req:     IngredientRequest{CostPerUnit: -0.01},
			wantErr: "cost per unit must be zero or greater",
		},
		{
			name:    "rejects yield over one hundred",
			req:     IngredientRequest{YieldPercent: 100.01},
			wantErr: "yield percent must be between 0 and 100",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateIngredientNumbers(&test.req)
			if test.wantErr == "" {
				if err != nil {
					t.Fatalf("validateIngredientNumbers() error = %v, want nil", err)
				}
				return
			}
			if err == nil || err.Error() != test.wantErr {
				t.Fatalf("validateIngredientNumbers() error = %v, want %q", err, test.wantErr)
			}
		})
	}
}

func TestApplyStockAdjustment(t *testing.T) {
	tests := []struct {
		name      string
		current   float64
		kind      string
		quantity  float64
		wantStock float64
		wantErr   string
	}{
		{name: "receives stock", current: 5, kind: "in", quantity: 2.5, wantStock: 7.5},
		{name: "uses stock", current: 5, kind: "out", quantity: 2.5, wantStock: 2.5},
		{name: "sets an audited count", current: 5, kind: "adjust", quantity: 3.25, wantStock: 3.25},
		{name: "rejects insufficient stock", current: 1, kind: "out", quantity: 2, wantErr: "not enough stock"},
		{name: "rejects unknown transaction type", current: 1, kind: "erase", quantity: 1, wantErr: "type must be 'in', 'out', or 'adjust'"},
		{name: "rejects non-positive quantity", current: 1, kind: "in", quantity: 0, wantErr: "quantity must be greater than zero"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := applyStockAdjustment(test.current, test.kind, test.quantity)
			if test.wantErr == "" {
				if err != nil {
					t.Fatalf("applyStockAdjustment() error = %v, want nil", err)
				}
				if got != test.wantStock {
					t.Fatalf("applyStockAdjustment() = %v, want %v", got, test.wantStock)
				}
				return
			}
			if err == nil || err.Error() != test.wantErr {
				t.Fatalf("applyStockAdjustment() error = %v, want %q", err, test.wantErr)
			}
		})
	}
}

func TestBuildInitialStockTransaction(t *testing.T) {
	ingredient := &entity.Ingredient{
		RestaurantID: 9,
		Stock:        12.5,
	}
	ingredient.ID = 27

	tx := buildInitialStockTransaction(ingredient, 41)
	if tx == nil {
		t.Fatal("buildInitialStockTransaction() = nil, want transaction")
	}
	if tx.RestaurantID != 9 || tx.IngredientID != 27 || tx.CreatedByID != 41 {
		t.Fatalf("buildInitialStockTransaction() identity = %#v", tx)
	}
	if tx.Type != "adjust" || tx.Quantity != 12.5 || tx.Note != "initial stock" {
		t.Fatalf("buildInitialStockTransaction() values = %#v", tx)
	}

	ingredient.Stock = 0
	if got := buildInitialStockTransaction(ingredient, 41); got != nil {
		t.Fatalf("buildInitialStockTransaction() = %#v, want nil for zero stock", got)
	}
}

func TestIngredientRecipeUnitChangeBlocked(t *testing.T) {
	if !ingredientRecipeUnitChangeBlocked("kg", "g", true) {
		t.Fatal("ingredientRecipeUnitChangeBlocked() = false, want true when a referenced stock unit changes")
	}
	if ingredientRecipeUnitChangeBlocked("kg", "KG", true) {
		t.Fatal("ingredientRecipeUnitChangeBlocked() = true for case-only change")
	}
	if ingredientRecipeUnitChangeBlocked("kg", "g", false) {
		t.Fatal("ingredientRecipeUnitChangeBlocked() = true for unreferenced ingredient")
	}
}
