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
	Cost      float64 `json:"cost"`
	Profit    float64 `json:"profit"`
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
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	type dailyCost struct {
		OrderDate string
		Cost      float64
	}
	var costs []dailyCost
	err = r.db.Table("order_inventory_deductions").
		Select("TO_CHAR(orders.completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS order_date, COALESCE(SUM(order_inventory_deductions.cost_snapshot), 0) AS cost").
		Joins("JOIN order_items ON order_items.id = order_inventory_deductions.order_item_id").
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Where(
			"order_inventory_deductions.restaurant_id = ? AND order_inventory_deductions.deleted_at IS NULL AND order_items.deleted_at IS NULL AND orders.deleted_at IS NULL AND orders.completed_at >= ? AND orders.status = ? AND orders.payment_status = ? AND order_items.status = ?",
			restaurantID,
			since,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
			entity.OrderItemStatusServed,
		).
		Group("TO_CHAR(orders.completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')").
		Scan(&costs).Error
	if err != nil {
		return nil, err
	}

	costByDate := make(map[string]float64, len(costs))
	for _, c := range costs {
		costByDate[c.OrderDate] = c.Cost
	}
	for i := range rows {
		rows[i].Cost = costByDate[rows[i].OrderDate]
		rows[i].Profit = rows[i].Revenue - rows[i].Cost
	}
	return rows, nil
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
		Group("order_items.menu_id, order_items.menu_name").
		Order("profit desc, revenue desc").
		Limit(12).
		Scan(&rows).Error
	return rows, err
}

type ReportTopMenuItem struct {
	MenuID   uint   `json:"menu_id"`
	MenuName string `json:"menu_name"`
	Quantity int64  `json:"quantity"`
}

// TopMenuItemsByMonth returns quantity sold per menu item within [monthStart, monthEnd)
// where monthEnd is exclusive (i.e. the first day of the following month).
func (r *ReportRepository) TopMenuItemsByMonth(restaurantID uint, monthStart, monthEnd time.Time) ([]ReportTopMenuItem, error) {
	var rows []ReportTopMenuItem
	err := r.db.Table("order_items").
		Select("order_items.menu_id, order_items.menu_name, COALESCE(SUM(order_items.quantity), 0) AS quantity").
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Where(
			"order_items.restaurant_id = ? AND orders.restaurant_id = ? AND orders.completed_at >= ? AND orders.completed_at < ? AND orders.status = ? AND orders.payment_status = ? AND orders.deleted_at IS NULL AND order_items.status = ? AND order_items.deleted_at IS NULL",
			restaurantID,
			restaurantID,
			monthStart,
			monthEnd,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
			entity.OrderItemStatusServed,
		).
		Group("order_items.menu_id, order_items.menu_name").
		Order("quantity desc").
		Limit(100).
		Scan(&rows).Error
	return rows, err
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
