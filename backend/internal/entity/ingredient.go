package entity

import "gorm.io/gorm"

type IngredientCategory struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"not null;index"`
	Name         string `json:"name" gorm:"not null"`
	DisplayOrder int    `json:"display_order" gorm:"default:0"`
	IsActive     bool   `json:"is_active" gorm:"default:true"`

	Restaurant *Restaurant `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
}

type Ingredient struct {
	gorm.Model
	RestaurantID            uint    `json:"restaurant_id" gorm:"not null;index"`
	Name                    string  `json:"name" gorm:"not null"`
	SKU                     string  `json:"sku" gorm:"index"`
	CategoryID              *uint   `json:"category_id" gorm:"index"`
	ImageURL                string  `json:"image_url"`
	Unit                    string  `json:"unit" gorm:"not null"`
	Stock                   float64 `json:"stock" gorm:"default:0"`
	MinStock                float64 `json:"min_stock" gorm:"default:0"`
	CostPerUnit             float64 `json:"cost_per_unit" gorm:"default:0"`
	YieldPercent            float64 `json:"yield_percent" gorm:"default:100"`
	StorageType             string  `json:"storage_type" gorm:"default:room_temp"`

	Restaurant *Restaurant         `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Category   *IngredientCategory `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
}

type IngredientTransaction struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index"`
	IngredientID uint    `json:"ingredient_id" gorm:"not null;index"`
	Type         string  `json:"type" gorm:"not null"` // "in", "out", "adjust"
	Quantity     float64 `json:"quantity" gorm:"not null"`
	Note         string  `json:"note"`
	CreatedByID  uint    `json:"created_by_id"`

	Ingredient *Ingredient `json:"ingredient,omitempty" gorm:"foreignKey:IngredientID"`
	CreatedBy  *User       `json:"created_by,omitempty" gorm:"foreignKey:CreatedByID"`
}
