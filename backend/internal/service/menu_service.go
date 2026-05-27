package service

import (
	"errors"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type MenuService struct {
	repo *repository.MenuRepository
}

func ProvideMenuService(repo *repository.MenuRepository) *MenuService {
	return &MenuService{repo: repo}
}

type CategoryRequest struct {
	Name         string `json:"name" binding:"required"`
	DisplayOrder int    `json:"display_order"`
	IsActive     *bool  `json:"is_active"`
}

type MenuItemRequest struct {
	CategoryID   uint                     `json:"category_id"`
	CategoryIDs  []uint                   `json:"category_ids"`
	Name         string                   `json:"name" binding:"required"`
	Price        float64                  `json:"price"`
	ImageURL     string                   `json:"image_url"`
	Description  string                   `json:"description"`
	IsAvailable  *bool                    `json:"is_available"`
	DisplayOrder int                      `json:"display_order"`
	OptionGroups []MenuOptionGroupRequest `json:"option_groups"`
	Ingredients  []MenuIngredientRequest  `json:"ingredients"`
}

type MenuItemAvailabilityRequest struct {
	IsAvailable bool `json:"is_available"`
}

type MenuIngredientRequest struct {
	IngredientID uint    `json:"ingredient_id"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	Note         string  `json:"note"`
}

type MenuOptionGroupRequest struct {
	Name         string              `json:"name"`
	Required     bool                `json:"required"`
	MinSelect    int                 `json:"min_select"`
	MaxSelect    int                 `json:"max_select"`
	DisplayOrder int                 `json:"display_order"`
	IsActive     *bool               `json:"is_active"`
	Options      []MenuOptionRequest `json:"options"`
}

type MenuOptionRequest struct {
	Name         string  `json:"name"`
	PriceDelta   float64 `json:"price_delta"`
	IsDefault    bool    `json:"is_default"`
	DisplayOrder int     `json:"display_order"`
	IsActive     *bool   `json:"is_active"`
}

func (s *MenuService) ListCategories(restaurantID uint, includeInactive bool) ([]entity.Category, error) {
	return s.repo.ListCategories(restaurantID, includeInactive)
}

func (s *MenuService) CreateCategory(restaurantID uint, req *CategoryRequest) (*entity.Category, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("category name is required")
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
	category, err := s.repo.FindCategory(restaurantID, categoryID)
	if err != nil {
		return err
	}
	return s.repo.DeleteCategory(category)
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
	if req.Price < 0 {
		return nil, errors.New("price must be zero or greater")
	}
	components, err := s.normalizeMenuIngredients(restaurantID, 0, req.Ingredients)
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
	if err := s.repo.CreateMenuItem(item); err != nil {
		return nil, err
	}
	groups, err := normalizeMenuOptionGroups(restaurantID, item.ID, req.OptionGroups)
	if err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceMenuOptions(item, groups); err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceMenuIngredients(item, components); err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceMenuCategories(item, categoryLinks(restaurantID, item.ID, categoryIDs)); err != nil {
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
	if req.Price < 0 {
		return nil, errors.New("price must be zero or greater")
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
	if err := s.repo.UpdateMenuItem(item); err != nil {
		return nil, err
	}
	groups, err := normalizeMenuOptionGroups(restaurantID, item.ID, req.OptionGroups)
	if err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceMenuOptions(item, groups); err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceMenuIngredients(item, components); err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceMenuCategories(item, categoryLinks(restaurantID, item.ID, categoryIDs)); err != nil {
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
	groups := make([]entity.MenuOptionGroup, 0, len(requests))
	for _, req := range requests {
		name := strings.TrimSpace(req.Name)
		if name == "" {
			continue
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
		for _, optionReq := range req.Options {
			optionName := strings.TrimSpace(optionReq.Name)
			if optionName == "" {
				continue
			}
			if optionReq.PriceDelta < 0 {
				return nil, errors.New("option price must be zero or greater")
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
			group.Options = append(group.Options, option)
		}
		if len(group.Options) == 0 {
			return nil, errors.New("option group must have at least one option")
		}
		groups = append(groups, group)
	}
	return groups, nil
}

func (s *MenuService) normalizeMenuCategories(restaurantID uint, req *MenuItemRequest) ([]uint, error) {
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
	components := make([]entity.MenuItemIngredient, 0, len(requests))
	seen := map[uint]bool{}
	for _, req := range requests {
		if req.IngredientID == 0 && req.Quantity == 0 {
			continue
		}
		if req.IngredientID == 0 {
			return nil, errors.New("ingredient is required for recipe component")
		}
		if req.Quantity <= 0 {
			return nil, errors.New("recipe quantity must be greater than zero")
		}
		if seen[req.IngredientID] {
			return nil, errors.New("ingredient can only appear once per menu recipe")
		}
		ingredient, err := s.repo.FindIngredient(restaurantID, req.IngredientID)
		if err != nil {
			return nil, errors.New("recipe ingredient not found")
		}
		unit := strings.TrimSpace(req.Unit)
		if unit == "" {
			unit = ingredient.Unit
		}
		components = append(components, entity.MenuItemIngredient{
			RestaurantID: restaurantID,
			MenuItemID:   menuItemID,
			IngredientID: req.IngredientID,
			Quantity:     req.Quantity,
			Unit:         unit,
			Note:         strings.TrimSpace(req.Note),
		})
		seen[req.IngredientID] = true
	}
	return components, nil
}
