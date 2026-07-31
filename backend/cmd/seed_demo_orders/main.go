// Command seed_demo_orders generates realistic historical orders for a
// restaurant so the AI assistant has data to analyse (revenue, trend, month
// comparison, peak periods, margin, cost, dead stock).
//
// It writes a full chain per order: orders (completed + paid) -> order_items
// (served) -> order_inventory_deductions (cost) -> order_item_recipe_snapshots
// (coverage), so margin and business-readiness analysis work end to end.
//
// Every seeded order carries a marker note, so `-purge` removes exactly what a
// previous run created and nothing else.
//
// Usage:
//
//	go run ./cmd/seed_demo_orders -restaurant-id 1
//	go run ./cmd/seed_demo_orders -restaurant-id 1 -months 12 -avg-per-day 30
//	go run ./cmd/seed_demo_orders -restaurant-id 1 -purge
package main

import (
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"strconv"
	"time"

	"Project-M/config"
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

const seedMarker = "[seed_demo_orders]"

func main() {
	restaurantID := flag.Uint("restaurant-id", 0, "restaurant ID to seed orders into")
	months := flag.Int("months", 12, "how many months of history to generate")
	avgPerDay := flag.Float64("avg-per-day", 30, "baseline paid orders on an ordinary weekday")
	seed := flag.Int64("seed", 42, "random seed for reproducible data")
	withCost := flag.Bool("with-cost", true, "also generate ingredient cost deductions + recipe snapshots (enables margin analysis)")
	purge := flag.Bool("purge", false, "delete previously seeded demo orders for this restaurant instead of creating")
	flag.Parse()

	if *restaurantID == 0 {
		log.Fatal("missing -restaurant-id, example: go run ./cmd/seed_demo_orders -restaurant-id 1")
	}

	if err := config.LoadRuntimeEnvironment(); err != nil {
		log.Fatal(err)
	}
	if err := config.ValidateDatabaseEnvironment(); err != nil {
		log.Fatal(err)
	}
	if err := config.ConnectionDB(); err != nil {
		log.Fatal(err)
	}
	defer func() {
		if err := config.CloseDatabase(); err != nil {
			log.Printf("close database: %v", err)
		}
	}()
	if err := config.EnsureSchemaCurrent(config.DB()); err != nil {
		log.Fatal(err)
	}
	db := config.DB()

	var restaurant entity.Restaurant
	if err := db.First(&restaurant, *restaurantID).Error; err != nil {
		log.Fatalf("restaurant %d not found: %v", *restaurantID, err)
	}

	if *purge {
		if err := purgeSeededOrders(db, uint(*restaurantID)); err != nil {
			log.Fatal(err)
		}
		return
	}

	if err := seedOrders(db, uint(*restaurantID), *months, *avgPerDay, *seed, *withCost); err != nil {
		log.Fatal(err)
	}
}

func purgeSeededOrders(db *gorm.DB, restaurantID uint) error {
	var orderIDs []uint
	if err := db.Model(&entity.Order{}).
		Where("restaurant_id = ? AND note = ?", restaurantID, seedMarker).
		Pluck("id", &orderIDs).Error; err != nil {
		return err
	}
	if len(orderIDs) == 0 {
		fmt.Printf("no seeded demo orders found for restaurant %d — nothing to purge\n", restaurantID)
		return nil
	}
	return db.Transaction(func(tx *gorm.DB) error {
		for _, model := range []interface{}{
			&entity.OrderInventoryDeduction{},
			&entity.OrderItemRecipeSnapshot{},
			&entity.OrderItem{},
			&entity.OrderPayment{},
		} {
			if err := tx.Unscoped().Where("order_id IN ?", orderIDs).Delete(model).Error; err != nil {
				return err
			}
		}
		if err := tx.Unscoped().Where("id IN ?", orderIDs).Delete(&entity.Order{}).Error; err != nil {
			return err
		}
		fmt.Printf("purged %d seeded demo orders (and their items/deductions) for restaurant %d\n", len(orderIDs), restaurantID)
		return nil
	})
}

func seedOrders(db *gorm.DB, restaurantID uint, months int, avgPerDay float64, seed int64, withCost bool) error {
	loc := bangkok()
	rng := rand.New(rand.NewSource(seed))

	var menus []entity.MenuItem
	if err := db.Where("restaurant_id = ? AND deleted_at IS NULL", restaurantID).Find(&menus).Error; err != nil {
		return err
	}
	if len(menus) == 0 {
		return fmt.Errorf("restaurant %d has no menu items — run: go run ./cmd/seed_demo_menu -restaurant-id %d first", restaurantID, restaurantID)
	}

	var ingredients []entity.Ingredient
	if withCost {
		if err := db.Where("restaurant_id = ? AND deleted_at IS NULL", restaurantID).Find(&ingredients).Error; err != nil {
			return err
		}
		if len(ingredients) == 0 {
			log.Printf("warning: restaurant %d has no ingredients — generating sales without cost (margin analysis will show as not ready). Run seed_demo_ingredients to enable it.", restaurantID)
			withCost = false
		}
	}

	staffID, err := resolveStaffID(db, restaurantID)
	if err != nil {
		return err
	}

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	start := today.AddDate(0, -months, 0)
	runTag := strconv.FormatInt(time.Now().Unix()%1000000, 36)

	var totalOrders, totalItems int
	var totalRevenue float64
	seq := 0

	for day := start; !day.After(today); day = day.AddDate(0, 0, 1) {
		monthsElapsed := day.Sub(start).Hours() / 24 / 30.44
		count := dailyOrderCount(day, avgPerDay, monthsElapsed, rng)

		dayOrders := make([]*entity.Order, 0, count)
		dayItems := make([]entity.OrderItem, 0, count*2)
		type pendingCost struct {
			item *entity.OrderItem
		}

		if err := db.Transaction(func(tx *gorm.DB) error {
			var dayDeductions []entity.OrderInventoryDeduction
			var dayRecipes []entity.OrderItemRecipeSnapshot

			for i := 0; i < count; i++ {
				seq++
				openedAt := mealTime(day, rng)
				completedAt := openedAt.Add(time.Duration(20+rng.Intn(50)) * time.Minute)
				orderType := entity.OrderTypeDineIn
				fulfillment := entity.OrderItemFulfillmentDineIn
				if rng.Float64() < 0.3 {
					orderType = entity.OrderTypeTakeaway
					fulfillment = entity.OrderItemFulfillmentTakeaway
				}

				order := &entity.Order{
					RestaurantID:  restaurantID,
					OrderType:     orderType,
					OrderNumber:   fmt.Sprintf("SD-%s-%05d", runTag, seq),
					OrderDate:     day.Format("2006-01-02"),
					StaffID:       staffID,
					CustomerCount: 1 + rng.Intn(4),
					Status:        entity.OrderStatusCompleted,
					PaymentStatus: entity.PaymentStatusPaid,
					Note:          seedMarker,
					OpenedAt:      openedAt,
					ClosedAt:      &completedAt,
					CompletedAt:   &completedAt,
					Version:       1,
				}
				if err := tx.Create(order).Error; err != nil {
					return err
				}

				items := buildItems(order, menus, fulfillment, completedAt, rng)
				if err := tx.Create(&items).Error; err != nil {
					return err
				}

				var orderTotal float64
				for idx := range items {
					orderTotal += items[idx].Subtotal
					if withCost {
						ded, rec := buildCost(&items[idx], ingredients, staffID, rng)
						dayDeductions = append(dayDeductions, ded...)
						dayRecipes = append(dayRecipes, rec...)
					}
				}
				orderTotal = round2(orderTotal)
				order.Subtotal = orderTotal
				order.TotalAmount = orderTotal
				order.GrandTotal = orderTotal
				if err := tx.Model(order).Updates(map[string]interface{}{
					"subtotal": orderTotal, "total_amount": orderTotal, "grand_total": orderTotal,
				}).Error; err != nil {
					return err
				}

				dayOrders = append(dayOrders, order)
				dayItems = append(dayItems, items...)
				totalRevenue += orderTotal
			}

			if len(dayDeductions) > 0 {
				if err := tx.CreateInBatches(dayDeductions, 500).Error; err != nil {
					return err
				}
			}
			if len(dayRecipes) > 0 {
				if err := tx.CreateInBatches(dayRecipes, 500).Error; err != nil {
					return err
				}
			}
			return nil
		}); err != nil {
			return fmt.Errorf("seeding %s: %w", day.Format("2006-01-02"), err)
		}

		totalOrders += len(dayOrders)
		totalItems += len(dayItems)
	}

	fmt.Printf("Seeded restaurant %d: %d orders, %d items, revenue %.2f across %s → %s (cost=%v)\n",
		restaurantID, totalOrders, totalItems, round2(totalRevenue),
		start.Format("2006-01-02"), today.Format("2006-01-02"), withCost)
	fmt.Printf("To undo: go run ./cmd/seed_demo_orders -restaurant-id %d -purge\n", restaurantID)
	return nil
}

// dailyOrderCount models weekly rhythm (weekends busier), a gentle upward trend
// month over month, a mild yearly season, and daily noise.
func dailyOrderCount(day time.Time, avgPerDay, monthsElapsed float64, rng *rand.Rand) int {
	weekday := map[time.Weekday]float64{
		time.Sunday: 1.4, time.Monday: 0.9, time.Tuesday: 0.9, time.Wednesday: 0.95,
		time.Thursday: 1.0, time.Friday: 1.35, time.Saturday: 1.6,
	}[day.Weekday()]
	trend := 1.0 + 0.02*monthsElapsed
	season := 1.0 + 0.10*math.Sin(2*math.Pi*float64(day.YearDay())/365.0)
	noise := 0.8 + 0.4*rng.Float64()

	count := int(math.Round(avgPerDay * weekday * trend * season * noise))
	if count < 1 {
		count = 1
	}
	return count
}

// mealTime picks a timestamp weighted toward lunch and dinner peaks.
func mealTime(day time.Time, rng *rand.Rand) time.Time {
	var hour int
	switch r := rng.Float64(); {
	case r < 0.42: // lunch
		hour = 11 + rng.Intn(3)
	case r < 0.87: // dinner
		hour = 17 + rng.Intn(5)
	default: // off-peak afternoon/late
		hour = 14 + rng.Intn(3)
	}
	return time.Date(day.Year(), day.Month(), day.Day(), hour, rng.Intn(60), rng.Intn(60), 0, day.Location())
}

func buildItems(order *entity.Order, menus []entity.MenuItem, fulfillment string, servedAt time.Time, rng *rand.Rand) []entity.OrderItem {
	numItems := 1 + rng.Intn(4)
	if numItems > len(menus) {
		numItems = len(menus)
	}
	perm := rng.Perm(len(menus))[:numItems]

	items := make([]entity.OrderItem, 0, numItems)
	for _, mi := range perm {
		menu := menus[mi]
		qty := 1
		if r := rng.Float64(); r > 0.7 {
			qty = 2
		} else if r > 0.93 {
			qty = 3
		}
		subtotal := round2(menu.Price * float64(qty))
		items = append(items, entity.OrderItem{
			OrderID:         order.ID,
			RestaurantID:    order.RestaurantID,
			MenuID:          menu.ID,
			MenuName:        menu.Name,
			UnitPrice:       menu.Price,
			Quantity:        qty,
			Subtotal:        subtotal,
			FulfillmentType: fulfillment,
			Status:          entity.OrderItemStatusServed,
			KitchenBatch:    1,
			SentAt:          &order.OpenedAt,
			ReadyAt:         &servedAt,
			ServedAt:        &servedAt,
		})
	}
	return items
}

// buildCost fabricates ingredient deductions summing to a plausible food cost
// (30–45% of the item's revenue) plus matching recipe snapshots for coverage.
func buildCost(item *entity.OrderItem, ingredients []entity.Ingredient, staffID uint, rng *rand.Rand) ([]entity.OrderInventoryDeduction, []entity.OrderItemRecipeSnapshot) {
	ratio := 0.30 + 0.15*float64(item.MenuID%100)/100.0
	target := round2(item.Subtotal * ratio)

	k := 2 + rng.Intn(2) // 2–3 ingredients
	if k > len(ingredients) {
		k = len(ingredients)
	}
	if k == 0 {
		return nil, nil
	}
	pick := rng.Perm(len(ingredients))[:k]

	deductions := make([]entity.OrderInventoryDeduction, 0, k)
	recipes := make([]entity.OrderItemRecipeSnapshot, 0, k)
	for i, ix := range pick {
		ing := ingredients[ix]
		part := round2(target / float64(k))
		if i == k-1 { // last part absorbs rounding remainder
			used := round2(target/float64(k)) * float64(k-1)
			part = round2(target - used)
		}
		if part < 0 {
			part = 0
		}
		unitCost := ing.CostPerUnit
		if unitCost <= 0 {
			unitCost = 1
		}
		qty := part / unitCost
		if qty <= 0 {
			qty = 0.0001
		}
		qtyPerItem := qty / float64(item.Quantity)
		if qtyPerItem <= 0 {
			qtyPerItem = 0.0001
		}

		deductions = append(deductions, entity.OrderInventoryDeduction{
			RestaurantID: item.RestaurantID,
			OrderID:      item.OrderID,
			OrderItemID:  item.ID,
			MenuItemID:   item.MenuID,
			IngredientID: ing.ID,
			Quantity:     qty,
			CostSnapshot: part,
			CreatedByID:  staffID,
		})
		recipes = append(recipes, entity.OrderItemRecipeSnapshot{
			RestaurantID:    item.RestaurantID,
			OrderID:         item.OrderID,
			OrderItemID:     item.ID,
			MenuItemID:      item.MenuID,
			IngredientID:    ing.ID,
			IngredientName:  ing.Name,
			Unit:            ing.Unit,
			QuantityPerItem: qtyPerItem,
			CostPerUnit:     ing.CostPerUnit,
			YieldPercent:    100,
		})
	}
	return deductions, recipes
}

func resolveStaffID(db *gorm.DB, restaurantID uint) (uint, error) {
	var member entity.RestaurantMember
	if err := db.Where("restaurant_id = ?", restaurantID).Order("id asc").First(&member).Error; err == nil {
		return member.UserID, nil
	} else if err != gorm.ErrRecordNotFound {
		return 0, err
	}
	var user entity.User
	if err := db.Order("id asc").First(&user).Error; err != nil {
		return 0, fmt.Errorf("no user found to attribute orders to: %w", err)
	}
	return user.ID, nil
}

func bangkok() *time.Location {
	if loc, err := time.LoadLocation("Asia/Bangkok"); err == nil {
		return loc
	}
	return time.FixedZone("Asia/Bangkok", 7*60*60)
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
