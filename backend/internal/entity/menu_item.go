package entity

import "gorm.io/gorm"

type MenuItem struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index;index:idx_menu_items_catalog,priority:1"`
	CategoryID   uint    `json:"category_id" gorm:"not null;index"`
	Name         string  `json:"name" gorm:"not null"`
	Price        float64 `json:"price" gorm:"not null"`
	ImageURL     string  `json:"image_url"`
	Description  string  `json:"description"`
	IsAvailable  bool    `json:"is_available" gorm:"default:true;index;index:idx_menu_items_catalog,priority:2"`
	DisplayOrder int     `json:"display_order" gorm:"default:0;index:idx_menu_items_catalog,priority:3"`

	Restaurant   *Restaurant          `json:"restaurant,omitempty" gorm:"foreignKey:RestaurantID"`
	Category     *Category            `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	Categories   []MenuItemCategory   `json:"categories,omitempty" gorm:"foreignKey:MenuItemID"`
	OptionGroups []MenuOptionGroup    `json:"option_groups,omitempty" gorm:"foreignKey:MenuItemID"`
	Ingredients  []MenuItemIngredient `json:"ingredients,omitempty" gorm:"foreignKey:MenuItemID"`
}

type MenuItemCategory struct {
	gorm.Model
	RestaurantID uint `json:"restaurant_id" gorm:"not null;index"`
	MenuItemID   uint `json:"menu_item_id" gorm:"not null;uniqueIndex:idx_menu_item_category_unique,priority:1"`
	CategoryID   uint `json:"category_id" gorm:"not null;uniqueIndex:idx_menu_item_category_unique,priority:2"`

	MenuItem *MenuItem `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
	Category *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
}

type MenuItemIngredient struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index"`
	MenuItemID   uint    `json:"menu_item_id" gorm:"not null;index"`
	IngredientID uint    `json:"ingredient_id" gorm:"not null;index"`
	Quantity     float64 `json:"quantity" gorm:"not null"`
	Unit         string  `json:"unit"`
	Note         string  `json:"note"`

	MenuItem   *MenuItem   `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
	Ingredient *Ingredient `json:"ingredient,omitempty" gorm:"foreignKey:IngredientID"`
}
