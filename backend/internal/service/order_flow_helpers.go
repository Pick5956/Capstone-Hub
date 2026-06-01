package service

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

func refreshOrderStatusFromItems(tx *repository.OrderRepository, order *entity.Order, userID uint) error {
	items, err := tx.ListItems(order.ID)
	if err != nil {
		return err
	}
	active := make([]entity.OrderItem, 0, len(items))
	for _, item := range items {
		if item.Status != entity.OrderItemStatusCancelled {
			active = append(active, item)
		}
	}
	if len(active) == 0 {
		return nil
	}
	if allItems(active, entity.OrderItemStatusServed) {
		return setOrderStatus(tx, order, entity.OrderStatusServed, userID, "all items served")
	}
	if allItems(active, entity.OrderItemStatusReady) {
		return setOrderStatus(tx, order, entity.OrderStatusReady, userID, "all items ready")
	}
	if order.Status == entity.OrderStatusSentToKitchen && anyItem(active, entity.OrderItemStatusCooking) {
		return nil
	}
	if anyItem(active, entity.OrderItemStatusCooking) || anyItem(active, entity.OrderItemStatusReady) {
		return setOrderStatus(tx, order, entity.OrderStatusCooking, userID, "items in kitchen")
	}
	return nil
}

func sendPendingItemsToKitchen(tx *repository.OrderRepository, order *entity.Order, userID uint) error {
	return sendPendingItemsToKitchenByIDs(tx, order, userID, nil)
}

func sendPendingItemsToKitchenByIDs(tx *repository.OrderRepository, order *entity.Order, userID uint, itemIDs []uint) error {
	items, err := tx.ListItems(order.ID)
	if err != nil {
		return err
	}
	targetIDs := map[uint]bool{}
	for _, id := range itemIDs {
		if id != 0 {
			targetIDs[id] = true
		}
	}
	now := repository.BangkokNow()
	maxBatch, err := tx.MaxKitchenBatch(order.ID)
	if err != nil {
		return err
	}
	nextBatch := maxBatch + 1
	pendingCount := 0
	for i := range items {
		if len(targetIDs) > 0 && !targetIDs[items[i].ID] {
			continue
		}
		if items[i].Status == entity.OrderItemStatusPending {
			pendingCount += 1
			items[i].Status = entity.OrderItemStatusCooking
			items[i].SentAt = &now
			items[i].KitchenBatch = nextBatch
			if err := tx.SaveItem(&items[i]); err != nil {
				return err
			}
		}
	}
	if pendingCount == 0 {
		return errors.New("no pending items to send")
	}
	return setOrderStatus(tx, order, entity.OrderStatusSentToKitchen, userID, fmt.Sprintf("sent batch %d to kitchen", nextBatch))
}

func deductInventoryForServedItem(tx *repository.OrderRepository, restaurantID, userID uint, order *entity.Order, item *entity.OrderItem) error {
	components, err := tx.ListRecipeComponents(restaurantID, item.MenuID)
	if err != nil {
		return err
	}
	if len(components) == 0 {
		return nil
	}
	for _, component := range components {
		required := component.Quantity * float64(item.Quantity)
		if required <= 0 {
			continue
		}
		alreadyDeducted, err := tx.HasInventoryDeduction(item.ID, component.IngredientID)
		if err != nil {
			return err
		}
		if alreadyDeducted {
			continue
		}
		ingredient, err := tx.FindIngredientForUpdate(restaurantID, component.IngredientID)
		if err != nil {
			return err
		}
		if ingredient.Stock < required {
			return fmt.Errorf("%s stock is not enough for %s", ingredient.Name, item.MenuName)
		}
		ingredient.Stock -= required
		if err := tx.SaveIngredient(ingredient); err != nil {
			return err
		}
		cost := recipeComponentCost(required, ingredient.CostPerUnit, ingredient.YieldPercent)
		deduction := &entity.OrderInventoryDeduction{
			RestaurantID: restaurantID,
			OrderID:      order.ID,
			OrderItemID:  item.ID,
			MenuItemID:   item.MenuID,
			IngredientID: ingredient.ID,
			Quantity:     required,
			CostSnapshot: cost,
			Note:         fmt.Sprintf("auto deduction for order %s / %s", order.OrderNumber, item.MenuName),
			CreatedByID:  userID,
		}
		if err := tx.CreateInventoryDeduction(deduction); err != nil {
			return err
		}
		stockTx := &entity.IngredientTransaction{
			RestaurantID: restaurantID,
			IngredientID: ingredient.ID,
			Type:         "out",
			Quantity:     required,
			Note:         deduction.Note,
			CreatedByID:  userID,
		}
		if err := tx.CreateIngredientTransaction(stockTx); err != nil {
			return err
		}
	}
	return nil
}

func recipeComponentCost(quantity, costPerUnit, yieldPercent float64) float64 {
	if quantity <= 0 || costPerUnit <= 0 {
		return 0
	}
	if yieldPercent <= 0 {
		yieldPercent = 100
	}
	return roundMoney(quantity * costPerUnit / (yieldPercent / 100))
}

func setOrderStatus(tx *repository.OrderRepository, order *entity.Order, next string, userID uint, note string) error {
	if order.Status == next {
		return tx.SaveOrder(order)
	}
	from := order.Status
	order.Status = next
	if err := tx.SaveOrder(order); err != nil {
		return err
	}
	return tx.CreateStatusLog(statusLog(order.ID, from, next, userID, note))
}

func statusLog(orderID uint, from, to string, userID uint, note string) *entity.OrderStatusLog {
	return &entity.OrderStatusLog{
		OrderID:    orderID,
		FromStatus: from,
		ToStatus:   to,
		ChangedBy:  userID,
		ChangedAt:  repository.BangkokNow(),
		Note:       strings.TrimSpace(note),
	}
}

func releaseTableIfNoOpenOrder(tx *repository.OrderRepository, restaurantID, tableID uint) error {
	hasOpen, err := tx.HasOpenOrderForTable(restaurantID, tableID)
	if err != nil {
		return err
	}
	if hasOpen {
		return nil
	}
	table, err := tx.FindTable(restaurantID, tableID)
	if err != nil {
		return err
	}
	table.Status = entity.TableStatusFree
	return tx.SaveTable(table)
}

func isTerminalOrder(status string) bool {
	return status == entity.OrderStatusCompleted || status == entity.OrderStatusCancelled
}

func canTransitionItem(from, to string) bool {
	switch from {
	case entity.OrderItemStatusPending:
		return to == entity.OrderItemStatusCooking || to == entity.OrderItemStatusCancelled
	case entity.OrderItemStatusCooking:
		return to == entity.OrderItemStatusReady || to == entity.OrderItemStatusCancelled
	case entity.OrderItemStatusReady:
		return to == entity.OrderItemStatusServed || to == entity.OrderItemStatusCancelled
	case entity.OrderItemStatusServed, entity.OrderItemStatusCancelled:
		return false
	default:
		return false
	}
}

func allItems(items []entity.OrderItem, status string) bool {
	for _, item := range items {
		if item.Status != status {
			return false
		}
	}
	return true
}

func anyItem(items []entity.OrderItem, status string) bool {
	for _, item := range items {
		if item.Status == status {
			return true
		}
	}
	return false
}
