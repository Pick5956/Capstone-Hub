package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

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

func (r *IngredientRepository) List(restaurantID uint) ([]entity.Ingredient, error) {
	var ingredients []entity.Ingredient
	err := r.db.Preload("Category").Where("restaurant_id = ?", restaurantID).Order("name asc").Find(&ingredients).Error
	return ingredients, err
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
