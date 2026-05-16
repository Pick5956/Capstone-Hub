package service

import (
	"errors"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type IngredientService struct {
	repo *repository.IngredientRepository
}

func ProvideIngredientService(repo *repository.IngredientRepository) *IngredientService {
	return &IngredientService{repo: repo}
}

type IngredientRequest struct {
	Name                    string  `json:"name" binding:"required"`
	SKU                     string  `json:"sku"`
	CategoryID              uint    `json:"category_id"`
	ImageURL                string  `json:"image_url"`
	Unit                    string  `json:"unit" binding:"required"`
	BaseUnit                string  `json:"base_unit"`
	PurchaseUnitDefault     string  `json:"purchase_unit_default"`
	ConversionFactorDefault float64 `json:"conversion_factor_default"`
	Stock                   float64 `json:"stock"`
	MinStock                float64 `json:"min_stock"`
	CostPerUnit             float64 `json:"cost_per_unit"`
	YieldPercent            float64 `json:"yield_percent"`
	StorageType             string  `json:"storage_type"`
}

type IngredientCategoryRequest struct {
	Name         string `json:"name" binding:"required"`
	DisplayOrder int    `json:"display_order"`
	IsActive     *bool  `json:"is_active"`
}

type AdjustStockRequest struct {
	Type     string  `json:"type" binding:"required"` // "in", "out", "adjust"
	Quantity float64 `json:"quantity" binding:"required"`
	Note     string  `json:"note"`
}

func (s *IngredientService) List(restaurantID uint) ([]entity.Ingredient, error) {
	return s.repo.List(restaurantID)
}

func (s *IngredientService) ListCategories(restaurantID uint, includeInactive bool) ([]entity.IngredientCategory, error) {
	return s.repo.ListCategories(restaurantID, includeInactive)
}

func (s *IngredientService) CreateCategory(restaurantID uint, req *IngredientCategoryRequest) (*entity.IngredientCategory, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("category name is required")
	}
	category := &entity.IngredientCategory{
		RestaurantID: restaurantID,
		Name:         name,
		DisplayOrder: req.DisplayOrder,
		IsActive:     true,
	}
	if req.IsActive != nil {
		category.IsActive = *req.IsActive
	}
	if err := s.repo.CreateCategory(category); err != nil {
		return nil, err
	}
	return category, nil
}

func (s *IngredientService) Create(restaurantID uint, req *IngredientRequest) (*entity.Ingredient, error) {
	name, unit, baseUnit, purchaseUnitDefault, storageType, categoryID, err := s.normalizeIngredientFields(restaurantID, req)
	if err != nil {
		return nil, err
	}
	if name == "" {
		return nil, errors.New("ingredient name is required")
	}
	if unit == "" {
		return nil, errors.New("unit is required")
	}
	if req.Stock < 0 {
		return nil, errors.New("stock must be zero or greater")
	}
	ingredient := &entity.Ingredient{
		RestaurantID:            restaurantID,
		Name:                    name,
		SKU:                     strings.TrimSpace(req.SKU),
		CategoryID:              categoryID,
		ImageURL:                strings.TrimSpace(req.ImageURL),
		Unit:                    unit,
		BaseUnit:                baseUnit,
		PurchaseUnitDefault:     purchaseUnitDefault,
		ConversionFactorDefault: sanitizeConversionFactor(req.ConversionFactorDefault),
		Stock:                   req.Stock,
		MinStock:                req.MinStock,
		CostPerUnit:             req.CostPerUnit,
		YieldPercent:            sanitizeYieldPercent(req.YieldPercent),
		StorageType:             storageType,
	}
	if err := s.repo.Create(ingredient); err != nil {
		return nil, err
	}
	return ingredient, nil
}

func (s *IngredientService) Update(restaurantID, ingredientID uint, req *IngredientRequest) (*entity.Ingredient, error) {
	ingredient, err := s.repo.FindByID(restaurantID, ingredientID)
	if err != nil {
		return nil, errors.New("ingredient not found")
	}
	name, unit, baseUnit, purchaseUnitDefault, storageType, categoryID, err := s.normalizeIngredientFields(restaurantID, req)
	if err != nil {
		return nil, err
	}
	if name == "" {
		return nil, errors.New("ingredient name is required")
	}
	if unit == "" {
		return nil, errors.New("unit is required")
	}
	ingredient.Name = name
	ingredient.SKU = strings.TrimSpace(req.SKU)
	ingredient.CategoryID = categoryID
	ingredient.ImageURL = strings.TrimSpace(req.ImageURL)
	ingredient.Unit = unit
	ingredient.BaseUnit = baseUnit
	ingredient.PurchaseUnitDefault = purchaseUnitDefault
	ingredient.ConversionFactorDefault = sanitizeConversionFactor(req.ConversionFactorDefault)
	ingredient.MinStock = req.MinStock
	ingredient.CostPerUnit = req.CostPerUnit
	ingredient.YieldPercent = sanitizeYieldPercent(req.YieldPercent)
	ingredient.StorageType = storageType
	if err := s.repo.Update(ingredient); err != nil {
		return nil, err
	}
	return ingredient, nil
}

func (s *IngredientService) Delete(restaurantID, ingredientID uint) error {
	ingredient, err := s.repo.FindByID(restaurantID, ingredientID)
	if err != nil {
		return errors.New("ingredient not found")
	}
	return s.repo.Delete(ingredient)
}

func (s *IngredientService) AdjustStock(restaurantID, ingredientID, userID uint, req *AdjustStockRequest) (*entity.Ingredient, error) {
	ingredient, err := s.repo.FindByID(restaurantID, ingredientID)
	if err != nil {
		return nil, errors.New("ingredient not found")
	}
	if req.Quantity <= 0 {
		return nil, errors.New("quantity must be greater than zero")
	}
	if req.Type != "in" && req.Type != "out" && req.Type != "adjust" {
		return nil, errors.New("type must be 'in', 'out', or 'adjust'")
	}

	switch req.Type {
	case "in":
		ingredient.Stock += req.Quantity
	case "out":
		if ingredient.Stock < req.Quantity {
			return nil, errors.New("not enough stock")
		}
		ingredient.Stock -= req.Quantity
	case "adjust":
		ingredient.Stock = req.Quantity
	}

	if err := s.repo.Update(ingredient); err != nil {
		return nil, err
	}

	tx := &entity.IngredientTransaction{
		RestaurantID: restaurantID,
		IngredientID: ingredientID,
		Type:         req.Type,
		Quantity:     req.Quantity,
		Note:         strings.TrimSpace(req.Note),
		CreatedByID:  userID,
	}
	_ = s.repo.CreateTransaction(tx)

	return ingredient, nil
}

func (s *IngredientService) ListTransactions(restaurantID, ingredientID uint) ([]entity.IngredientTransaction, error) {
	return s.repo.ListTransactions(restaurantID, ingredientID)
}

func (s *IngredientService) normalizeIngredientFields(
	restaurantID uint,
	req *IngredientRequest,
) (string, string, string, string, string, *uint, error) {
	name := strings.TrimSpace(req.Name)
	unit := strings.TrimSpace(req.Unit)
	baseUnit := strings.TrimSpace(req.BaseUnit)
	if baseUnit == "" {
		baseUnit = unit
	}
	purchaseUnitDefault := strings.TrimSpace(req.PurchaseUnitDefault)
	if purchaseUnitDefault == "" {
		purchaseUnitDefault = unit
	}
	storageType := strings.TrimSpace(req.StorageType)
	if storageType == "" {
		storageType = "room_temp"
	}

	var categoryID *uint
	if req.CategoryID != 0 {
		if _, err := s.repo.FindCategory(restaurantID, req.CategoryID); err != nil {
			return "", "", "", "", "", nil, errors.New("ingredient category not found")
		}
		categoryID = &req.CategoryID
	}

	return name, unit, baseUnit, purchaseUnitDefault, storageType, categoryID, nil
}

func sanitizeConversionFactor(value float64) float64 {
	if value <= 0 {
		return 1
	}
	return value
}

func sanitizeYieldPercent(value float64) float64 {
	if value <= 0 {
		return 100
	}
	if value > 100 {
		return 100
	}
	return value
}
