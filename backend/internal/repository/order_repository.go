package repository

import (
	"fmt"
	"sort"
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
		Preload("Items.SelectedOptions", func(db *gorm.DB) *gorm.DB { return db.Order("group_name asc, id asc") }).
		Preload("Payments", func(db *gorm.DB) *gorm.DB { return db.Order("paid_at asc, id asc") }).
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

func (r *OrderRepository) FindCustomerOpenOrderByTable(restaurantID, tableID uint) (*entity.Order, error) {
	var order entity.Order
	err := r.db.
		Preload("Table").
		Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("created_at asc, id asc") }).
		Preload("Items.SelectedOptions", func(db *gorm.DB) *gorm.DB { return db.Order("group_name asc, id asc") }).
		Where("restaurant_id = ? AND table_id = ? AND status NOT IN ?", restaurantID, tableID, []string{entity.OrderStatusCompleted, entity.OrderStatusCancelled}).
		Order("opened_at desc").
		First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *OrderRepository) ListOrders(restaurantID uint, status string, tableID uint, orderDate string, page, limit int) ([]entity.Order, error) {
	var orders []entity.Order
	query := r.db.Preload("Table").Preload("Items").Preload("Items.SelectedOptions").Where("restaurant_id = ?", restaurantID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if tableID != 0 {
		query = query.Where("table_id = ?", tableID)
	}
	if orderDate != "" {
		query = query.Where("order_date = ?", orderDate)
	}
	offset := (page - 1) * limit
	err := query.Order("opened_at desc, id desc").Limit(limit).Offset(offset).Find(&orders).Error
	return orders, err
}

func (r *OrderRepository) CreateItem(item *entity.OrderItem) error {
	return r.db.Create(item).Error
}

func (r *OrderRepository) CreateItemOption(option *entity.OrderItemOption) error {
	return r.db.Create(option).Error
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

func (r *OrderRepository) ListRecipeComponents(restaurantID, menuItemID uint) ([]entity.MenuItemIngredient, error) {
	var components []entity.MenuItemIngredient
	err := r.db.
		Preload("Ingredient").
		Where("restaurant_id = ? AND menu_item_id = ?", restaurantID, menuItemID).
		Order("id asc").
		Find(&components).Error
	return components, err
}

func (r *OrderRepository) FindIngredientForUpdate(restaurantID, ingredientID uint) (*entity.Ingredient, error) {
	var ingredient entity.Ingredient
	err := r.db.
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("restaurant_id = ? AND id = ?", restaurantID, ingredientID).
		First(&ingredient).Error
	if err != nil {
		return nil, err
	}
	return &ingredient, nil
}

func (r *OrderRepository) SaveIngredient(ingredient *entity.Ingredient) error {
	return r.db.Omit(clause.Associations).Save(ingredient).Error
}

func (r *OrderRepository) CreateIngredientTransaction(tx *entity.IngredientTransaction) error {
	return r.db.Create(tx).Error
}

func (r *OrderRepository) HasInventoryDeduction(orderItemID, ingredientID uint) (bool, error) {
	var count int64
	err := r.db.Model(&entity.OrderInventoryDeduction{}).
		Where("order_item_id = ? AND ingredient_id = ?", orderItemID, ingredientID).
		Count(&count).Error
	return count > 0, err
}

func (r *OrderRepository) CreateInventoryDeduction(deduction *entity.OrderInventoryDeduction) error {
	return r.db.Create(deduction).Error
}

func (r *OrderRepository) ListItems(orderID uint) ([]entity.OrderItem, error) {
	var items []entity.OrderItem
	err := r.db.Where("order_id = ?", orderID).Order("created_at asc, id asc").Find(&items).Error
	return items, err
}

func (r *OrderRepository) MaxKitchenBatch(orderID uint) (uint, error) {
	var maxBatch uint
	err := r.db.Model(&entity.OrderItem{}).
		Where("order_id = ?", orderID).
		Select("COALESCE(MAX(kitchen_batch), 0)").
		Scan(&maxBatch).Error
	return maxBatch, err
}

func (r *OrderRepository) CreateStatusLog(log *entity.OrderStatusLog) error {
	return r.db.Create(log).Error
}

func (r *OrderRepository) CreatePayment(payment *entity.OrderPayment) error {
	return r.db.Create(payment).Error
}

func (r *OrderRepository) FindRestaurant(restaurantID uint) (*entity.Restaurant, error) {
	var restaurant entity.Restaurant
	err := r.db.Where("id = ?", restaurantID).First(&restaurant).Error
	if err != nil {
		return nil, err
	}
	return &restaurant, nil
}

func (r *OrderRepository) FindMenuItem(restaurantID, menuID uint) (*entity.MenuItem, error) {
	var item entity.MenuItem
	err := r.db.
		Preload("OptionGroups", "is_active = ?", true).
		Preload("OptionGroups.Options", "is_active = ?", true).
		Where("restaurant_id = ? AND id = ?", restaurantID, menuID).
		First(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *OrderRepository) ListPublicCategories(restaurantID uint) ([]entity.Category, error) {
	var categories []entity.Category
	err := r.db.
		Where("restaurant_id = ? AND is_active = ?", restaurantID, true).
		Order("display_order asc, id asc").
		Find(&categories).Error
	return categories, err
}

func (r *OrderRepository) ListPublicMenuItems(restaurantID uint) ([]entity.MenuItem, error) {
	var items []entity.MenuItem
	activeCategoryIDs := r.db.Model(&entity.Category{}).Select("id").Where("restaurant_id = ? AND is_active = ?", restaurantID, true)
	activeLinkedMenuIDs := r.db.Table("menu_item_categories").
		Select("menu_item_categories.menu_item_id").
		Joins("JOIN categories ON categories.id = menu_item_categories.category_id").
		Where("menu_item_categories.restaurant_id = ? AND categories.is_active = ?", restaurantID, true)
	err := r.db.
		Preload("Category").
		Preload("Categories", func(db *gorm.DB) *gorm.DB { return db.Order("id asc") }).
		Preload("Categories.Category").
		Preload("OptionGroups", func(db *gorm.DB) *gorm.DB { return db.Where("is_active = ?", true).Order("display_order asc, id asc") }).
		Preload("OptionGroups.Options", func(db *gorm.DB) *gorm.DB { return db.Where("is_active = ?", true).Order("display_order asc, id asc") }).
		Where("restaurant_id = ? AND is_available = ?", restaurantID, true).
		Where("(category_id IN (?) OR id IN (?))", activeCategoryIDs, activeLinkedMenuIDs).
		Order("display_order asc, id asc").
		Find(&items).Error
	return items, err
}

func (r *OrderRepository) FindTable(restaurantID, tableID uint) (*entity.RestaurantTable, error) {
	var table entity.RestaurantTable
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, tableID).First(&table).Error
	if err != nil {
		return nil, err
	}
	return &table, nil
}

func (r *OrderRepository) FindTableByCustomerToken(token string) (*entity.RestaurantTable, error) {
	var table entity.RestaurantTable
	err := r.db.
		Preload("TableZone").
		Where("customer_token = ?", token).
		First(&table).Error
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
		Preload("Items.SelectedOptions").
		Where("restaurant_id = ? AND status IN ?", restaurantID, []string{entity.OrderStatusSentToKitchen, entity.OrderStatusCooking, entity.OrderStatusReady}).
		Order("opened_at asc, id asc").
		Find(&orders).Error
	if err != nil {
		return nil, err
	}
	tickets := make([]entity.Order, 0, len(orders))
	for _, order := range orders {
		batches := map[uint][]entity.OrderItem{}
		for _, item := range order.Items {
			batch := item.KitchenBatch
			if batch == 0 {
				batch = 1
			}
			batches[batch] = append(batches[batch], item)
		}
		for batch, items := range batches {
			hasCooking := false
			var sentAt *time.Time
			for index := range items {
				if items[index].Status == entity.OrderItemStatusCooking {
					hasCooking = true
				}
				if items[index].SentAt != nil && (sentAt == nil || items[index].SentAt.Before(*sentAt)) {
					value := *items[index].SentAt
					sentAt = &value
				}
			}
			if !hasCooking {
				continue
			}
			ticket := order
			ticket.Items = items
			ticket.KitchenBatch = batch
			ticket.KitchenSentAt = sentAt
			ticket.KitchenTicketID = fmt.Sprintf("%d:%d", order.ID, batch)
			tickets = append(tickets, ticket)
		}
	}
	sort.SliceStable(tickets, func(i, j int) bool {
		left := tickets[i].OpenedAt
		right := tickets[j].OpenedAt
		if tickets[i].KitchenSentAt != nil {
			left = *tickets[i].KitchenSentAt
		}
		if tickets[j].KitchenSentAt != nil {
			right = *tickets[j].KitchenSentAt
		}
		if !left.Equal(right) {
			return left.Before(right)
		}
		if tickets[i].ID != tickets[j].ID {
			return tickets[i].ID < tickets[j].ID
		}
		return tickets[i].KitchenBatch < tickets[j].KitchenBatch
	})
	return tickets, nil
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
