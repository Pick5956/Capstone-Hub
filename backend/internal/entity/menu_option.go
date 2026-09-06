package entity

import "gorm.io/gorm"

type MenuOptionGroup struct {
	gorm.Model
	RestaurantID uint `json:"restaurant_id" gorm:"not null;index"`
	MenuItemID   uint `json:"menu_item_id" gorm:"not null;index"`

	Name         string `json:"name" gorm:"not null;size:120"`
	Required     bool   `json:"required" gorm:"default:false"`
	MinSelect    int    `json:"min_select" gorm:"default:0;check:menu_option_group_min_nonnegative,min_select >= 0"`
	MaxSelect    int    `json:"max_select" gorm:"default:1;check:menu_option_group_max_valid,max_select >= min_select AND max_select <= 50"`
	DisplayOrder int    `json:"display_order" gorm:"default:0"`
	IsActive     bool   `json:"is_active" gorm:"default:true"`

	MenuItem *MenuItem    `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
	Options  []MenuOption `json:"options,omitempty" gorm:"foreignKey:OptionGroupID"`
}

type MenuOption struct {
	gorm.Model
	RestaurantID  uint `json:"restaurant_id" gorm:"not null;index"`
	MenuItemID    uint `json:"menu_item_id" gorm:"not null;index"`
	OptionGroupID uint `json:"option_group_id" gorm:"not null;index"`

	Name         string  `json:"name" gorm:"not null;size:120"`
	PriceDelta   float64 `json:"price_delta" gorm:"type:numeric(14,2);not null;default:0;check:menu_option_price_nonnegative,price_delta >= 0"`
	IsDefault    bool    `json:"is_default" gorm:"default:false"`
	DisplayOrder int     `json:"display_order" gorm:"default:0"`
	IsActive     bool    `json:"is_active" gorm:"default:true"`

	OptionGroup *MenuOptionGroup       `json:"option_group,omitempty" gorm:"foreignKey:OptionGroupID"`
	MenuItem    *MenuItem              `json:"menu_item,omitempty" gorm:"foreignKey:MenuItemID"`
	Ingredients []MenuOptionIngredient `json:"ingredients,omitempty" gorm:"foreignKey:MenuOptionID"`
}

// MenuOptionIngredient is what choosing one option does to the dish's ingredient
// use: "เพิ่มกุ้ง 2 ตัว" consumes two more shrimp than the base recipe, and
// "ไม่ใส่ผัก" consumes less. Without it an option could change the price but not
// the stock, so a kitchen that sells 50 extra-shrimp plates would still show a
// full shrimp shelf.
//
// Quantity is a POSITIVE magnitude and Direction carries the sign. A signed
// column would look tidier and would be wrong: every quantity in this schema is
// checked > 0, and normalizeRecipeQuantity — the one place a unit is converted
// into the ingredient's stock unit — rejects any converted value <= 0. A signed
// value would have to bypass that conversion, and a sign lost in a JSON round
// trip turns "use less" into "use more" silently.
//
// Unit follows the recipe rule: the owner may enter any unit in the ingredient's
// family and it is stored converted into that ingredient's own stock unit.
type MenuOptionIngredient struct {
	gorm.Model
	RestaurantID  uint `json:"restaurant_id" gorm:"not null;index;uniqueIndex:idx_menu_option_ingredient,priority:1"`
	MenuItemID    uint `json:"menu_item_id" gorm:"not null;index"`
	OptionGroupID uint `json:"option_group_id" gorm:"not null;index"`
	MenuOptionID  uint `json:"menu_option_id" gorm:"not null;index;uniqueIndex:idx_menu_option_ingredient,priority:2"`
	IngredientID  uint `json:"ingredient_id" gorm:"not null;index;uniqueIndex:idx_menu_option_ingredient,priority:3"`

	Direction string  `json:"direction" gorm:"not null;size:8;default:add;check:menu_option_ingredient_direction,direction IN ('add','remove')"`
	Quantity  float64 `json:"quantity" gorm:"type:numeric(18,4);not null;check:menu_option_ingredient_quantity_positive,quantity > 0"`
	Unit      string  `json:"unit" gorm:"not null;size:40"`

	MenuOption *MenuOption `json:"menu_option,omitempty" gorm:"foreignKey:MenuOptionID"`
	Ingredient *Ingredient `json:"ingredient,omitempty" gorm:"foreignKey:IngredientID"`
}

// MenuOptionIngredientDirection values. They are the whole reason Quantity can
// stay positive, so they are named rather than spelled inline at each use.
const (
	MenuOptionIngredientAdd    = "add"
	MenuOptionIngredientRemove = "remove"
)
