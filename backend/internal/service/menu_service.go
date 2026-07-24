package service

import (
	"errors"
	"math"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

var ErrCategoryNameExists = errors.New("category name already exists")

type MenuService struct {
	repo *repository.MenuRepository
}

func ProvideMenuService(repo *repository.MenuRepository) *MenuService {
	return &MenuService{repo: repo}
}

type CategoryRequest struct {
	Name         string `json:"name" binding:"required,max=120"`
	DisplayOrder int    `json:"display_order"`
	IsActive     *bool  `json:"is_active"`
}

type MenuItemRequest struct {
	CategoryID   uint                     `json:"category_id"`
	CategoryIDs  []uint                   `json:"category_ids" binding:"max=20"`
	Name         string                   `json:"name" binding:"required,max=160"`
	Price        float64                  `json:"price"`
	ImageURL     string                   `json:"image_url" binding:"max=2048"`
	Description  string                   `json:"description" binding:"max=2000"`
	IsAvailable  *bool                    `json:"is_available"`
	DisplayOrder int                      `json:"display_order"`
	OptionGroups []MenuOptionGroupRequest `json:"option_groups" binding:"max=20,dive"`
	Ingredients  []MenuIngredientRequest  `json:"ingredients" binding:"max=100,dive"`
}

type MenuItemAvailabilityRequest struct {
	IsAvailable bool `json:"is_available"`
}

type MenuIngredientRequest struct {
	IngredientID uint    `json:"ingredient_id"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit" binding:"max=40"`
	Note         string  `json:"note" binding:"max=500"`
}

type MenuOptionGroupRequest struct {
	Name         string              `json:"name" binding:"max=120"`
	Required     bool                `json:"required"`
	MinSelect    int                 `json:"min_select"`
	MaxSelect    int                 `json:"max_select"`
	DisplayOrder int                 `json:"display_order"`
	IsActive     *bool               `json:"is_active"`
	Options      []MenuOptionRequest `json:"options" binding:"max=50,dive"`
}

type MenuOptionRequest struct {
	Name         string  `json:"name" binding:"max=120"`
	PriceDelta   float64 `json:"price_delta"`
	IsDefault    bool    `json:"is_default"`
	DisplayOrder int     `json:"display_order"`
	IsActive     *bool   `json:"is_active"`
}

const (
	maxMenuCategories   = 20
	maxMenuIngredients  = 100
	maxMenuOptionGroups = 20
	maxOptionsPerGroup  = 50
	maxMenuMoney        = 1_000_000_000
	maxRecipeQuantity   = 1_000_000_000
)

func (s *MenuService) ListCategories(restaurantID uint, includeInactive bool) ([]entity.Category, error) {
	return s.repo.ListCategories(restaurantID, includeInactive)
}

func (s *MenuService) CreateCategory(restaurantID uint, req *CategoryRequest) (*entity.Category, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("category name is required")
	}
	if len([]rune(name)) > 120 {
		return nil, errors.New("category name is too long")
	}
	exists, err := s.repo.CategoryNameExists(restaurantID, name, 0)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrCategoryNameExists
	}
	category := &entity.Category{
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

func (s *MenuService) UpdateCategory(restaurantID, categoryID uint, req *CategoryRequest) (*entity.Category, error) {
	category, err := s.repo.FindCategory(restaurantID, categoryID)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("category name is required")
	}
	if len([]rune(name)) > 120 {
		return nil, errors.New("category name is too long")
	}
	exists, err := s.repo.CategoryNameExists(restaurantID, name, categoryID)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrCategoryNameExists
	}
	category.Name = name
	category.DisplayOrder = req.DisplayOrder
	if req.IsActive != nil {
		category.IsActive = *req.IsActive
	}
	if err := s.repo.UpdateCategory(category); err != nil {
		return nil, err
	}
	return category, nil
}

func (s *MenuService) DeleteCategory(restaurantID, categoryID uint) error {
	return s.repo.Transaction(func(tx *repository.MenuRepository) error {
		category, err := tx.FindCategoryForUpdate(restaurantID, categoryID)
		if err != nil {
			return err
		}
		inUse, err := tx.CategoryInUse(restaurantID, categoryID)
		if err != nil {
			return err
		}
		if inUse {
			return errors.New("category is still used by menu items")
		}
		return tx.DeleteCategory(category)
	})
}

func (s *MenuService) ListMenuItems(restaurantID uint, includeUnavailable bool, categoryID uint) ([]entity.MenuItem, error) {
	return s.repo.ListMenuItems(restaurantID, includeUnavailable, categoryID)
}

func (s *MenuService) CreateMenuItem(restaurantID uint, req *MenuItemRequest) (*entity.MenuItem, error) {
	categoryIDs, err := s.normalizeMenuCategories(restaurantID, req)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("menu item name is required")
	}
	if err := validateMenuItemRequest(req, name); err != nil {
		return nil, err
	}
	components, err := s.normalizeMenuIngredients(restaurantID, 0, req.Ingredients)
	if err != nil {
		return nil, err
	}
	groups, err := normalizeMenuOptionGroups(restaurantID, 0, req.OptionGroups)
	if err != nil {
		return nil, err
	}
	item := &entity.MenuItem{
		RestaurantID: restaurantID,
		CategoryID:   categoryIDs[0],
		Name:         name,
		Price:        req.Price,
		ImageURL:     strings.TrimSpace(req.ImageURL),
		Description:  strings.TrimSpace(req.Description),
		IsAvailable:  true,
		DisplayOrder: req.DisplayOrder,
	}
	if req.IsAvailable != nil {
		item.IsAvailable = *req.IsAvailable
	}
	if err := s.repo.CreateMenuAggregate(
		item,
		groups,
		components,
		categoryLinks(restaurantID, 0, categoryIDs),
	); err != nil {
		return nil, err
	}
	return s.repo.FindMenuItem(restaurantID, item.ID)
}

func (s *MenuService) UpdateMenuItem(restaurantID, itemID uint, req *MenuItemRequest) (*entity.MenuItem, error) {
	item, err := s.repo.FindMenuItem(restaurantID, itemID)
	if err != nil {
		return nil, err
	}
	categoryIDs, err := s.normalizeMenuCategories(restaurantID, req)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("menu item name is required")
	}
	if err := validateMenuItemRequest(req, name); err != nil {
		return nil, err
	}
	components, err := s.normalizeMenuIngredients(restaurantID, item.ID, req.Ingredients)
	if err != nil {
		return nil, err
	}
	item.CategoryID = categoryIDs[0]
	item.Name = name
	item.Price = req.Price
	item.ImageURL = strings.TrimSpace(req.ImageURL)
	item.Description = strings.TrimSpace(req.Description)
	item.DisplayOrder = req.DisplayOrder
	if req.IsAvailable != nil {
		item.IsAvailable = *req.IsAvailable
	}
	groups, err := normalizeMenuOptionGroups(restaurantID, item.ID, req.OptionGroups)
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateMenuAggregate(
		item,
		groups,
		components,
		categoryLinks(restaurantID, item.ID, categoryIDs),
	); err != nil {
		return nil, err
	}
	return s.repo.FindMenuItem(restaurantID, item.ID)
}

func (s *MenuService) UpdateMenuItemAvailability(restaurantID, itemID uint, req *MenuItemAvailabilityRequest) (*entity.MenuItem, error) {
	item, err := s.repo.FindMenuItem(restaurantID, itemID)
	if err != nil {
		return nil, err
	}
	item.IsAvailable = req.IsAvailable
	if err := s.repo.UpdateMenuItem(item); err != nil {
		return nil, err
	}
	return s.repo.FindMenuItem(restaurantID, item.ID)
}

func (s *MenuService) DeleteMenuItem(restaurantID, itemID uint) error {
	item, err := s.repo.FindMenuItem(restaurantID, itemID)
	if err != nil {
		return err
	}
	return s.repo.DeleteMenuItem(item)
}

func normalizeMenuOptionGroups(restaurantID, menuItemID uint, requests []MenuOptionGroupRequest) ([]entity.MenuOptionGroup, error) {
	if len(requests) > maxMenuOptionGroups {
		return nil, errors.New("too many option groups")
	}
	groups := make([]entity.MenuOptionGroup, 0, len(requests))
	groupNames := make(map[string]struct{}, len(requests))
	for _, req := range requests {
		name := strings.TrimSpace(req.Name)
		if name == "" {
			return nil, errors.New("option group name is required")
		}
		if len([]rune(name)) > 120 {
			return nil, errors.New("option group name is too long")
		}
		nameKey := strings.ToLower(name)
		if _, exists := groupNames[nameKey]; exists {
			return nil, errors.New("option group names must be unique")
		}
		groupNames[nameKey] = struct{}{}
		if len(req.Options) > maxOptionsPerGroup {
			return nil, errors.New("too many options in option group")
		}
		minSelect := req.MinSelect
		maxSelect := req.MaxSelect
		if req.Required && minSelect < 1 {
			minSelect = 1
		}
		if minSelect < 0 {
			minSelect = 0
		}
		if maxSelect < 1 {
			maxSelect = 1
		}
		if maxSelect < minSelect {
			return nil, errors.New("option max_select must be greater than or equal to min_select")
		}
		if maxSelect > maxOptionsPerGroup {
			return nil, errors.New("option max_select is too large")
		}
		group := entity.MenuOptionGroup{
			RestaurantID: restaurantID,
			MenuItemID:   menuItemID,
			Name:         name,
			Required:     req.Required,
			MinSelect:    minSelect,
			MaxSelect:    maxSelect,
			DisplayOrder: req.DisplayOrder,
			IsActive:     true,
			Options:      []entity.MenuOption{},
		}
		if req.IsActive != nil {
			group.IsActive = *req.IsActive
		}
		optionNames := make(map[string]struct{}, len(req.Options))
		activeOptions := 0
		defaultOptions := 0
		for _, optionReq := range req.Options {
			optionName := strings.TrimSpace(optionReq.Name)
			if optionName == "" {
				return nil, errors.New("option name is required")
			}
			if len([]rune(optionName)) > 120 {
				return nil, errors.New("option name is too long")
			}
			optionNameKey := strings.ToLower(optionName)
			if _, exists := optionNames[optionNameKey]; exists {
				return nil, errors.New("option names must be unique within a group")
			}
			optionNames[optionNameKey] = struct{}{}
			if !isFiniteMenuNumber(optionReq.PriceDelta) || optionReq.PriceDelta < 0 {
				return nil, errors.New("option price must be zero or greater")
			}
			if optionReq.PriceDelta > maxMenuMoney {
				return nil, errors.New("option price is too large")
			}
			option := entity.MenuOption{
				RestaurantID: restaurantID,
				MenuItemID:   menuItemID,
				Name:         optionName,
				PriceDelta:   optionReq.PriceDelta,
				IsDefault:    optionReq.IsDefault,
				DisplayOrder: optionReq.DisplayOrder,
				IsActive:     true,
			}
			if optionReq.IsActive != nil {
				option.IsActive = *optionReq.IsActive
			}
			if option.IsActive {
				activeOptions++
				if option.IsDefault {
					defaultOptions++
				}
			}
			group.Options = append(group.Options, option)
		}
		if len(group.Options) == 0 {
			return nil, errors.New("option group must have at least one option")
		}
		if group.IsActive && minSelect > activeOptions {
			return nil, errors.New("option min_select cannot exceed active options")
		}
		if group.IsActive && defaultOptions > maxSelect {
			return nil, errors.New("default options cannot exceed max_select")
		}
		groups = append(groups, group)
	}
	return groups, nil
}

func (s *MenuService) normalizeMenuCategories(restaurantID uint, req *MenuItemRequest) ([]uint, error) {
	if len(req.CategoryIDs) > maxMenuCategories {
		return nil, errors.New("too many menu categories")
	}
	ids := make([]uint, 0, len(req.CategoryIDs)+1)
	if req.CategoryID != 0 {
		ids = append(ids, req.CategoryID)
	}
	for _, id := range req.CategoryIDs {
		if id != 0 {
			ids = append(ids, id)
		}
	}
	seen := map[uint]bool{}
	unique := make([]uint, 0, len(ids))
	for _, id := range ids {
		if seen[id] {
			continue
		}
		if _, err := s.repo.FindCategory(restaurantID, id); err != nil {
			return nil, errors.New("category not found")
		}
		seen[id] = true
		unique = append(unique, id)
		if len(unique) > maxMenuCategories {
			return nil, errors.New("too many menu categories")
		}
	}
	if len(unique) == 0 {
		return nil, errors.New("category not found")
	}
	return unique, nil
}

func categoryLinks(restaurantID, menuItemID uint, categoryIDs []uint) []entity.MenuItemCategory {
	links := make([]entity.MenuItemCategory, 0, len(categoryIDs))
	for _, id := range categoryIDs {
		links = append(links, entity.MenuItemCategory{
			RestaurantID: restaurantID,
			MenuItemID:   menuItemID,
			CategoryID:   id,
		})
	}
	return links
}

func (s *MenuService) normalizeMenuIngredients(restaurantID, menuItemID uint, requests []MenuIngredientRequest) ([]entity.MenuItemIngredient, error) {
	if len(requests) > maxMenuIngredients {
		return nil, errors.New("too many recipe ingredients")
	}
	components := make([]entity.MenuItemIngredient, 0, len(requests))
	seen := map[uint]bool{}
	for _, req := range requests {
		if req.IngredientID == 0 && req.Quantity == 0 {
			continue
		}
		if req.IngredientID == 0 {
			return nil, errors.New("ingredient is required for recipe component")
		}
		if !isFiniteMenuNumber(req.Quantity) || req.Quantity <= 0 {
			return nil, errors.New("recipe quantity must be greater than zero")
		}
		if req.Quantity > maxRecipeQuantity {
			return nil, errors.New("recipe quantity is too large")
		}
		if seen[req.IngredientID] {
			return nil, errors.New("ingredient can only appear once per menu recipe")
		}
		ingredient, err := s.repo.FindIngredient(restaurantID, req.IngredientID)
		if err != nil {
			return nil, errors.New("recipe ingredient not found")
		}
		unit, err := normalizeRecipeUnit(req.Unit, ingredient.Unit)
		if err != nil {
			return nil, err
		}
		note := strings.TrimSpace(req.Note)
		if len([]rune(note)) > 500 {
			return nil, errors.New("recipe note is too long")
		}
		components = append(components, entity.MenuItemIngredient{
			RestaurantID: restaurantID,
			MenuItemID:   menuItemID,
			IngredientID: req.IngredientID,
			Quantity:     req.Quantity,
			Unit:         unit,
			Note:         note,
		})
		seen[req.IngredientID] = true
	}
	return components, nil
}

func normalizeRecipeUnit(requested, ingredientUnit string) (string, error) {
	stockUnit := strings.TrimSpace(ingredientUnit)
	unit := strings.TrimSpace(requested)
	if unit == "" {
		return stockUnit, nil
	}
	if !strings.EqualFold(unit, stockUnit) {
		return "", errors.New("recipe unit must match the ingredient stock unit")
	}
	return stockUnit, nil
}

func validateMenuItemRequest(req *MenuItemRequest, name string) error {
	if len([]rune(name)) > 160 {
		return errors.New("menu item name is too long")
	}
	if !isFiniteMenuNumber(req.Price) || req.Price < 0 {
		return errors.New("price must be zero or greater")
	}
	if req.Price > maxMenuMoney {
		return errors.New("price is too large")
	}
	if len([]rune(strings.TrimSpace(req.ImageURL))) > 2048 {
		return errors.New("image URL is too long")
	}
	if len([]rune(strings.TrimSpace(req.Description))) > 2000 {
		return errors.New("description is too long")
	}
	return nil
}

func isFiniteMenuNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
