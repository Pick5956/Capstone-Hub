package repository

import (
	"time"

	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type OrderRepository struct {
	db *gorm.DB
}

func NewOrderRepository(db *gorm.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

func (r *OrderRepository) Transaction(fn func(tx *OrderRepository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(NewOrderRepository(tx))
	})
}

func (r *OrderRepository) LockRestaurantOrderCounter(restaurantID uint) error {
	return r.db.Exec("SELECT pg_advisory_xact_lock(?)", int64(restaurantID)).Error
}

func (r *OrderRepository) CountOrdersForDate(restaurantID uint, orderDate string) (int64, error) {
	var count int64
	err := r.db.Model(&entity.Order{}).Where("restaurant_id = ? AND order_date = ?", restaurantID, orderDate).Count(&count).Error
	return count, err
}

func (r *OrderRepository) CreateOrder(order *entity.Order) error {
	return r.db.Create(order).Error
}

func (r *OrderRepository) SaveOrder(order *entity.Order) error {
	order.Version += 1
	return r.db.Omit(clause.Associations).Save(order).Error
}

func (r *OrderRepository) FindOrder(restaurantID, orderID uint) (*entity.Order, error) {
	var order entity.Order
	err := r.db.
		Preload("Table").
		Preload("Staff").
		Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("created_at asc, id asc") }).
		Preload("StatusLogs", func(db *gorm.DB) *gorm.DB { return db.Order("changed_at asc, id asc") }).
		Where("restaurant_id = ? AND id = ?", restaurantID, orderID).
		First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *OrderRepository) FindOpenOrderByTable(restaurantID, tableID uint) (*entity.Order, error) {
	var order entity.Order
	err := r.db.
		Where("restaurant_id = ? AND table_id = ? AND status NOT IN ?", restaurantID, tableID, []string{entity.OrderStatusCompleted, entity.OrderStatusCancelled}).
		Order("opened_at desc").
		First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *OrderRepository) ListOrders(restaurantID uint, status string, tableID uint, orderDate string) ([]entity.Order, error) {
	var orders []entity.Order
	query := r.db.Preload("Table").Preload("Items").Where("restaurant_id = ?", restaurantID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if tableID != 0 {
		query = query.Where("table_id = ?", tableID)
	}
	if orderDate != "" {
		query = query.Where("order_date = ?", orderDate)
	}
	err := query.Order("opened_at desc, id desc").Find(&orders).Error
	return orders, err
}

func (r *OrderRepository) CreateItem(item *entity.OrderItem) error {
	return r.db.Create(item).Error
}

func (r *OrderRepository) SaveItem(item *entity.OrderItem) error {
	return r.db.Omit(clause.Associations).Save(item).Error
}

func (r *OrderRepository) DeleteItem(item *entity.OrderItem) error {
	return r.db.Delete(item).Error
}

func (r *OrderRepository) FindItem(restaurantID, orderID, itemID uint) (*entity.OrderItem, error) {
	var item entity.OrderItem
	err := r.db.Where("restaurant_id = ? AND order_id = ? AND id = ?", restaurantID, orderID, itemID).First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *OrderRepository) ListItems(orderID uint) ([]entity.OrderItem, error) {
	var items []entity.OrderItem
	err := r.db.Where("order_id = ?", orderID).Order("created_at asc, id asc").Find(&items).Error
	return items, err
}

func (r *OrderRepository) CreateStatusLog(log *entity.OrderStatusLog) error {
	return r.db.Create(log).Error
}

func (r *OrderRepository) FindMenuItem(restaurantID, menuID uint) (*entity.MenuItem, error) {
	var item entity.MenuItem
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, menuID).First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *OrderRepository) FindTable(restaurantID, tableID uint) (*entity.RestaurantTable, error) {
	var table entity.RestaurantTable
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, tableID).First(&table).Error
	if err != nil {
		return nil, err
	}
	return &table, nil
}

func (r *OrderRepository) SaveTable(table *entity.RestaurantTable) error {
	return r.db.Omit(clause.Associations).Save(table).Error
}

func (r *OrderRepository) KitchenQueue(restaurantID uint) ([]entity.Order, error) {
	var orders []entity.Order
	err := r.db.
		Preload("Table").
		Preload("Items", "status IN ?", []string{entity.OrderItemStatusCooking, entity.OrderItemStatusReady}).
		Where("restaurant_id = ? AND status IN ?", restaurantID, []string{entity.OrderStatusSentToKitchen, entity.OrderStatusCooking, entity.OrderStatusReady}).
		Order("opened_at asc, id asc").
		Find(&orders).Error
	return orders, err
}

func (r *OrderRepository) HasOpenOrderForTable(restaurantID, tableID uint) (bool, error) {
	var count int64
	err := r.db.Model(&entity.Order{}).
		Where("restaurant_id = ? AND table_id = ? AND status NOT IN ?", restaurantID, tableID, []string{entity.OrderStatusCompleted, entity.OrderStatusCancelled}).
		Count(&count).Error
	return count > 0, err
}

func BangkokNow() time.Time {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		return time.Now()
	}
	return time.Now().In(loc)
}
