package repository

import (
	"time"

	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type ReportRepository struct {
	db *gorm.DB
}

func NewReportRepository(db *gorm.DB) *ReportRepository {
	return &ReportRepository{db: db}
}

type ReportSalesDay struct {
	OrderDate string  `json:"order_date"`
	Orders    int64   `json:"orders"`
	Revenue   float64 `json:"revenue"`
}

type ReportMenuMargin struct {
	MenuID   uint    `json:"menu_id"`
	MenuName string  `json:"menu_name"`
	Quantity int64   `json:"quantity"`
	Revenue  float64 `json:"revenue"`
	Cost     float64 `json:"cost"`
	Profit   float64 `json:"profit"`
	Margin   float64 `json:"margin"`
}

func (r *ReportRepository) SalesByDay(restaurantID uint, since time.Time) ([]ReportSalesDay, error) {
	var rows []ReportSalesDay
	err := r.db.Model(&entity.Order{}).
		Select("order_date, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND opened_at >= ? AND status <> ?", restaurantID, since, entity.OrderStatusCancelled).
		Group("order_date").
		Order("order_date desc").
		Scan(&rows).Error
	return rows, err
}

func (r *ReportRepository) MenuMargins(restaurantID uint, since time.Time) ([]ReportMenuMargin, error) {
	var rows []ReportMenuMargin
	err := r.db.Table("order_items").
		Select(`
			order_items.menu_id,
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
		Group("order_items.menu_id, order_items.menu_name").
		Order("profit desc, revenue desc").
		Limit(12).
		Scan(&rows).Error
	return rows, err
}

func (r *ReportRepository) TotalFoodCost(restaurantID uint, since time.Time) (float64, error) {
	var total float64
	err := r.db.Table("order_inventory_deductions").
		Select("COALESCE(SUM(order_inventory_deductions.cost_snapshot), 0)").
		Joins("JOIN order_items ON order_items.id = order_inventory_deductions.order_item_id").
		Where("order_inventory_deductions.restaurant_id = ? AND order_inventory_deductions.deleted_at IS NULL AND order_items.deleted_at IS NULL AND order_items.created_at >= ? AND order_items.status <> ?", restaurantID, since, entity.OrderItemStatusCancelled).
		Scan(&total).Error
	return total, err
}

func (r *ReportRepository) StockRisks(restaurantID uint) ([]entity.Ingredient, error) {
	var ingredients []entity.Ingredient
	err := r.db.
		Preload("Category").
		Where("restaurant_id = ? AND (stock <= 0 OR (min_stock > 0 AND stock <= min_stock))", restaurantID).
		Order("stock asc, name asc").
		Limit(12).
		Find(&ingredients).Error
	return ingredients, err
}
