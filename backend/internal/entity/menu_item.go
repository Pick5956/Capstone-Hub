package entity

import "gorm.io/gorm"

type MenuItem struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index;index:idx_menu_items_catalog,priority:1"`
	CategoryID   uint    `json:"category_id" gorm:"not null;index"`
	Name         string  `json:"name" gorm:"not null;size:160"`
	Price        float64 `json:"price" gorm:"type:numeric(14,2);not null;check:menu_item_price_nonnegative,price >= 0"`
	ImageURL     string  `json:"image_url" gorm:"size:2048"`
	Description  string  `json:"description" gorm:"size:2000"`
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
	RestaurantID uint `json:"restaurant_id" gorm:"not null;index;uniqueIndex:idx_menu_item_category_unique,priority:1"`
	MenuItemID   uint `json:"menu_item_id" gorm:"not null;uniqueIndex:idx_menu_item_category_unique,priority:2"`
	CategoryID   uint `json:"category_id" gorm:"not null;uniqueIndex:idx_menu_item_category_unique,priority:3"`

	MenuItem *MenuItem `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
	Category *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
}

type MenuItemIngredient struct {
	gorm.Model
	RestaurantID uint    `json:"restaurant_id" gorm:"not null;index;uniqueIndex:idx_menu_recipe_component,priority:1"`
	MenuItemID   uint    `json:"menu_item_id" gorm:"not null;index;uniqueIndex:idx_menu_recipe_component,priority:2"`
	IngredientID uint    `json:"ingredient_id" gorm:"not null;index;uniqueIndex:idx_menu_recipe_component,priority:3"`
	Quantity     float64 `json:"quantity" gorm:"type:numeric(18,4);not null;check:menu_recipe_quantity_positive,quantity > 0"`
	Unit         string  `json:"unit" gorm:"not null;size:40"`
	Note         string  `json:"note" gorm:"size:500"`

	MenuItem   *MenuItem   `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
	Ingredient *Ingredient `json:"ingredient,omitempty" gorm:"foreignKey:IngredientID"`
}
