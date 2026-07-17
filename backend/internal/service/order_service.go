package service

import (
	"errors"
	"fmt"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"gorm.io/gorm"
)

type OrderService struct {
	repo *repository.OrderRepository
}

func ProvideOrderService(repo *repository.OrderRepository) *OrderService {
	return &OrderService{repo: repo}
}

type OpenOrderRequest struct {
	TableID       *uint  `json:"table_id"`
	OrderType     string `json:"order_type"`
	CustomerCount int    `json:"customer_count"`
	CustomerName  string `json:"customer_name"`
	CustomerPhone string `json:"customer_phone"`
	Note          string `json:"note"`
}

type UpdateOrderRequest struct {
	CustomerCount int    `json:"customer_count"`
	Note          string `json:"note"`
}

type AddOrderItemRequest struct {
	MenuID            uint   `json:"menu_id" binding:"required"`
	Quantity          int    `json:"quantity"`
	Note              string `json:"note"`
	FulfillmentType   string `json:"fulfillment_type"`
	SelectedOptionIDs []uint `json:"selected_option_ids"`
}

type UpdateOrderItemRequest struct {
	Quantity int    `json:"quantity"`
	Note     string `json:"note"`
}

type StatusRequest struct {
	Status string `json:"status" binding:"required"`
	Reason string `json:"reason"`
	Note   string `json:"note"`
}

type CancelRequest struct {
	Reason string `json:"reason" binding:"required"`
}

type PayOrderRequest struct {
	Method         string  `json:"method" binding:"required"`
	ReceivedAmount float64 `json:"received_amount"`
	Note           string  `json:"note"`
}

type BillResponse struct {
	Order                *entity.Order         `json:"order"`
	Items                []entity.OrderItem    `json:"items"`
	Subtotal             float64               `json:"subtotal"`
	DiscountAmount       float64               `json:"discount_amount"`
	ServiceChargeEnabled bool                  `json:"service_charge_enabled"`
	ServiceChargeRate    float64               `json:"service_charge_rate"`
	ServiceChargeAmount  float64               `json:"service_charge_amount"`
	VATEnabled           bool                  `json:"vat_enabled"`
	VATRate              float64               `json:"vat_rate"`
	VATAmount            float64               `json:"vat_amount"`
	TotalAmount          float64               `json:"total_amount"`
	GrandTotal           float64               `json:"grand_total"`
	PaymentStatus        string                `json:"payment_status"`
	PromptPayName        string                `json:"promptpay_name"`
	PromptPayQRImage     string                `json:"promptpay_qr_image"`
	Payments             []entity.OrderPayment `json:"payments"`
}

type selectedMenuOption struct {
	ID            uint
	OptionGroupID uint
	GroupName     string
	OptionName    string
	PriceDelta    float64
}

func (s *OrderService) OpenOrder(restaurantID, userID uint, req *OpenOrderRequest) (*entity.Order, error) {
	var created *entity.Order
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		orderType, err := normalizeOrderType(req.OrderType)
		if err != nil {
			return err
		}
		var table *entity.RestaurantTable
		var tableID *uint
		if orderType == entity.OrderTypeDineIn {
			if req.TableID == nil || *req.TableID == 0 {
				return errors.New("table_id is required for dine-in orders")
			}
			tableID = req.TableID
			table, err = tx.FindTable(restaurantID, *req.TableID)
			if err != nil {
				return errors.New("table not found")
			}
			if _, err := tx.FindOpenOrderByTable(restaurantID, *req.TableID); err == nil {
				return errors.New("table already has an open order")
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if table.Status == entity.TableStatusInactive {
				return errors.New("table is inactive")
			}
			if table.Status == entity.TableStatusReserved {
				return errors.New("table is reserved")
			}
		}
		if err := tx.LockRestaurantOrderCounter(restaurantID); err != nil {
			return err
		}
		now := repository.BangkokNow()
		orderDate := now.Format("2006-01-02")
		count, err := tx.CountOrdersForDate(restaurantID, orderDate)
		if err != nil {
			return err
		}
		customerCount := req.CustomerCount
		if customerCount <= 0 {
			customerCount = 1
		}
		order := &entity.Order{
			RestaurantID:  restaurantID,
			TableID:       tableID,
			OrderType:     orderType,
			OrderNumber:   orderNumberFromIndex(int(count) + 1),
			OrderDate:     orderDate,
			StaffID:       userID,
			CustomerCount: customerCount,
			CustomerName:  strings.TrimSpace(req.CustomerName),
			CustomerPhone: strings.TrimSpace(req.CustomerPhone),
			Status:        entity.OrderStatusOpen,
			PaymentStatus: "unpaid",
			Note:          strings.TrimSpace(req.Note),
			OpenedAt:      now,
			Version:       1,
		}
		if err := tx.CreateOrder(order); err != nil {
			return err
		}
		logNote := "order opened"
		if orderType == entity.OrderTypeTakeaway {
			logNote = "takeaway order opened"
		}
		if err := tx.CreateStatusLog(statusLog(order.ID, "", entity.OrderStatusOpen, userID, logNote)); err != nil {
			return err
		}
		if table != nil {
			table.Status = entity.TableStatusOccupied
			table.ReservationName = ""
			table.ReservationPhone = ""
			if err := tx.SaveTable(table); err != nil {
				return err
			}
		}
		created = order
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, created.ID)
}

func (s *OrderService) ListOrders(restaurantID uint, status string, tableID uint, orderDate string, page, limit int) ([]entity.Order, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 100
	}
	if limit > 200 {
		limit = 200
	}
	return s.repo.ListOrders(restaurantID, strings.TrimSpace(status), tableID, strings.TrimSpace(orderDate), page, limit)
}

func (s *OrderService) GetOrder(restaurantID, orderID uint) (*entity.Order, error) {
	return s.repo.FindOrder(restaurantID, orderID)
}

// GetOrderByNumber looks up an order by its human-readable order_number (e.g. "A001").
func (s *OrderService) GetOrderByNumber(restaurantID uint, orderNumber string) (*entity.Order, error) {
	return s.repo.FindOrderByNumber(restaurantID, orderNumber)
}

func (s *OrderService) UpdateOrder(restaurantID, userID, orderID uint, req *UpdateOrderRequest) (*entity.Order, error) {
	var updated *entity.Order
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if isTerminalOrder(order.Status) {
			return errors.New("cannot update a closed order")
		}
		if req.CustomerCount > 0 {
			order.CustomerCount = req.CustomerCount
		}
		order.Note = strings.TrimSpace(req.Note)
		if err := tx.SaveOrder(order); err != nil {
			return err
		}
		updated = order
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, updated.ID)
}

func (s *OrderService) AddItem(restaurantID, orderID uint, req *AddOrderItemRequest) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if isTerminalOrder(order.Status) {
			return errors.New("cannot add item to a closed order")
		}
		menu, err := tx.FindMenuItem(restaurantID, req.MenuID)
		if err != nil {
			return errors.New("menu item not found")
		}
		if !menu.IsAvailable {
			return errors.New("menu item is unavailable")
		}
		fulfillmentType, err := normalizeOrderItemFulfillment(req.FulfillmentType, order.OrderType)
		if err != nil {
			return err
		}
		qty := req.Quantity
		if qty <= 0 {
			qty = 1
		}
		selectedOptions, optionsTotal, err := validateSelectedMenuOptions(menu, req.SelectedOptionIDs)
		if err != nil {
			return err
		}
		item := &entity.OrderItem{
			OrderID:         order.ID,
			RestaurantID:    restaurantID,
			MenuID:          menu.ID,
			MenuName:        menu.Name,
			UnitPrice:       menu.Price,
			OptionsTotal:    optionsTotal,
			Quantity:        qty,
			Subtotal:        (menu.Price + optionsTotal) * float64(qty),
			FulfillmentType: fulfillmentType,
			Note:            strings.TrimSpace(req.Note),
			Status:          entity.OrderItemStatusPending,
		}
		if err := tx.CreateItem(item); err != nil {
			return err
		}
		for _, option := range selectedOptions {
			snapshot := &entity.OrderItemOption{
				OrderItemID:   item.ID,
				OrderID:       order.ID,
				RestaurantID:  restaurantID,
				MenuOptionID:  option.ID,
				OptionGroupID: option.OptionGroupID,
				GroupName:     option.GroupName,
				OptionName:    option.OptionName,
				PriceDelta:    option.PriceDelta,
			}
			if err := tx.CreateItemOption(snapshot); err != nil {
				return err
			}
		}
		if err := recalcOrderTotals(tx, order); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func (s *OrderService) UpdateItem(restaurantID, orderID, itemID uint, req *UpdateOrderItemRequest) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, item, err := editablePendingItem(tx, restaurantID, orderID, itemID)
		if err != nil {
			return err
		}
		qty := req.Quantity
		if qty <= 0 {
			return errors.New("quantity must be greater than zero")
		}
		item.Quantity = qty
		item.Note = strings.TrimSpace(req.Note)
		item.Subtotal = (item.UnitPrice + item.OptionsTotal) * float64(qty)
		if err := tx.SaveItem(item); err != nil {
			return err
		}
		if err := recalcOrderTotals(tx, order); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func (s *OrderService) DeleteItem(restaurantID, orderID, itemID uint) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, item, err := editablePendingItem(tx, restaurantID, orderID, itemID)
		if err != nil {
			return err
		}
		if err := tx.DeleteItem(item); err != nil {
			return err
		}
		if err := recalcOrderTotals(tx, order); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func (s *OrderService) SendToKitchen(restaurantID, userID, orderID uint) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if isTerminalOrder(order.Status) {
			return errors.New("cannot send a closed order to kitchen")
		}
		if err := sendPendingItemsToKitchen(tx, order, userID); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func (s *OrderService) UpdateItemStatus(restaurantID, userID, orderID, itemID uint, status, reason string) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if isTerminalOrder(order.Status) {
			return errors.New("cannot update item status on closed order")
		}
		item, err := tx.FindItem(restaurantID, order.ID, itemID)
		if err != nil {
			return err
		}
		next := strings.TrimSpace(status)
		if !canTransitionItem(item.Status, next) {
			return fmt.Errorf("invalid item status transition from %s to %s", item.Status, next)
		}
		now := repository.BangkokNow()
		item.Status = next
		if next == entity.OrderItemStatusReady {
			item.ReadyAt = &now
		}
		if next == entity.OrderItemStatusServed {
			if err := deductInventoryForServedItem(tx, restaurantID, userID, order, item); err != nil {
				return err
			}
			item.ServedAt = &now
		}
		if next == entity.OrderItemStatusCancelled {
			item.CancelledReason = strings.TrimSpace(reason)
		}
		if err := tx.SaveItem(item); err != nil {
			return err
		}
		if err := refreshOrderStatusFromItems(tx, order, userID); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func (s *OrderService) CancelOrder(restaurantID, userID, orderID uint, reason string) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if isTerminalOrder(order.Status) {
			return errors.New("order is already closed")
		}
		order.CancelledReason = strings.TrimSpace(reason)
		now := repository.BangkokNow()
		order.ClosedAt = &now
		if err := setOrderStatus(tx, order, entity.OrderStatusCancelled, userID, order.CancelledReason); err != nil {
			return err
		}
		if err := releaseTableIfNoOpenOrder(tx, restaurantID, order.TableID); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func validateEmptyTableClose(order *entity.Order) error {
	if order == nil || order.OrderType != entity.OrderTypeDineIn || order.TableID == nil || *order.TableID == 0 {
		return errors.New("only an empty dine-in table can be closed")
	}
	if order.Status != entity.OrderStatusOpen {
		return errors.New("only an open table can be closed without an order")
	}
	if len(order.Items) > 0 {
		return errors.New("table order already has items")
	}
	return nil
}

func (s *OrderService) CloseEmptyTable(restaurantID, userID, orderID uint) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if err := validateEmptyTableClose(order); err != nil {
			return err
		}

		const reason = "empty table closed"
		order.CancelledReason = reason
		now := repository.BangkokNow()
		order.ClosedAt = &now
		if err := setOrderStatus(tx, order, entity.OrderStatusCancelled, userID, reason); err != nil {
			return err
		}
		if err := releaseTableIfNoOpenOrder(tx, restaurantID, order.TableID); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func (s *OrderService) CloseOrder(restaurantID, userID, orderID uint) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if order.Status != entity.OrderStatusServed {
			return errors.New("order must be served before closing")
		}
		now := repository.BangkokNow()
		order.ClosedAt = &now
		if err := setOrderStatus(tx, order, entity.OrderStatusCompleted, userID, "order closed"); err != nil {
			return err
		}
		if err := releaseTableIfNoOpenOrder(tx, restaurantID, order.TableID); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func (s *OrderService) KitchenQueue(restaurantID uint) ([]entity.Order, error) {
	return s.repo.KitchenQueue(restaurantID)
}

func (s *OrderService) Bill(restaurantID, orderID uint) (*BillResponse, error) {
	order, err := s.repo.FindOrder(restaurantID, orderID)
	if err != nil {
		return nil, err
	}
	restaurant, err := s.repo.FindRestaurant(restaurantID)
	if err != nil {
		return nil, err
	}
	return billFromOrder(order, restaurant), nil
}

func (s *OrderService) PayOrder(restaurantID, userID, orderID uint, req *PayOrderRequest) (*entity.Order, error) {
	var changed uint
	err := s.repo.Transaction(func(tx *repository.OrderRepository) error {
		order, err := tx.FindOrder(restaurantID, orderID)
		if err != nil {
			return err
		}
		if order.Status != entity.OrderStatusServed {
			return errors.New("order must be served before payment")
		}
		if order.PaymentStatus == "paid" {
			return errors.New("order is already paid")
		}
		method := strings.TrimSpace(req.Method)
		if method != "cash" && method != "promptpay_qr" {
			return errors.New("invalid payment method")
		}
		restaurant, err := tx.FindRestaurant(restaurantID)
		if err != nil {
			return err
		}
		bill := billFromOrder(order, restaurant)
		received := req.ReceivedAmount
		if method == "promptpay_qr" || received <= 0 {
			received = bill.GrandTotal
		}
		if received < bill.GrandTotal {
			return errors.New("received amount is less than grand total")
		}
		now := repository.BangkokNow()
		order.ServiceChargeAmount = bill.ServiceChargeAmount
		order.VATAmount = bill.VATAmount
		order.TotalAmount = bill.TotalAmount
		order.GrandTotal = bill.GrandTotal
		order.PaymentStatus = "paid"
		order.ClosedAt = &now
		if err := setOrderStatus(tx, order, entity.OrderStatusCompleted, userID, "payment received"); err != nil {
			return err
		}
		payment := &entity.OrderPayment{
			OrderID:        order.ID,
			RestaurantID:   restaurantID,
			Method:         method,
			Amount:         bill.GrandTotal,
			ReceivedAmount: roundMoney(received),
			ChangeAmount:   roundMoney(received - bill.GrandTotal),
			Note:           strings.TrimSpace(req.Note),
			PaidBy:         userID,
			PaidAt:         now,
		}
		if err := tx.CreatePayment(payment); err != nil {
			return err
		}
		if err := releaseTableIfNoOpenOrder(tx, restaurantID, order.TableID); err != nil {
			return err
		}
		changed = order.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindOrder(restaurantID, changed)
}

func orderNumberFromIndex(index int) string {
	if index < 1 {
		index = 1
	}
	letterIndex := (index - 1) / 999
	number := ((index - 1) % 999) + 1
	if letterIndex > 25 {
		letterIndex = 25
	}
	return fmt.Sprintf("%c%03d", rune('A'+letterIndex), number)
}

func editablePendingItem(tx *repository.OrderRepository, restaurantID, orderID, itemID uint) (*entity.Order, *entity.OrderItem, error) {
	order, err := tx.FindOrder(restaurantID, orderID)
	if err != nil {
		return nil, nil, err
	}
	if isTerminalOrder(order.Status) {
		return nil, nil, errors.New("cannot edit item on a closed order")
	}
	item, err := tx.FindItem(restaurantID, order.ID, itemID)
	if err != nil {
		return nil, nil, err
	}
	if item.Status != entity.OrderItemStatusPending {
		return nil, nil, errors.New("only pending items can be edited")
	}
	return order, item, nil
}

func validateSelectedMenuOptions(menu *entity.MenuItem, selectedIDs []uint) ([]selectedMenuOption, float64, error) {
	selectedByID := map[uint]bool{}
	for _, id := range selectedIDs {
		if id != 0 {
			selectedByID[id] = true
		}
	}
	selected := []selectedMenuOption{}
	total := 0.0
	for _, group := range menu.OptionGroups {
		if !group.IsActive {
			continue
		}
		groupSelected := 0
		for _, option := range group.Options {
			if !option.IsActive || !selectedByID[option.ID] {
				continue
			}
			groupSelected += 1
			total += option.PriceDelta
			selected = append(selected, selectedMenuOption{
				ID:            option.ID,
				OptionGroupID: group.ID,
				GroupName:     group.Name,
				OptionName:    option.Name,
				PriceDelta:    option.PriceDelta,
			})
			delete(selectedByID, option.ID)
		}
		minSelect := group.MinSelect
		if group.Required && minSelect < 1 {
			minSelect = 1
		}
		maxSelect := group.MaxSelect
		if maxSelect < 1 {
			maxSelect = 1
		}
		if groupSelected < minSelect {
			return nil, 0, fmt.Errorf("กรุณาเลือก %s อย่างน้อย %d ตัวเลือก", group.Name, minSelect)
		}
		if groupSelected > maxSelect {
			return nil, 0, fmt.Errorf("%s เลือกได้สูงสุด %d ตัวเลือก", group.Name, maxSelect)
		}
	}
	if len(selectedByID) > 0 {
		return nil, 0, errors.New("ตัวเลือกนี้ไม่พร้อมใช้งานสำหรับเมนูนี้")
	}
	return selected, total, nil
}

func recalcOrderTotals(tx *repository.OrderRepository, order *entity.Order) error {
	items, err := tx.ListItems(order.ID)
	if err != nil {
		return err
	}
	subtotal := 0.0
	for _, item := range items {
		if item.Status != entity.OrderItemStatusCancelled {
			subtotal += item.Subtotal
		}
	}
	order.Subtotal = subtotal
	if order.DiscountAmount < 0 {
		order.DiscountAmount = 0
	}
	if order.DiscountAmount > subtotal {
		order.DiscountAmount = subtotal
	}
	order.TotalAmount = subtotal - order.DiscountAmount
	if order.TotalAmount < 0 {
		order.TotalAmount = 0
	}
	order.GrandTotal = order.TotalAmount + order.ServiceChargeAmount + order.VATAmount
	return tx.SaveOrder(order)
}

func billFromOrder(order *entity.Order, restaurant *entity.Restaurant) *BillResponse {
	subtotal := roundMoney(order.Subtotal)
	discount := roundMoney(order.DiscountAmount)
	if discount < 0 {
		discount = 0
	}
	if discount > subtotal {
		discount = subtotal
	}
	total := roundMoney(subtotal - discount)
	if total < 0 {
		total = 0
	}
	serviceEnabled := restaurant.ServiceChargeEnabled
	serviceRate := restaurant.ServiceChargeRate
	vatEnabled := restaurant.VATEnabled
	vatRate := restaurant.VATRate
	serviceAmount := order.ServiceChargeAmount
	vatAmount := order.VATAmount
	grandTotal := order.GrandTotal
	if order.PaymentStatus != "paid" {
		if serviceEnabled {
			serviceAmount = roundMoney(total * serviceRate / 100)
		} else {
			serviceAmount = 0
		}
		if vatEnabled {
			vatAmount = roundMoney((total + serviceAmount) * vatRate / 100)
		} else {
			vatAmount = 0
		}
		grandTotal = roundMoney(total + serviceAmount + vatAmount)
	}
	if grandTotal <= 0 {
		grandTotal = roundMoney(total + serviceAmount + vatAmount)
	}
	return &BillResponse{
		Order:                order,
		Items:                order.Items,
		Subtotal:             subtotal,
		DiscountAmount:       discount,
		ServiceChargeEnabled: serviceEnabled,
		ServiceChargeRate:    serviceRate,
		ServiceChargeAmount:  roundMoney(serviceAmount),
		VATEnabled:           vatEnabled,
		VATRate:              vatRate,
		VATAmount:            roundMoney(vatAmount),
		TotalAmount:          total,
		GrandTotal:           grandTotal,
		PaymentStatus:        order.PaymentStatus,
		PromptPayName:        restaurant.PromptPayName,
		PromptPayQRImage:     restaurant.PromptPayQRImage,
		Payments:             order.Payments,
	}
}
