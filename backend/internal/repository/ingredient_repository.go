package repository

import (
	"strings"

	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// IngredientListQuery describes an optional filtered/paged read of the inventory.
// A zero Limit means "return everything" — the historical behaviour — so small
// inventories stay one fast request and only large ones opt into paging.
type IngredientListQuery struct {
	Search string // case-insensitive match on name
	Status string // "", "ok", "low", "out" (computed from stock vs min_stock)
	Sort   string // "", "name", "stock", "priority" (out→low→ok)
	Desc   bool
	Limit  int // 0 = no limit
	Offset int
}

type IngredientRepository struct {
	db *gorm.DB
}

func NewIngredientRepository(db *gorm.DB) *IngredientRepository {
	return &IngredientRepository{db: db}
}

func (r *IngredientRepository) Transaction(fn func(tx *IngredientRepository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(NewIngredientRepository(tx))
	})
}

// disableMenusForDepletedIngredients turns off (is_available = false) every menu
// item whose recipe uses one of the given ingredients that has now run out of
// stock (stock <= 0). It never re-enables an item, so a manual re-open after a
// restock is preserved. Returns how many menus were switched off.
func disableMenusForDepletedIngredients(db *gorm.DB, restaurantID uint, ingredientIDs []uint) (int64, error) {
	if len(ingredientIDs) == 0 {
		return 0, nil
	}
	result := db.Exec(`
UPDATE menu_items SET is_available = false, updated_at = ?
WHERE restaurant_id = ? AND is_available = true AND deleted_at IS NULL AND id IN (
	SELECT mii.menu_item_id
	FROM menu_item_ingredients mii
	JOIN ingredients ing ON ing.id = mii.ingredient_id AND ing.deleted_at IS NULL
	WHERE mii.deleted_at IS NULL AND ing.stock <= 0 AND mii.ingredient_id IN ?
)`, BangkokNow(), restaurantID, ingredientIDs)
	return result.RowsAffected, result.Error
}

// DisableMenusForDepletedIngredients switches off menus whose recipe depends on
// any of the given ingredients once that ingredient has hit zero stock.
func (r *IngredientRepository) DisableMenusForDepletedIngredients(restaurantID uint, ingredientIDs []uint) (int64, error) {
	return disableMenusForDepletedIngredients(r.db, restaurantID, ingredientIDs)
}

func (r *IngredientRepository) List(restaurantID uint) ([]entity.Ingredient, error) {
	var ingredients []entity.Ingredient
	err := r.db.Preload("Category").Where("restaurant_id = ?", restaurantID).Order("name asc").Find(&ingredients).Error
	return ingredients, err
}

// ingredientListBaseQuery holds the restaurant + search + status conditions shared
// by the count and the page query, so both see the exact same filtered set.
func ingredientListBaseQuery(db *gorm.DB, restaurantID uint, q IngredientListQuery) *gorm.DB {
	base := db.Model(&entity.Ingredient{}).Where("restaurant_id = ?", restaurantID)
	if search := strings.TrimSpace(q.Search); search != "" {
		base = base.Where("name ILIKE ?", "%"+search+"%")
	}
	switch q.Status {
	case "out":
		base = base.Where("stock = 0")
	case "low":
		base = base.Where("stock > 0 AND min_stock > 0 AND stock <= min_stock")
	case "ok":
		base = base.Where("stock > 0 AND (min_stock = 0 OR stock > min_stock)")
	}
	return base
}

// ListFiltered returns a filtered, optionally paged slice plus the total matching
// count (for page controls). Ordering, search and status are resolved in SQL so a
// large inventory never has to be shipped whole and filtered in the browser.
func (r *IngredientRepository) ListFiltered(restaurantID uint, q IngredientListQuery) ([]entity.Ingredient, int64, error) {
	var total int64
	if err := ingredientListBaseQuery(r.db, restaurantID, q).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	query := ingredientListBaseQuery(r.db, restaurantID, q).Preload("Category")
	direction := "asc"
	if q.Desc {
		direction = "desc"
	}
	switch q.Sort {
	case "stock":
		query = query.Order("stock " + direction).Order("name asc")
	case "priority":
		// Out first, then low, then ok — the list's default attention order.
		query = query.Order("CASE WHEN stock = 0 THEN 0 WHEN min_stock > 0 AND stock <= min_stock THEN 1 ELSE 2 END").Order("name asc")
	default:
		query = query.Order("name " + direction)
	}
	if q.Limit > 0 {
		query = query.Limit(q.Limit).Offset(q.Offset)
	}

	var items []entity.Ingredient
	if err := query.Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *IngredientRepository) FindByID(restaurantID, ingredientID uint) (*entity.Ingredient, error) {
	var ingredient entity.Ingredient
	err := r.db.Preload("Category").Where("restaurant_id = ? AND id = ?", restaurantID, ingredientID).First(&ingredient).Error
	if err != nil {
		return nil, err
	}
	return &ingredient, nil
}

func (r *IngredientRepository) FindByIDForUpdate(restaurantID, ingredientID uint) (*entity.Ingredient, error) {
	var ingredient entity.Ingredient
	err := r.db.
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("restaurant_id = ? AND id = ?", restaurantID, ingredientID).
		First(&ingredient).Error
	if err != nil {
		return nil, err
	}
	return &ingredient, nil
}

func (r *IngredientRepository) Create(ingredient *entity.Ingredient) error {
	return r.db.Create(ingredient).Error
}

func (r *IngredientRepository) UpdateMetadata(ingredient *entity.Ingredient) error {
	return r.db.Model(&entity.Ingredient{}).
		Where("restaurant_id = ? AND id = ?", ingredient.RestaurantID, ingredient.ID).
		Updates(map[string]any{
			"name":          ingredient.Name,
			"sku":           ingredient.SKU,
			"category_id":   ingredient.CategoryID,
			"image_url":     ingredient.ImageURL,
			"unit":          ingredient.Unit,
			"min_stock":     ingredient.MinStock,
			"cost_per_unit": ingredient.CostPerUnit,
			"yield_percent": ingredient.YieldPercent,
			"storage_type":  ingredient.StorageType,
		}).Error
}

func (r *IngredientRepository) UpdateStock(restaurantID, ingredientID uint, stock float64) error {
	return r.db.Model(&entity.Ingredient{}).
		Where("restaurant_id = ? AND id = ?", restaurantID, ingredientID).
		Update("stock", stock).Error
}

func (r *IngredientRepository) Delete(ingredient *entity.Ingredient) error {
	return r.db.Delete(ingredient).Error
}

func (r *IngredientRepository) IsReferencedByRecipe(restaurantID, ingredientID uint) (bool, error) {
	var count int64
	err := r.db.Model(&entity.MenuItemIngredient{}).
		Where("restaurant_id = ? AND ingredient_id = ?", restaurantID, ingredientID).
		Count(&count).Error
	return count > 0, err
}

func (r *IngredientRepository) CreateTransaction(tx *entity.IngredientTransaction) error {
	return r.db.Create(tx).Error
}

// CreateExpense lives here so a restock and its ledger row commit together. Put
// through the ExpenseRepository it would land in a second transaction, and a
// crash between the two would raise stock without recording what it cost.
func (r *IngredientRepository) CreateExpense(expense *entity.Expense) error {
	return r.db.Create(expense).Error
}

func (r *IngredientRepository) ListTransactions(restaurantID, ingredientID uint) ([]entity.IngredientTransaction, error) {
	var txs []entity.IngredientTransaction
	query := r.db.Where("restaurant_id = ?", restaurantID)
	if ingredientID != 0 {
		query = query.Where("ingredient_id = ?", ingredientID)
	}
	err := query.Order("created_at desc").Limit(100).Find(&txs).Error
	return txs, err
}

func (r *IngredientRepository) ListCategories(restaurantID uint, includeInactive bool) ([]entity.IngredientCategory, error) {
	var categories []entity.IngredientCategory
	query := r.db.Where("restaurant_id = ?", restaurantID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	err := query.Order("display_order asc, name asc").Find(&categories).Error
	return categories, err
}

func (r *IngredientRepository) FindCategory(restaurantID, categoryID uint) (*entity.IngredientCategory, error) {
	var category entity.IngredientCategory
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, categoryID).First(&category).Error
	if err != nil {
		return nil, err
	}
	return &category, nil
}

func (r *IngredientRepository) FindCategoryByName(restaurantID uint, name string) (*entity.IngredientCategory, error) {
	var category entity.IngredientCategory
	err := r.db.Where("restaurant_id = ? AND name = ?", restaurantID, name).First(&category).Error
	if err != nil {
		return nil, err
	}
	return &category, nil
}

func (r *IngredientRepository) CreateCategory(category *entity.IngredientCategory) error {
	return r.db.Create(category).Error
}

func (r *IngredientRepository) UpdateCategory(category *entity.IngredientCategory) error {
	return r.db.Save(category).Error
}

// CountIngredientsInCategory reports how many ingredients still point at a
// category, so deletion can be blocked while it is in use.
func (r *IngredientRepository) CountIngredientsInCategory(restaurantID, categoryID uint) (int64, error) {
	var count int64
	err := r.db.Model(&entity.Ingredient{}).
		Where("restaurant_id = ? AND category_id = ?", restaurantID, categoryID).
		Count(&count).Error
	return count, err
}

// DeleteCategory hard-deletes the row (Unscoped) so its (restaurant, name)
// unique slot is freed and the same name can be created again later.
func (r *IngredientRepository) DeleteCategory(restaurantID, categoryID uint) error {
	return r.db.Unscoped().
		Where("restaurant_id = ? AND id = ?", restaurantID, categoryID).
		Delete(&entity.IngredientCategory{}).Error
}
