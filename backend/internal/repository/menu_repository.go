package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type MenuRepository struct {
	db *gorm.DB
}

func NewMenuRepository(db *gorm.DB) *MenuRepository {
	return &MenuRepository{db: db}
}

func (r *MenuRepository) ListCategories(restaurantID uint, includeInactive bool) ([]entity.Category, error) {
	var categories []entity.Category
	query := r.db.Where("restaurant_id = ?", restaurantID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	err := query.Order("display_order asc, id asc").Find(&categories).Error
	return categories, err
}

func (r *MenuRepository) CreateCategory(category *entity.Category) error {
	return r.db.Create(category).Error
}

func (r *MenuRepository) FindCategory(restaurantID, categoryID uint) (*entity.Category, error) {
	var category entity.Category
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, categoryID).First(&category).Error
	if err != nil {
		return nil, err
	}
	return &category, nil
}

func (r *MenuRepository) UpdateCategory(category *entity.Category) error {
	return r.db.Save(category).Error
}

func (r *MenuRepository) DeleteCategory(category *entity.Category) error {
	return r.db.Delete(category).Error
}

func (r *MenuRepository) ListMenuItems(restaurantID uint, includeUnavailable bool, categoryID uint) ([]entity.MenuItem, error) {
	var items []entity.MenuItem
	query := r.db.
		Preload("Category").
		Preload("OptionGroups", func(db *gorm.DB) *gorm.DB { return db.Order("display_order asc, id asc") }).
		Preload("OptionGroups.Options", func(db *gorm.DB) *gorm.DB { return db.Order("display_order asc, id asc") }).
		Where("restaurant_id = ?", restaurantID)
	if !includeUnavailable {
		query = query.Where("is_available = ?", true).
			Where("category_id IN (?)", r.db.Model(&entity.Category{}).Select("id").Where("restaurant_id = ? AND is_active = ?", restaurantID, true))
	}
	if categoryID != 0 {
		query = query.Where("category_id = ?", categoryID)
	}
	err := query.Order("display_order asc, id asc").Find(&items).Error
	return items, err
}

func (r *MenuRepository) CreateMenuItem(item *entity.MenuItem) error {
	return r.db.Create(item).Error
}

func (r *MenuRepository) FindMenuItem(restaurantID, menuItemID uint) (*entity.MenuItem, error) {
	var item entity.MenuItem
	err := r.db.
		Preload("Category").
		Preload("OptionGroups", func(db *gorm.DB) *gorm.DB { return db.Order("display_order asc, id asc") }).
		Preload("OptionGroups.Options", func(db *gorm.DB) *gorm.DB { return db.Order("display_order asc, id asc") }).
		Where("restaurant_id = ? AND id = ?", restaurantID, menuItemID).
		First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *MenuRepository) UpdateMenuItem(item *entity.MenuItem) error {
	return r.db.Save(item).Error
}

func (r *MenuRepository) ReplaceMenuOptions(item *entity.MenuItem, groups []entity.MenuOptionGroup) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var existing []entity.MenuOptionGroup
		if err := tx.Where("restaurant_id = ? AND menu_item_id = ?", item.RestaurantID, item.ID).Find(&existing).Error; err != nil {
			return err
		}
		for _, group := range existing {
			if err := tx.Where("restaurant_id = ? AND option_group_id = ?", item.RestaurantID, group.ID).Delete(&entity.MenuOption{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("restaurant_id = ? AND menu_item_id = ?", item.RestaurantID, item.ID).Delete(&entity.MenuOptionGroup{}).Error; err != nil {
			return err
		}
		for i := range groups {
			groups[i].RestaurantID = item.RestaurantID
			groups[i].MenuItemID = item.ID
			options := groups[i].Options
			groups[i].Options = nil
			if err := tx.Create(&groups[i]).Error; err != nil {
				return err
			}
			for j := range options {
				options[j].RestaurantID = item.RestaurantID
				options[j].MenuItemID = item.ID
				options[j].OptionGroupID = groups[i].ID
				if err := tx.Create(&options[j]).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func (r *MenuRepository) DeleteMenuItem(item *entity.MenuItem) error {
	return r.db.Delete(item).Error
}
