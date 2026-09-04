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

// AITableUsage is one table's traffic over a window: how many bills were served
// at it, what they were worth, and how many guests sat there. Capacity comes
// along because a six-seat room with two bills and a two-seat table with two
// bills are not the same story.
type AITableUsage struct {
	TableNumber string  `json:"table_number"`
	Zone        string  `json:"zone"`
	Capacity    int     `json:"capacity"`
	Bills       int64   `json:"bills"`
	Revenue     float64 `json:"revenue"`
	Guests      int64   `json:"guests"`
}

// AIPaymentMethodSummary is how many bills were settled by one method over a
// window, and how much money came in that way.
type AIPaymentMethodSummary struct {
	Method string  `json:"method"`
	Bills  int64   `json:"bills"`
	Amount float64 `json:"amount"`
}

// AIPaymentCoverage says which paid bills in a window have a payment row at all.
// The payment table started being written on 2026-08-30; every paid bill before
// that has no method on record, so a window reaching further back must say so
// rather than report a cash/PromptPay split over a fraction of its bills.
type AIPaymentCoverage struct {
	PaidBills     int64  `json:"paid_bills"`
	WithMethod    int64  `json:"with_method"`
	FirstRecorded string `json:"first_recorded"`
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

// AIMenuCatalogueItem is one row of the shop's own menu — what is on it, not what
// sold. Every other menu list here is ranked by sales, so a menu that has never
// been ordered appears in none of them.
type AIMenuCatalogueItem struct {
	Name        string  `json:"name"`
	Price       float64 `json:"price"`
	IsAvailable bool    `json:"is_available"`
	Category    string  `json:"category"`
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

// AICategoryMenuMargin is one sold menu with the section of the menu board it
// belongs to. The margin queries group by order_items.menu_name — the name
// copied onto the order line at the moment of sale — which carries no category
// at all, so the category has to be read back through order_items.menu_id.
type AICategoryMenuMargin struct {
	Category string  `json:"category"`
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
// SalesForHourRange aggregates paid sales inside [start, end) that were closed
// during the hours [startHour, endHour) in Bangkok time — "how did lunch go?".
// The hour is taken from completed_at so the figure stays consistent with every
// other revenue number, which is also attributed to when the bill was closed.
// OperatingCalendarRules returns the AI-owned open/closed rules for a restaurant,
// used by the sales forecast to know which days the shop is closed.
func (r *AIRepository) OperatingCalendarRules(restaurantID uint) ([]entity.AIOperatingCalendarRule, error) {
	var rules []entity.AIOperatingCalendarRule
	err := r.db.Where("restaurant_id = ?", restaurantID).Find(&rules).Error
	return rules, err
}

// AIActiveOrder is one order still on the floor: not completed, not cancelled.
//
// The customer's name and phone are deliberately absent. They are on the row and
// the owner may see them, but this reaches a model provider outside the system
// and neither is needed to answer "which bills are still unpaid" — the table and
// order number identify the bill on their own. Same rule the table sheet follows.
type AIActiveOrder struct {
	OrderNumber   string    `json:"order_number"`
	TableNumber   string    `json:"table_number"`
	OrderType     string    `json:"order_type"`
	Status        string    `json:"status"`
	PaymentStatus string    `json:"payment_status"`
	GrandTotal    float64   `json:"grand_total"`
	CustomerCount int       `json:"customer_count"`
	OpenedAt      time.Time `json:"opened_at"`
}

// ActiveOrders reads the floor as it stands right now — the tickets the kitchen
// is working on and the bills nobody has closed yet.
//
// Nothing else exposed this: every other tool here reports history. Asked "ตอนนี้
// บิลไหนยังไม่จ่าย" the assistant had no source at all, which is the shape of
// question it used to answer by guessing.
// AIPartySize is how many closed bills were opened for a party of one size.
type AIPartySize struct {
	PartySize int   `json:"party_size"`
	Bills     int64 `json:"bills"`
}

// GuestsByPartySize counts the paid bills in [start, end) by the number of
// people the staff recorded on each. The total headcount is the sum of
// size × bills, and the shape of the list says whether the shop is fed by
// couples or by tables of six — which a single average would hide.
func (r *AIRepository) GuestsByPartySize(restaurantID uint, start, end time.Time) ([]AIPartySize, error) {
	var rows []AIPartySize
	err := r.db.Table("orders").
		Select("orders.customer_count AS party_size, COUNT(*) AS bills").
		Where(
			"orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.status = ? AND orders.payment_status = ? AND orders.completed_at >= ? AND orders.completed_at < ?",
			restaurantID, entity.OrderStatusCompleted, entity.PaymentStatusPaid, start, end,
		).
		Group("orders.customer_count").
		Order("orders.customer_count asc").
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) ActiveOrders(restaurantID uint) ([]AIActiveOrder, error) {
	var rows []AIActiveOrder
	err := r.db.Table("orders").
		Select(`orders.order_number, COALESCE(restaurant_tables.table_number, '') AS table_number,
			orders.order_type, orders.status, orders.payment_status,
			orders.grand_total, orders.customer_count, orders.opened_at`).
		Joins("LEFT JOIN restaurant_tables ON restaurant_tables.id = orders.table_id").
		Where("orders.restaurant_id = ? AND orders.deleted_at IS NULL", restaurantID).
		Where("orders.status NOT IN (?)", []string{entity.OrderStatusCompleted, entity.OrderStatusCancelled}).
		Order("orders.opened_at asc").
		Scan(&rows).Error
	return rows, err
}

// FindRestaurant returns the shop's own profile row — its name, branch, type and
// opening hours. The assistant had no way to read this, so "ร้านเราชื่ออะไร"
// was a dead end that it filled by dumping a sales total.
func (r *AIRepository) FindRestaurant(restaurantID uint) (*entity.Restaurant, error) {
	var restaurant entity.Restaurant
	if err := r.db.First(&restaurant, restaurantID).Error; err != nil {
		return nil, err
	}
	return &restaurant, nil
}

// RestaurantAIActionsEnabled reports whether the owner has turned on the
// assistant's ability to make changes for this restaurant.
func (r *AIRepository) RestaurantAIActionsEnabled(restaurantID uint) (bool, error) {
	var enabled bool
	err := r.db.Model(&entity.Restaurant{}).
		Where("id = ? AND deleted_at IS NULL", restaurantID).
		Select("ai_actions_enabled").
		Scan(&enabled).Error
	return enabled, err
}

// SetRestaurantAIActionsEnabled stores the owner's on/off choice for the
// assistant's write actions.
func (r *AIRepository) SetRestaurantAIActionsEnabled(restaurantID uint, enabled bool) error {
	return r.db.Model(&entity.Restaurant{}).
		Where("id = ? AND deleted_at IS NULL", restaurantID).
		Update("ai_actions_enabled", enabled).Error
}

func (r *AIRepository) SalesForHourRange(restaurantID uint, start, end time.Time, startHour, endHour int) (AISalesRange, error) {
	var res AISalesRange
	err := r.db.Model(&entity.Order{}).
		Select(`
			COUNT(*) AS orders,
			COALESCE(SUM(grand_total), 0) AS revenue,
			COUNT(DISTINCT TO_CHAR(completed_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')) AS days`).
		Where(
			`restaurant_id = ? AND completed_at >= ? AND completed_at < ?
			 AND EXTRACT(HOUR FROM completed_at AT TIME ZONE 'Asia/Bangkok') >= ?
			 AND EXTRACT(HOUR FROM completed_at AT TIME ZONE 'Asia/Bangkok') < ?
			 AND status = ? AND payment_status = ?`,
			restaurantID,
			start,
			end,
			startHour,
			endHour,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Scan(&res).Error
	return res, err
}

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

// MenuCatalogue lists the shop's whole menu — every item, sold or not, with its
// price, whether it is currently on sale, and its category. It is not
// time-windowed and not ranked by sales, which is exactly what separates it from
// every other menu list in this file: those answer "what sells", this answers
// "what do we serve". Ordered by category then name so the fact sheet reads like
// the menu board rather than a database dump.
func (r *AIRepository) MenuCatalogue(restaurantID uint) ([]AIMenuCatalogueItem, error) {
	var rows []AIMenuCatalogueItem
	err := r.db.Table("menu_items").
		Select("menu_items.name, menu_items.price, menu_items.is_available, COALESCE(categories.name, '') AS category").
		Joins("LEFT JOIN categories ON categories.id = menu_items.category_id AND categories.deleted_at IS NULL").
		Where("menu_items.restaurant_id = ? AND menu_items.deleted_at IS NULL", restaurantID).
		Order("category asc, menu_items.name asc").
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

// OrderTypeBreakdown counts bills the same way every revenue figure does:
// completed and paid, attributed to the day the bill was closed. It used to
// count every non-cancelled bill by the day it was opened, so "สั่งกลับบ้านกี่
// ออเดอร์" (325) and "ขายได้กี่บิล" (1,052 of which 323 takeaway) disagreed about
// the same month, and a share worked out from the two was wrong. Traffic
// questions (peak hours) still count by opened_at — that is when the customer
// walked in.
func (r *AIRepository) OrderTypeBreakdown(restaurantID uint, since time.Time) ([]AIOrderTypeSummary, error) {
	var rows []AIOrderTypeSummary
	err := r.db.Model(&entity.Order{}).
		Select("order_type, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND deleted_at IS NULL AND completed_at >= ? AND status = ? AND payment_status = ?",
			restaurantID, since, entity.OrderStatusCompleted, entity.PaymentStatusPaid).
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
		Select(aiMenuMarginSelect).
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins(
			aiMenuMarginCostJoin,
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

// MenuMarginsByCategory returns every menu sold in the window with its category
// attached, so profit can be totalled per section of the menu board. Nothing else
// here reads categories at all: every ranked list is one flat list of the whole
// shop, which is why "เครื่องดื่มตัวไหนกำไรดีสุด" could only be answered by hoping a
// drink had made the top eight.
//
// It is a query of its own rather than a category column on menuMargins because
// grouping by category as well as by name splits one menu into two rows if its
// name has lived under two categories — harmless when the rows are being summed
// per category, wrong for the ranked lists that share menuMargins and must show
// one row per menu.
//
// The menu and category joins are LEFT for the same reason MenuCatalogue's is: a
// menu deleted after it sold still earned its money, and an inner join would drop
// that money out of the totals without leaving a trace.
func (r *AIRepository) MenuMarginsByCategory(restaurantID uint, since time.Time) ([]AICategoryMenuMargin, error) {
	var rows []AICategoryMenuMargin
	err := r.db.Table("order_items").
		Select(aiMenuMarginSelect+`,
			COALESCE(categories.name, '') AS category`).
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins(
			aiMenuMarginCostJoin,
			restaurantID,
		).
		Joins("LEFT JOIN menu_items ON menu_items.id = order_items.menu_id").
		Joins("LEFT JOIN categories ON categories.id = menu_items.category_id AND categories.deleted_at IS NULL").
		Where(
			"order_items.restaurant_id = ? AND order_items.status = ? AND order_items.deleted_at IS NULL AND orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.completed_at >= ? AND orders.status = ? AND orders.payment_status = ?",
			restaurantID,
			entity.OrderItemStatusServed,
			restaurantID,
			since,
			entity.OrderStatusCompleted,
			entity.PaymentStatusPaid,
		).
		Group("order_items.menu_name, categories.name").
		Order("profit desc, revenue desc").
		Limit(200).
		Scan(&rows).Error
	return rows, err
}

// PaymentMix totals the bills paid by each method inside [start, end), keyed on
// when the bill was closed so the figures line up with every other revenue
// number. Only completed, paid orders count — a payment row on a bill that was
// later voided would otherwise be reported as money taken.
func (r *AIRepository) PaymentMix(restaurantID uint, start, end time.Time) ([]AIPaymentMethodSummary, error) {
	var rows []AIPaymentMethodSummary
	err := r.db.Table("order_payments").
		Select("order_payments.method, COUNT(*) AS bills, COALESCE(SUM(order_payments.amount), 0) AS amount").
		Joins("JOIN orders ON orders.id = order_payments.order_id").
		Where("order_payments.restaurant_id = ? AND order_payments.deleted_at IS NULL AND orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.status = ? AND orders.payment_status = ? AND orders.completed_at >= ? AND orders.completed_at < ?",
			restaurantID, restaurantID, entity.OrderStatusCompleted, entity.PaymentStatusPaid, start, end).
		Group("order_payments.method").
		Order("bills desc").
		Scan(&rows).Error
	return rows, err
}

// PaymentCoverage counts the paid bills in the window and how many of them carry
// a payment row, plus the day the first payment row was ever written.
func (r *AIRepository) PaymentCoverage(restaurantID uint, start, end time.Time) (AIPaymentCoverage, error) {
	var cov AIPaymentCoverage
	err := r.db.Table("orders").
		Select("COUNT(*) AS paid_bills, COUNT(order_payments.id) AS with_method").
		Joins("LEFT JOIN order_payments ON order_payments.order_id = orders.id AND order_payments.deleted_at IS NULL").
		Where("orders.restaurant_id = ? AND orders.deleted_at IS NULL AND orders.status = ? AND orders.payment_status = ? AND orders.completed_at >= ? AND orders.completed_at < ?",
			restaurantID, entity.OrderStatusCompleted, entity.PaymentStatusPaid, start, end).
		Scan(&cov).Error
	if err != nil {
		return cov, err
	}
	var first struct{ FirstRecorded string }
	err = r.db.Table("order_payments").
		Select("TO_CHAR(MIN(paid_at) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS first_recorded").
		Where("restaurant_id = ? AND deleted_at IS NULL", restaurantID).
		Scan(&first).Error
	cov.FirstRecorded = first.FirstRecorded
	return cov, err
}

// TableUsage reports every table with the paid bills served at it inside
// [start, end), counted the way sales are: completed and paid, by the day the
// bill closed.
//
// The join is LEFT from the table so a table nobody sat at still comes back,
// with zeros. Dropping it would be the same mistake the category sheet made
// about drinks: a quiet table that never appears is indistinguishable from a
// table the shop does not have, and "which table is quiet" is exactly the
// question being asked.
//
// Takeaway and delivery bills carry no table and are simply absent here; the
// fact sheet says so, because table bills will not add up to the shop's total.
func (r *AIRepository) TableUsage(restaurantID uint, start, end time.Time) ([]AITableUsage, error) {
	var rows []AITableUsage
	err := r.db.Table("restaurant_tables").
		Select(`restaurant_tables.table_number,
			COALESCE(NULLIF(table_zones.name, ''), NULLIF(restaurant_tables.zone, ''), '') AS zone,
			restaurant_tables.capacity,
			COUNT(orders.id) AS bills,
			COALESCE(SUM(orders.grand_total), 0) AS revenue,
			COALESCE(SUM(orders.customer_count), 0) AS guests`).
		Joins("LEFT JOIN table_zones ON table_zones.id = restaurant_tables.zone_id AND table_zones.deleted_at IS NULL").
		Joins(`LEFT JOIN orders ON orders.table_id = restaurant_tables.id AND orders.deleted_at IS NULL
			AND orders.status = ? AND orders.payment_status = ?
			AND orders.completed_at >= ? AND orders.completed_at < ?`,
			entity.OrderStatusCompleted, entity.PaymentStatusPaid, start, end).
		Where("restaurant_tables.restaurant_id = ? AND restaurant_tables.deleted_at IS NULL", restaurantID).
		Group("restaurant_tables.id, table_zones.name, restaurant_tables.zone, restaurant_tables.table_number, restaurant_tables.capacity").
		Order("bills asc, revenue asc").
		Scan(&rows).Error
	return rows, err
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

// PeakSalesByWeekdayForRange and PeakSalesByHourForRange are the window-bounded
// twins of the two above. The snapshot versions only ever look back a fixed 30
// days, so "อาทิตย์ก่อนช่วงไหนคนเยอะสุด" was answered about the wrong days — the
// same defect the profit and expense tools had before they learned to read the
// period out of the sentence.
func (r *AIRepository) PeakSalesByWeekdayForRange(restaurantID uint, start, end time.Time) ([]AIPeriodSummary, error) {
	var rows []AIPeriodSummary
	err := r.db.Model(&entity.Order{}).
		Select("EXTRACT(DOW FROM opened_at)::int AS period, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND opened_at >= ? AND opened_at < ? AND status <> ?",
			restaurantID, start, end, entity.OrderStatusCancelled).
		Group("period").
		Order("orders desc").
		Scan(&rows).Error
	return rows, err
}

func (r *AIRepository) PeakSalesByHourForRange(restaurantID uint, start, end time.Time) ([]AIPeriodSummary, error) {
	var rows []AIPeriodSummary
	err := r.db.Model(&entity.Order{}).
		Select("EXTRACT(HOUR FROM opened_at)::int AS period, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND opened_at >= ? AND opened_at < ? AND status <> ?",
			restaurantID, start, end, entity.OrderStatusCancelled).
		Group("period").
		Order("orders desc").
		Scan(&rows).Error
	return rows, err
}

// OrderTypeBreakdownForRange totals paid orders by service type over a named
// window, for the same reason: the snapshot version is fixed at 30 days.
func (r *AIRepository) OrderTypeBreakdownForRange(restaurantID uint, start, end time.Time) ([]AIOrderTypeSummary, error) {
	var rows []AIOrderTypeSummary
	err := r.db.Model(&entity.Order{}).
		Select("order_type, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS revenue").
		Where("restaurant_id = ? AND deleted_at IS NULL AND completed_at >= ? AND completed_at < ? AND status = ? AND payment_status = ?",
			restaurantID, start, end, entity.OrderStatusCompleted, entity.PaymentStatusPaid).
		Group("order_type").
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

// aiMenuMarginSelect and aiMenuMarginCostJoin are the per-menu money maths
// every margin query shares: quantity and revenue off the order lines, cost
// from the stock actually deducted at the moment of sale, and profit and margin
// derived from those two. They sit in one place because three queries select
// them, and an edit made to one copy alone would leave two tools quoting
// different profit for the same menu.
const (
	aiMenuMarginSelect = `
			order_items.menu_name,
			COALESCE(SUM(order_items.quantity), 0) AS quantity,
			COALESCE(SUM(order_items.subtotal), 0) AS revenue,
			COALESCE(SUM(deductions.cost), 0) AS cost,
			COALESCE(SUM(order_items.subtotal), 0) - COALESCE(SUM(deductions.cost), 0) AS profit,
			CASE WHEN COALESCE(SUM(order_items.subtotal), 0) > 0
				THEN ((COALESCE(SUM(order_items.subtotal), 0) - COALESCE(SUM(deductions.cost), 0)) / COALESCE(SUM(order_items.subtotal), 0)) * 100
				ELSE 0
			END AS margin`

	aiMenuMarginCostJoin = "LEFT JOIN (SELECT order_item_id, SUM(cost_snapshot) AS cost FROM order_inventory_deductions WHERE restaurant_id = ? AND deleted_at IS NULL GROUP BY order_item_id) deductions ON deductions.order_item_id = order_items.id"
)

func (r *AIRepository) menuMargins(restaurantID uint, since time.Time, orderBy string, limit int) ([]AIMenuMarginSummary, error) {
	var rows []AIMenuMarginSummary
	err := r.db.Table("order_items").
		Select(aiMenuMarginSelect).
		Joins("JOIN orders ON orders.id = order_items.order_id").
		Joins(
			aiMenuMarginCostJoin,
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
