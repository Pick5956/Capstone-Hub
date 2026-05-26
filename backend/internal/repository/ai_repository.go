package repository

import (
	"time"

	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type AIRepository struct {
	db *gorm.DB
}

func NewAIRepository(db *gorm.DB) *AIRepository {
	return &AIRepository{db: db}
}

type AISalesSummary struct {
	OrderDate string  `json:"order_date"`
	Orders    int64   `json:"orders"`
	Revenue   float64 `json:"revenue"`
}

type AIMenuSummary struct {
	MenuName string  `json:"menu_name"`
	Quantity int64   `json:"quantity"`
	Revenue  float64 `json:"revenue"`
}

type AIMenuMarginSummary struct {
	MenuName string  `json:"menu_name"`
	Quantity int64   `json:"quantity"`
	Revenue  float64 `json:"revenue"`
	Cost     float64 `json:"cost"`
	Profit   float64 `json:"profit"`
	Margin   float64 `json:"margin"`
}

func (r *AIRepository) ListIngredients(restaurantID uint) ([]entity.Ingredient, error) {
	var ingredients []entity.Ingredient
	err := r.db.
		Preload("Category").
		Where("restaurant_id = ?", restaurantID).
		Order("name asc").
		Find(&ingredients).Error
	return ingredients, err
}

func (r *AIRepository) RecentSalesSummary(restaurantID uint, since time.Time) ([]AISalesSummary, error) {
	var rows []AISalesSummary
	err := r.db.Model(&entity.Order{}).
		Select("order_date, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND opened_at >= ? AND status <> ?", restaurantID, since, entity.OrderStatusCancelled).
		Group("order_date").
		Order("order_date desc").
		Limit(14).
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) TopMenuItems(restaurantID uint, since time.Time) ([]AIMenuSummary, error) {
	var rows []AIMenuSummary
	err := r.db.Model(&entity.OrderItem{}).
		Select("menu_name, COALESCE(SUM(quantity), 0) AS quantity, COALESCE(SUM(subtotal), 0) AS revenue").
		Where("restaurant_id = ? AND created_at >= ? AND status <> ?", restaurantID, since, entity.OrderItemStatusCancelled).
		Group("menu_name").
		Order("quantity desc, revenue desc").
		Limit(10).
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) MenuMargins(restaurantID uint, since time.Time) ([]AIMenuMarginSummary, error) {
	return r.menuMargins(restaurantID, since, "profit desc, revenue desc", 8)
}

func (r *AIRepository) LowMarginMenus(restaurantID uint, since time.Time) ([]AIMenuMarginSummary, error) {
	return r.menuMargins(restaurantID, since, "margin asc, revenue desc", 8)
}

func (r *AIRepository) menuMargins(restaurantID uint, since time.Time, orderBy string, limit int) ([]AIMenuMarginSummary, error) {
	var rows []AIMenuMarginSummary
	err := r.db.Table("order_items").
		Select(`
			order_items.menu_name,
			COALESCE(SUM(order_items.quantity), 0) AS quantity,
			COALESCE(SUM(order_items.subtotal), 0) AS revenue,
			COALESCE(SUM(deductions.cost), 0) AS cost,
			COALESCE(SUM(order_items.subtotal), 0) - COALESCE(SUM(deductions.cost), 0) AS profit,
			CASE WHEN COALESCE(SUM(order_items.subtotal), 0) > 0
				THEN ((COALESCE(SUM(order_items.subtotal), 0) - COALESCE(SUM(deductions.cost), 0)) / COALESCE(SUM(order_items.subtotal), 0)) * 100
				ELSE 0
			END AS margin`).
		Joins("LEFT JOIN (SELECT order_item_id, SUM(cost_snapshot) AS cost FROM order_inventory_deductions WHERE deleted_at IS NULL GROUP BY order_item_id) deductions ON deductions.order_item_id = order_items.id").
		Where("order_items.restaurant_id = ? AND order_items.created_at >= ? AND order_items.status <> ? AND order_items.deleted_at IS NULL", restaurantID, since, entity.OrderItemStatusCancelled).
		Group("order_items.menu_name").
		Order(orderBy).
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}
