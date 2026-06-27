package service

import (
	"errors"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"gorm.io/gorm"
)

type CustomerOrderService struct {
	repo *repository.OrderRepository
}

func ProvideCustomerOrderService(repo *repository.OrderRepository) *CustomerOrderService {
	return &CustomerOrderService{repo: repo}
}

type CustomerRestaurantResponse struct {
	ID         uint   `json:"id"`
	Name       string `json:"name"`
	BranchName string `json:"branch_name"`
	Logo       string `json:"logo"`
	OpenTime   string `json:"open_time"`
	CloseTime  string `json:"close_time"`
}

type CustomerTableResponse struct {
	Restaurant CustomerRestaurantResponse `json:"restaurant"`
	Table      *entity.RestaurantTable    `json:"table"`
	Categories []entity.Category          `json:"categories"`
	MenuItems  []entity.MenuItem          `json:"menu_items"`
	Order      *entity.Order              `json:"order,omitempty"`
}

type CustomerCartItemRequest struct {
	MenuID            uint   `json:"menu_id" binding:"required"`
	Quantity          int    `json:"quantity"`
	Note              string `json:"note"`
	SelectedOptionIDs []uint `json:"selected_option_ids"`
}

type SubmitCustomerOrderRequest struct {
	Note  string                    `json:"note"`
	Items []CustomerCartItemRequest `json:"items" binding:"required"`
}

func (s *CustomerOrderService) GetTable(token string) (*CustomerTableResponse, error) {
	table, err := s.tableByToken(token)
	if err != nil {
		return nil, err
	}
	return s.customerTableResponse(table)
}

func (s *CustomerOrderService) SubmitOrder(token string, req *SubmitCustomerOrderRequest) (*CustomerTableResponse, error) {
	table, err := s.tableByToken(token)
	if err != nil {
		return nil, err
	}
	if len(req.Items) == 0 {
		return nil, errors.New("order must include at least one item")
	}
	if len(req.Items) > 50 {
		return nil, errors.New("order can include up to 50 items")
	}

	err = s.repo.Transaction(func(tx *repository.OrderRepository) error {
		restaurant, err := tx.FindRestaurant(table.RestaurantID)
		if err != nil {
			return err
		}
		actorID := restaurant.OwnerID
		if actorID == 0 {
			return errors.New("restaurant owner is not configured")
		}

		order, err := tx.FindOpenOrderByTable(table.RestaurantID, table.ID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("table is not open for customer ordering")
			}
			return err
		}
		if isTerminalOrder(order.Status) {
			return errors.New("order is already closed")
		}
		if strings.TrimSpace(req.Note) != "" && strings.TrimSpace(order.Note) == "" {
			order.Note = customerNote(req.Note)
			if err := tx.SaveOrder(order); err != nil {
				return err
			}
		}

		addedItemIDs := make([]uint, 0, len(req.Items))
		for _, itemReq := range req.Items {
			itemID, err := addCustomerItem(tx, table.RestaurantID, order, itemReq)
			if err != nil {
				return err
			}
			addedItemIDs = append(addedItemIDs, itemID)
		}
		if err := recalcOrderTotals(tx, order); err != nil {
			return err
		}
		return sendPendingItemsToKitchenByIDs(tx, order, actorID, addedItemIDs)
	})
	if err != nil {
		return nil, err
	}
	return s.GetTable(token)
}

func (s *CustomerOrderService) tableByToken(token string) (*entity.RestaurantTable, error) {
	normalized := strings.TrimSpace(token)
	if normalized == "" {
		return nil, errors.New("table token is required")
	}
	table, err := s.repo.FindTableByCustomerToken(normalized)
	if err != nil {
		return nil, errors.New("table QR code is not valid")
	}
	return table, nil
}

func (s *CustomerOrderService) customerTableResponse(table *entity.RestaurantTable) (*CustomerTableResponse, error) {
	restaurant, err := s.repo.FindRestaurant(table.RestaurantID)
	if err != nil {
		return nil, err
	}
	categories, err := s.repo.ListPublicCategories(table.RestaurantID)
	if err != nil {
		return nil, err
	}
	menuItems, err := s.repo.ListPublicMenuItems(table.RestaurantID)
	if err != nil {
		return nil, err
	}
	var order *entity.Order
	if current, err := s.repo.FindCustomerOpenOrderByTable(table.RestaurantID, table.ID); err == nil {
		order = current
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	return &CustomerTableResponse{
		Restaurant: CustomerRestaurantResponse{
			ID:         restaurant.ID,
			Name:       restaurant.Name,
			BranchName: restaurant.BranchName,
			Logo:       restaurant.Logo,
			OpenTime:   restaurant.OpenTime,
			CloseTime:  restaurant.CloseTime,
		},
		Table:      table,
		Categories: categories,
		MenuItems:  menuItems,
		Order:      order,
	}, nil
}

func addCustomerItem(tx *repository.OrderRepository, restaurantID uint, order *entity.Order, req CustomerCartItemRequest) (uint, error) {
	menu, err := tx.FindMenuItem(restaurantID, req.MenuID)
	if err != nil {
		return 0, errors.New("menu item not found")
	}
	if !menu.IsAvailable {
		return 0, errors.New("menu item is unavailable")
	}
	qty := req.Quantity
	if qty <= 0 {
		qty = 1
	}
	selectedOptions, optionsTotal, err := validateSelectedMenuOptions(menu, req.SelectedOptionIDs)
	if err != nil {
		return 0, err
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
		FulfillmentType: entity.OrderItemFulfillmentDineIn,
		Note:            strings.TrimSpace(req.Note),
		Status:          entity.OrderItemStatusPending,
	}
	if err := tx.CreateItem(item); err != nil {
		return 0, err
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
			return 0, err
		}
	}
	return item.ID, nil
}

func customerNote(note string) string {
	trimmed := strings.TrimSpace(note)
	if trimmed == "" {
		return "customer QR order"
	}
	return "customer QR: " + trimmed
}
