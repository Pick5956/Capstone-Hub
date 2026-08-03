package entity

import "gorm.io/gorm"

type IngredientCategory struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index;uniqueIndex:idx_ingredient_category_restaurant_name,priority:1"`
	Name         string `json:"name" gorm:"not null;size:120;uniqueIndex:idx_ingredient_category_restaurant_name,priority:2"`
	DisplayOrder int    `json:"display_order" gorm:"default:0"`
	IsActive     bool   `json:"is_active" gorm:"default:true"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
}

type Ingredient struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index"`
	Name         string  `json:"name" gorm:"not null;size:160"`
	SKU          string  `json:"sku" gorm:"size:80;index"`
	CategoryID   *uint   `json:"category_id" gorm:"index"`
	ImageURL     string  `json:"image_url" gorm:"size:2048"`
	Unit         string  `json:"unit" gorm:"not null;size:40"`
	Stock        float64 `json:"stock" gorm:"type:numeric(18,4);not null;default:0;check:ingredient_stock_nonnegative,stock >= 0"`
	MinStock     float64 `json:"min_stock" gorm:"type:numeric(18,4);not null;default:0;check:ingredient_min_stock_nonnegative,min_stock >= 0"`
	CostPerUnit  float64 `json:"cost_per_unit" gorm:"type:numeric(14,4);not null;default:0;check:ingredient_cost_nonnegative,cost_per_unit >= 0"`
	YieldPercent float64 `json:"yield_percent" gorm:"type:numeric(7,4);not null;default:100;check:ingredient_yield_range,yield_percent > 0 AND yield_percent <= 100"`
	StorageType  string  `json:"storage_type" gorm:"size:40;default:room_temp"`

	Restaurant *Restaurant         `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Category   *IngredientCategory `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
}

type IngredientTransaction struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index"`
	IngredientID uint    `json:"ingredient_id" gorm:"not null;index"`
	Type         string  `json:"type" gorm:"not null;size:16;check:ingredient_transaction_type,type IN ('in','out','adjust')"` // "in", "out", "adjust"
	Quantity     float64 `json:"quantity" gorm:"type:numeric(18,4);not null;check:ingredient_transaction_quantity_positive,quantity > 0"`
	// Amount is the money actually paid for a restock. Only "in" movements carry
	// it, and a positive value makes the stock-in write a matching Expense row —
	// that is the only way cash-out reaches the ledger without manual entry.
	Amount      float64 `json:"amount" gorm:"type:numeric(14,2);not null;default:0;check:ingredient_transaction_amount_nonnegative,amount >= 0"`
	Note        string  `json:"note" gorm:"size:500"`
	CreatedByID uint    `json:"created_by_id" gorm:"not null;index"`

	Ingredient *Ingredient `json:"ingredient,omitempty" gorm:"foreignKey:IngredientID"`
	CreatedBy  *User       `json:"-" gorm:"foreignKey:CreatedByID"`
}
