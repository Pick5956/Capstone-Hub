package entity

import (
	"time"

	"gorm.io/gorm"
)

// Expense is money that actually left the restaurant: a supplier payment, a
// wage, a rent transfer. It is deliberately NOT the same number as the
// ingredient cost on order_inventory_deductions — that one is the recipe cost
// of food already sold (COGS). Buying 10kg of pork writes an Expense today;
// selling it writes deductions over the following days. Summing the two
// double-counts the same pork, so reports must keep them apart.
type Expense struct {
	gorm.Model
	RestaurantID uint      `json:"restaurant_id" gorm:"not null;index:idx_expenses_restaurant_spent_at,priority:1"`
	Category     string    `json:"category" gorm:"size:32;not null;index;check:chk_expenses_category,category IN ('ingredient','labor','rent','utilities','equipment','other')"`
	Amount       float64   `json:"amount" gorm:"type:numeric(14,2);not null;check:chk_expenses_amount_positive,amount > 0"`
	SpentAt      time.Time `json:"spent_at" gorm:"not null;index:idx_expenses_restaurant_spent_at,priority:2"`
	Note         string    `json:"note" gorm:"size:500"`
	CreatedByID  uint      `json:"created_by_id" gorm:"not null;index"`
	// Set when the row was written automatically by a stock-in rather than typed
	// by hand. Unique, so one restock can never produce two ledger entries.
	IngredientTransactionID *uint `json:"ingredient_transaction_id" gorm:"uniqueIndex"`

	CreatedBy *User `json:"created_by,omitempty" gorm:"foreignKey:CreatedByID"`
}

// ExpenseCategories is the closed set the DB check constraint enforces.
var ExpenseCategories = []string{"ingredient", "labor", "rent", "utilities", "equipment", "other"}

func IsValidExpenseCategory(category string) bool {
	for _, valid := range ExpenseCategories {
		if category == valid {
			return true
		}
	}
	return false
}
