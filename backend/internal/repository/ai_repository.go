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

// AISalesRange is a paid-sales aggregate for an arbitrary [start, end) window,
// used by the dated-sales flow (named month / month-to-month comparison) that
// looks beyond the fixed 14-day snapshot.
type AISalesRange struct {
	Orders  int64   `json:"orders"`
	Revenue float64 `json:"revenue"`
	Days    int64   `json:"days"`
}

type AIMenuSummary struct {
	MenuName string  `json:"menu_name"`
	Quantity int64   `json:"quantity"`
	Revenue  float64 `json:"revenue"`
}

type AIOrderTypeSummary struct {
	OrderType string  `json:"order_type"`
	Orders    int64   `json:"orders"`
	Revenue   float64 `json:"revenue"`
}

type AIPeriodSummary struct {
	Period  int     `json:"period"` // weekday 0..6 (Sun..Sat) or hour 0..23 depending on the query
	Orders  int64   `json:"orders"`
	Revenue float64 `json:"revenue"`
}

type AIMenuPrice struct {
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

// AIIngredientUsage combines each ingredient's current stock with how much of it
// was consumed (and its cost) over the analysis window. One query serves the
// reorder-forecast, dead-stock, and top-cost-ingredient tools.
type AIIngredientUsage struct {
	Name        string  `json:"name"`
	Unit        string  `json:"unit"`
	Stock       float64 `json:"stock"`
	CostPerUnit float64 `json:"cost_per_unit"`
	Used        float64 `json:"used"`
	Cost        float64 `json:"cost"`
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
		// Generous cap: one row per day, so it must not truncate the analysis
		// window (the caller decides the window via `since`).
		Limit(120).
		Scan(&rows).Error
	return rows, err
}

// SalesForRange aggregates paid, completed sales in the half-open window
// [start, end). Unlike RecentSalesSummary it is not capped to 14 rows, so it can
// answer named-month and month-to-month questions.
// AISalesCoverage describes how far the recorded sales history actually reaches.
type AISalesCoverage struct {
	FirstDate string  `json:"first_date"`
	LastDate  string  `json:"last_date"`
	Days      int64   `json:"days"`
	Orders    int64   `json:"orders"`
	Revenue   float64 `json:"revenue"`
}

// SalesCoverage reports the first and last day that has paid sales. "Today has no
// orders" is useless on its own; knowing the history stops on a given date is what
// actually answers the user.
func (r *AIRepository) SalesCoverage(restaurantID uint) (AISalesCoverage, error) {
	var res AISalesCoverage
	err := r.db.Model(&entity.Order{}).
		Select(`
			TO_CHAR(MIN(completed_at) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS first_date,
			TO_CHAR(MAX(completed_at) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS last_date,
			COUNT(DISTINCT TO_CHAR(completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')) AS days,
			COUNT(*) AS orders,
			COALESCE(SUM(grand_total), 0) AS revenue`).
		Where(
			"restaurant_id = ? AND status = ? AND payment_status = ? AND completed_at IS NOT NULL",
			restaurantID,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Scan(&res).Error
	return res, err
}

func (r *AIRepository) SalesForRange(restaurantID uint, start, end time.Time) (AISalesRange, error) {
	var res AISalesRange
	err := r.db.Model(&entity.Order{}).
		Select("COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue, COUNT(DISTINCT TO_CHAR(completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')) AS days").
		Where(
			"restaurant_id = ? AND completed_at >= ? AND completed_at < ? AND status = ? AND payment_status = ?",
			restaurantID,
			start,
			end,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Scan(&res).Error
	return res, err
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

// MostExpensiveMenus lists menus by their listed price (highest first). Menu
// price is not time-windowed, so this reflects the current menu. The limit is
// deep (not 5) so rank-N questions ("แพงอันดับที่ 8") can be answered for the
// whole menu; answer formatters still cap how many rows they display.
func (r *AIRepository) MostExpensiveMenus(restaurantID uint) ([]AIMenuPrice, error) {
	var rows []AIMenuPrice
	err := r.db.Table("menu_items").
		Select("name, price").
		Where("restaurant_id = ? AND deleted_at IS NULL", restaurantID).
		Order("price desc, name asc").
		Limit(100).
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) MenusByRevenue(restaurantID uint, since time.Time) ([]AIMenuSummary, error) {
	var rows []AIMenuSummary
	err := r.db.Model(&entity.OrderItem{}).
		Select("menu_name, COALESCE(SUM(quantity), 0) AS quantity, COALESCE(SUM(subtotal), 0) AS revenue").
		Where("restaurant_id = ? AND created_at >= ? AND status <> ?", restaurantID, since, entity.OrderItemStatusCancelled).
		Group("menu_name").
		Order("revenue desc, quantity desc").
		Limit(10).
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) OrderTypeBreakdown(restaurantID uint, since time.Time) ([]AIOrderTypeSummary, error) {
	var rows []AIOrderTypeSummary
	err := r.db.Model(&entity.Order{}).
		Select("order_type, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND opened_at >= ? AND status <> ?", restaurantID, since, entity.OrderStatusCancelled).
		Group("order_type").
		Order("revenue desc").
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) MenuMargins(restaurantID uint, since time.Time) ([]AIMenuMarginSummary, error) {
	return r.menuMargins(restaurantID, since, "profit desc, revenue desc", 8)
}

// MenuMetricsForRange returns per-menu quantity, revenue, cost, profit and margin
// for the half-open window [start, end). Unlike the snapshot lists it is scoped to
// an arbitrary calendar period, so questions like "เมนูไหนกำไรดีสุดเดือนที่ผ่านมา"
// are answered from that month rather than the rolling analysis window.
func (r *AIRepository) MenuMetricsForRange(restaurantID uint, start, end time.Time) ([]AIMenuMarginSummary, error) {
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
			"order_items.restaurant_id = ? AND order_items.status = ? AND order_items.deleted_at IS NULL AND orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.completed_at >= ? AND orders.completed_at < ? AND orders.status = ? AND orders.payment_status = ?",
			restaurantID,
			entity.OrderItemStatusServed,
			restaurantID,
			start,
			end,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Group("order_items.menu_name").
		Order("revenue desc").
		Limit(200).
		Scan(&rows).Error
	return rows, err
}

// AllMenuMargins returns up to 100 served menus with margin+quantity, used for
// menu-engineering quadrant classification.
func (r *AIRepository) AllMenuMargins(restaurantID uint, since time.Time) ([]AIMenuMarginSummary, error) {
	return r.menuMargins(restaurantID, since, "quantity desc, revenue desc", 100)
}

func (r *AIRepository) PeakSalesByWeekday(restaurantID uint, since time.Time) ([]AIPeriodSummary, error) {
	var rows []AIPeriodSummary
	err := r.db.Model(&entity.Order{}).
		Select("EXTRACT(DOW FROM opened_at)::int AS period, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND opened_at >= ? AND status <> ?", restaurantID, since, entity.OrderStatusCancelled).
		Group("period").
		Order("orders desc").
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) PeakSalesByHour(restaurantID uint, since time.Time) ([]AIPeriodSummary, error) {
	var rows []AIPeriodSummary
	err := r.db.Model(&entity.Order{}).
		Select("EXTRACT(HOUR FROM opened_at)::int AS period, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND opened_at >= ? AND status <> ?", restaurantID, since, entity.OrderStatusCancelled).
		Group("period").
		Order("orders desc").
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) IngredientUsage(restaurantID uint, since time.Time) ([]AIIngredientUsage, error) {
	var rows []AIIngredientUsage
	err := r.db.Table("ingredients").
		Select(`ingredients.name, ingredients.unit, ingredients.stock, ingredients.cost_per_unit,
			COALESCE(SUM(d.quantity), 0) AS used,
			COALESCE(SUM(d.cost_snapshot), 0) AS cost`).
		Joins("LEFT JOIN order_inventory_deductions d ON d.ingredient_id = ingredients.id AND d.created_at >= ? AND d.deleted_at IS NULL", since).
		Where("ingredients.restaurant_id = ? AND ingredients.deleted_at IS NULL", restaurantID).
		Group("ingredients.id, ingredients.name, ingredients.unit, ingredients.stock, ingredients.cost_per_unit").
		Scan(&rows).Error
	return rows, err
}

// SlowMovingMenus lists available menus with the fewest sales (including zero)
// in the analysis window, to flag candidates for review or removal.
func (r *AIRepository) SlowMovingMenus(restaurantID uint, since time.Time) ([]AIMenuSummary, error) {
	var rows []AIMenuSummary
	err := r.db.Table("menu_items").
		Select("menu_items.name AS menu_name, COALESCE(sales.qty, 0) AS quantity, COALESCE(sales.revenue, 0) AS revenue").
		Joins(`LEFT JOIN (
			SELECT menu_id, SUM(quantity) AS qty, SUM(subtotal) AS revenue
			FROM order_items
			WHERE restaurant_id = ? AND created_at >= ? AND status <> ? AND deleted_at IS NULL
			GROUP BY menu_id
		) sales ON sales.menu_id = menu_items.id`, restaurantID, since, entity.OrderItemStatusCancelled).
		Where("menu_items.restaurant_id = ? AND menu_items.deleted_at IS NULL", restaurantID).
		Order("quantity asc, menu_items.name asc").
		Limit(8).
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) LowMarginMenus(restaurantID uint, since time.Time) ([]AIMenuMarginSummary, error) {
	return r.menuMargins(restaurantID, since, "margin asc, revenue desc", 8)
}

func (r *AIRepository) HighMarginMenus(restaurantID uint, since time.Time) ([]AIMenuMarginSummary, error) {
	return r.menuMargins(restaurantID, since, "margin desc, revenue desc", 8)
}

func (r *AIRepository) LowestCostMenus(restaurantID uint, since time.Time) ([]AIMenuMarginSummary, error) {
	return r.menuMargins(restaurantID, since, "(COALESCE(SUM(deductions.cost), 0) / NULLIF(SUM(order_items.quantity), 0)) asc, quantity desc", 8)
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
