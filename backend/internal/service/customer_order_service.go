package service

import (
	"errors"
	"math"
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
	// Tells the customer page whether it should ask for device location.
	GeofenceRequired bool `json:"geofence_required"`
}

type CustomerTableResponse struct {
	Restaurant CustomerRestaurantResponse `json:"restaurant"`
	Table      *entity.RestaurantTable    `json:"table"`
	Categories []entity.Category          `json:"categories"`
	MenuItems  []entity.MenuItem          `json:"menu_items"`
	Order      *entity.Order              `json:"order,omitempty"`
	// True when the just-submitted items were held for staff confirmation
	// because the device location could not be verified.
	AwaitingStaffConfirm bool `json:"awaiting_staff_confirm,omitempty"`
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
	// Device location captured at submit time. Nil when the customer declined
	// or the browser could not provide it.
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	Accuracy  *float64 `json:"accuracy"`
}

// ErrOutsideRestaurant is returned when the device is clearly away from the
// restaurant, which is the QR-photo-and-order-from-elsewhere case.
var ErrOutsideRestaurant = errors.New("you must be at the restaurant to order")

// Location readings looser than this are treated as unverifiable rather than
// rejected, so a customer with weak indoor GPS is never wrongly blocked.
const maxTrustedAccuracyMeters = 1000

type geofenceOutcome int

const (
	geofenceDisabled   geofenceOutcome = iota // restaurant has not configured a location
	geofenceInside                            // verified at the restaurant
	geofenceUnverified                        // no/low-quality location -> needs staff confirmation
	geofenceOutside                           // verified away from the restaurant
)

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

	var fence geofenceOutcome
	err = s.repo.Transaction(func(tx *repository.OrderRepository) error {
		restaurant, err := tx.FindRestaurant(table.RestaurantID)
		if err != nil {
			return err
		}
		actorID := restaurant.OwnerID
		if actorID == 0 {
			return errors.New("restaurant owner is not configured")
		}

		// Block orders sent from clearly outside the restaurant (photographed QR).
		fence = evaluateGeofence(restaurant, req)
		if fence == geofenceOutside {
			return ErrOutsideRestaurant
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
		if fence == geofenceUnverified {
			// Location could not be verified: keep the items pending so staff can
			// confirm the guests are really seated before the kitchen starts.
			return nil
		}
		return sendPendingItemsToKitchenByIDs(tx, order, actorID, addedItemIDs)
	})
	if err != nil {
		return nil, err
	}
	response, err := s.GetTable(token)
	if err != nil {
		return nil, err
	}
	response.AwaitingStaffConfirm = fence == geofenceUnverified
	return response, nil
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
			ID:               restaurant.ID,
			Name:             restaurant.Name,
			BranchName:       restaurant.BranchName,
			Logo:             restaurant.Logo,
			OpenTime:         restaurant.OpenTime,
			CloseTime:        restaurant.CloseTime,
			GeofenceRequired: restaurant.OrderRadiusMeters > 0 && restaurant.Latitude != nil && restaurant.Longitude != nil,
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

// evaluateGeofence decides whether an order may go straight to the kitchen.
func evaluateGeofence(restaurant *entity.Restaurant, req *SubmitCustomerOrderRequest) geofenceOutcome {
	if restaurant.OrderRadiusMeters <= 0 || restaurant.Latitude == nil || restaurant.Longitude == nil {
		return geofenceDisabled
	}
	if req.Latitude == nil || req.Longitude == nil {
		return geofenceUnverified
	}
	accuracy := 0.0
	if req.Accuracy != nil && *req.Accuracy > 0 {
		accuracy = *req.Accuracy
	}
	if accuracy > maxTrustedAccuracyMeters {
		return geofenceUnverified
	}

	distance := haversineMeters(*restaurant.Latitude, *restaurant.Longitude, *req.Latitude, *req.Longitude)
	// Allow the reading's own margin of error so real customers are not blocked.
	if distance <= float64(restaurant.OrderRadiusMeters)+accuracy {
		return geofenceInside
	}
	return geofenceOutside
}

// haversineMeters returns the great-circle distance between two coordinates.
func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusMeters = 6371000
	toRad := func(deg float64) float64 { return deg * math.Pi / 180 }
	dLat := toRad(lat2 - lat1)
	dLon := toRad(lon2 - lon1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLon/2)*math.Sin(dLon/2)
	return earthRadiusMeters * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func customerNote(note string) string {
	trimmed := strings.TrimSpace(note)
	if trimmed == "" {
		return "customer QR order"
	}
	return "customer QR: " + trimmed
}
