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
	CategoryID   uint                     `json:"category_id" binding:"required"`
	Name         string                   `json:"name" binding:"required"`
	Price        float64                  `json:"price"`
	ImageURL     string                   `json:"image_url"`
	Description  string                   `json:"description"`
	IsAvailable  *bool                    `json:"is_available"`
	DisplayOrder int                      `json:"display_order"`
	OptionGroups []MenuOptionGroupRequest `json:"option_groups"`
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
	if _, err := s.repo.FindCategory(restaurantID, req.CategoryID); err != nil {
		return nil, errors.New("category not found")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("menu item name is required")
	}
	if req.Price < 0 {
		return nil, errors.New("price must be zero or greater")
	}
	item := &entity.MenuItem{
		RestaurantID: restaurantID,
		CategoryID:   req.CategoryID,
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
	return s.repo.FindMenuItem(restaurantID, item.ID)
}

func (s *MenuService) UpdateMenuItem(restaurantID, itemID uint, req *MenuItemRequest) (*entity.MenuItem, error) {
	item, err := s.repo.FindMenuItem(restaurantID, itemID)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.FindCategory(restaurantID, req.CategoryID); err != nil {
		return nil, errors.New("category not found")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("menu item name is required")
	}
	if req.Price < 0 {
		return nil, errors.New("price must be zero or greater")
	}
	item.CategoryID = req.CategoryID
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
