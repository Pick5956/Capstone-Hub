package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type IngredientRepository struct {
	db *gorm.DB
}

func NewIngredientRepository(db *gorm.DB) *IngredientRepository {
	return &IngredientRepository{db: db}
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

func (r *IngredientRepository) Create(ingredient *entity.Ingredient) error {
	return r.db.Create(ingredient).Error
}

func (r *IngredientRepository) Update(ingredient *entity.Ingredient) error {
	return r.db.Save(ingredient).Error
}

func (r *IngredientRepository) Delete(ingredient *entity.Ingredient) error {
	return r.db.Delete(ingredient).Error
}

func (r *IngredientRepository) CreateTransaction(tx *entity.IngredientTransaction) error {
	return r.db.Create(tx).Error
}

func (r *IngredientRepository) ListTransactions(restaurantID, ingredientID uint) ([]entity.IngredientTransaction, error) {
	var txs []entity.IngredientTransaction
	query := r.db.Preload("CreatedBy").Where("restaurant_id = ?", restaurantID)
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
