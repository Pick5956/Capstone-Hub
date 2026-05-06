package entity

import "gorm.io/gorm"

type Ingredient struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index"`
	Name         string  `json:"name" gorm:"not null"`
	Unit         string  `json:"unit" gorm:"not null"`
	Stock        float64 `json:"stock" gorm:"default:0"`
	MinStock     float64 `json:"min_stock" gorm:"default:0"`
	CostPerUnit  float64 `json:"cost_per_unit" gorm:"default:0"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
}

type IngredientTransaction struct {
	gorm.Model
	RestaurantID  uint    `json:"restaurant_id" gorm:"not null;index"`
	IngredientID  uint    `json:"ingredient_id" gorm:"not null;index"`
	Type          string  `json:"type" gorm:"not null"` // "in", "out", "adjust"
	Quantity      float64 `json:"quantity" gorm:"not null"`
	Note          string  `json:"note"`
	CreatedByID   uint    `json:"created_by_id"`

	Ingredient *Ingredient `json:"ingredient,omitempty" gorm:"foreignKey:IngredientID"`
	CreatedBy  *User       `json:"created_by,omitempty" gorm:"foreignKey:CreatedByID"`
}
