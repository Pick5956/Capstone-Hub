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
	Name        string  `json:"name" binding:"required"`
	Unit        string  `json:"unit" binding:"required"`
	Stock       float64 `json:"stock"`
	MinStock    float64 `json:"min_stock"`
	CostPerUnit float64 `json:"cost_per_unit"`
}

type AdjustStockRequest struct {
	Type     string  `json:"type" binding:"required"` // "in", "out", "adjust"
	Quantity float64 `json:"quantity" binding:"required"`
	Note     string  `json:"note"`
}

func (s *IngredientService) List(restaurantID uint) ([]entity.Ingredient, error) {
	return s.repo.List(restaurantID)
}

func (s *IngredientService) Create(restaurantID uint, req *IngredientRequest) (*entity.Ingredient, error) {
	name := strings.TrimSpace(req.Name)
	unit := strings.TrimSpace(req.Unit)
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
		RestaurantID: restaurantID,
		Name:         name,
		Unit:         unit,
		Stock:        req.Stock,
		MinStock:     req.MinStock,
		CostPerUnit:  req.CostPerUnit,
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
	name := strings.TrimSpace(req.Name)
	unit := strings.TrimSpace(req.Unit)
	if name == "" {
		return nil, errors.New("ingredient name is required")
	}
	if unit == "" {
		return nil, errors.New("unit is required")
	}
	ingredient.Name = name
	ingredient.Unit = unit
	ingredient.MinStock = req.MinStock
	ingredient.CostPerUnit = req.CostPerUnit
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
