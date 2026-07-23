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

type AIAnalysisCoverage struct {
	SalesItems           int64 `json:"sales_items"`
	MarginItems          int64 `json:"margin_items"`
	CostedMarginItems    int64 `json:"costed_margin_items"`
	SoldMenus            int64 `json:"sold_menus"`
	SoldMenusWithRecipes int64 `json:"sold_menus_with_recipes"`
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
		Select("TO_CHAR(completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS order_date, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where(
			"restaurant_id = ? AND completed_at >= ? AND status = ? AND payment_status = ?",
			restaurantID,
			since,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Group("TO_CHAR(completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')").
		Order("order_date desc").
		Limit(14).
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) TopMenuItems(restaurantID uint, since time.Time) ([]AIMenuSummary, error) {
	var rows []AIMenuSummary
	err := r.db.Table("order_items").
		Select("order_items.menu_name, COALESCE(SUM(order_items.quantity), 0) AS quantity, COALESCE(SUM(order_items.subtotal), 0) AS revenue").
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Where(
			"order_items.restaurant_id = ? AND order_items.deleted_at IS NULL AND order_items.status = ? AND orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.completed_at >= ? AND orders.status = ? AND orders.payment_status = ?",
			restaurantID,
			entity.OrderItemStatusServed,
			restaurantID,
			since,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Group("order_items.menu_name").
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

func (r *AIRepository) AnalysisCoverage(restaurantID uint, since time.Time) (AIAnalysisCoverage, error) {
	var coverage AIAnalysisCoverage
	err := r.db.Table("order_items").
		Select(`
			COUNT(order_items.id) AS sales_items,
			COUNT(CASE WHEN order_items.status = ? THEN 1 END) AS margin_items,
			COUNT(CASE WHEN order_items.status = ? AND deductions.order_item_id IS NOT NULL THEN 1 END) AS costed_margin_items,
			COUNT(DISTINCT CASE WHEN order_items.status = ? THEN order_items.menu_id END) AS sold_menus,
			COUNT(DISTINCT CASE WHEN order_items.status = ? AND recipes.order_item_id IS NOT NULL THEN order_items.menu_id END) AS sold_menus_with_recipes`,
			entity.OrderItemStatusServed, entity.OrderItemStatusServed, entity.OrderItemStatusServed, entity.OrderItemStatusServed).
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins(
			"LEFT JOIN (SELECT DISTINCT order_item_id FROM order_inventory_deductions WHERE restaurant_id = ? AND deleted_at IS NULL) deductions ON deductions.order_item_id = order_items.id",
			restaurantID,
		).
		Joins(
			"LEFT JOIN (SELECT DISTINCT order_item_id FROM order_item_recipe_snapshots WHERE restaurant_id = ? AND deleted_at IS NULL) recipes ON recipes.order_item_id = order_items.id",
			restaurantID,
		).
		Where(
			"order_items.restaurant_id = ? AND order_items.status = ? AND order_items.deleted_at IS NULL AND orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.completed_at >= ? AND orders.status = ? AND orders.payment_status = ?",
			restaurantID,
			entity.OrderItemStatusServed,
			restaurantID,
			since,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Scan(&coverage).Error
	return coverage, err
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
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins(
			"LEFT JOIN (SELECT order_item_id, SUM(cost_snapshot) AS cost FROM order_inventory_deductions WHERE restaurant_id = ? AND deleted_at IS NULL GROUP BY order_item_id) deductions ON deductions.order_item_id = order_items.id",
			restaurantID,
		).
		Where(
			"order_items.restaurant_id = ? AND order_items.status = ? AND order_items.deleted_at IS NULL AND orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.completed_at >= ? AND orders.status = ? AND orders.payment_status = ?",
			restaurantID,
			entity.OrderItemStatusServed,
			restaurantID,
			since,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Group("order_items.menu_name").
		Order(orderBy).
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}
