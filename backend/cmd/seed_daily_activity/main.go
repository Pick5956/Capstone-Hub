// Command seed_daily_activity adds one day of realistic shop activity to the
// database so the demo restaurant looks like it operates every day rather than
// being a frozen snapshot: a run of completed+paid orders (with their cost
// deductions so margin stays honest), a few orders still live on the floor
// (open/cooking/served and unpaid, so get_active_orders has something to show),
// an expense or two, and the matching drop in ingredient stock.
//
// It is meant to be run once at the start of each day. It is idempotent per day:
// every row it writes carries a marker note "[daily_activity YYYY-MM-DD]", so a
// second run for the same date does nothing unless -force is given, and -purge
// removes exactly what previous runs created.
//
// Usage:
//
//	go run ./cmd/seed_daily_activity                 (today, restaurant 1)
//	go run ./cmd/seed_daily_activity -date 2026-08-29
//	go run ./cmd/seed_daily_activity -force           (re-seed today)
//	go run ./cmd/seed_daily_activity -purge           (remove today's activity)
package main

import (
	"flag"
	"fmt"
	"hash/fnv"
	"log"
	"math/rand"
	"time"

	"gorm.io/gorm"

	"Project-M/config"
	"Project-M/internal/entity"
)

func main() {
	restaurantID := flag.Uint("restaurant-id", 1, "restaurant to add activity for")
	dateFlag := flag.String("date", "", "day to seed as YYYY-MM-DD (default: today in Bangkok)")
	force := flag.Bool("force", false, "re-seed even if this day already has activity")
	purge := flag.Bool("purge", false, "remove the activity previously seeded for this day")
	flag.Parse()

	if err := config.LoadRuntimeEnvironment(); err != nil {
		log.Fatalf("env: %v", err)
	}
	if err := config.ConnectionDB(); err != nil {
		log.Fatalf("db: %v", err)
	}
	defer config.CloseDatabase()
	db := config.DB()

	loc := bangkok()
	day := time.Now().In(loc)
	if *dateFlag != "" {
		parsed, err := time.ParseInLocation("2006-01-02", *dateFlag, loc)
		if err != nil {
			log.Fatalf("bad -date %q: %v", *dateFlag, err)
		}
		day = parsed
	}
	dateStr := day.Format("2006-01-02")
	marker := fmt.Sprintf("[daily_activity %s]", dateStr)

	if *purge {
		purgeDay(db, *restaurantID, marker)
		return
	}

	var existing int64
	db.Model(&entity.Order{}).
		Where("restaurant_id = ? AND note = ?", *restaurantID, marker).
		Count(&existing)
	if existing > 0 && !*force {
		log.Printf("วันที่ %s มีกิจกรรมแล้ว (%d ออเดอร์) ข้ามไป — ใช้ -force ถ้าจะเติมซ้ำ", dateStr, existing)
		return
	}
	if *force {
		purgeDay(db, *restaurantID, marker)
	}

	menus, err := loadMenus(db, *restaurantID)
	if err != nil || len(menus) == 0 {
		log.Fatalf("no menus for restaurant %d: %v", *restaurantID, err)
	}
	ingredients, err := loadIngredients(db, *restaurantID)
	if err != nil {
		log.Fatalf("load ingredients: %v", err)
	}
	staffID, err := resolveStaffID(db, *restaurantID)
	if err != nil {
		log.Fatalf("resolve staff: %v", err)
	}

	// Seeded from the date, so a given day always generates the same activity —
	// the idempotency guard already prevents double runs, and a stable seed makes
	// -force reproduce the same day rather than a different one.
	rng := rand.New(rand.NewSource(int64(hashDate(dateStr))))

	summary, err := seedDay(db, *restaurantID, marker, dateStr, day, loc, menus, ingredients, staffID, rng)
	if err != nil {
		log.Fatalf("seed day %s: %v", dateStr, err)
	}
	log.Printf("เติมกิจกรรมวันที่ %s แล้ว: ขายจบ %d ออเดอร์ (%.0f บาท) · ค้างบนโต๊ะ %d · รายจ่าย %d รายการ · สต๊อกขยับ %d ตัว",
		dateStr, summary.completed, summary.revenue, summary.active, summary.expenses, summary.stockMoved)
}

type daySummary struct {
	completed  int
	active     int
	revenue    float64
	expenses   int
	stockMoved int
}

func seedDay(db *gorm.DB, restaurantID uint, marker, dateStr string, day time.Time, loc *time.Location,
	menus []entity.MenuItem, ingredients []entity.Ingredient, staffID uint, rng *rand.Rand) (daySummary, error) {

	var summary daySummary
	// Total ingredient quantity consumed today, keyed by ingredient id, so the
	// live stock can be dropped by what the day's cooking actually used.
	consumed := map[uint]float64{}
	seq := 0
	tag := fmt.Sprintf("%x", rng.Intn(1<<24))

	err := db.Transaction(func(tx *gorm.DB) error {
		// ---- completed, paid orders: the day's sales ------------------------
		completed := 18 + rng.Intn(11) // 18–28
		for i := 0; i < completed; i++ {
			seq++
			openedAt := mealTime(day, loc, rng)
			done := openedAt.Add(time.Duration(20+rng.Intn(50)) * time.Minute)
			fulfillment := entity.OrderItemFulfillmentDineIn
			orderType := entity.OrderTypeDineIn
			if rng.Float64() < 0.3 {
				orderType, fulfillment = entity.OrderTypeTakeaway, entity.OrderItemFulfillmentTakeaway
			}
			order := &entity.Order{
				Model:         gorm.Model{CreatedAt: openedAt, UpdatedAt: done},
				RestaurantID:  restaurantID,
				OrderType:     orderType,
				OrderNumber:   fmt.Sprintf("DA-%s-%s-%03d", dateStr, tag, seq),
				OrderDate:     dateStr,
				StaffID:       staffID,
				CustomerCount: 1 + rng.Intn(4),
				Status:        entity.OrderStatusCompleted,
				PaymentStatus: entity.PaymentStatusPaid,
				Note:          marker,
				OpenedAt:      openedAt,
				ClosedAt:      &done,
				CompletedAt:   &done,
				Version:       1,
			}
			if err := tx.Create(order).Error; err != nil {
				return err
			}
			items := buildItems(order, menus, fulfillment, done, rng)
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
			total := 0.0
			for idx := range items {
				total += items[idx].Subtotal
				deductions, recipes := buildCost(&items[idx], ingredients, staffID, rng)
				for _, d := range deductions {
					consumed[d.IngredientID] += d.Quantity
				}
				if len(deductions) > 0 {
					if err := tx.Create(&deductions).Error; err != nil {
						return err
					}
				}
				if len(recipes) > 0 {
					if err := tx.Create(&recipes).Error; err != nil {
						return err
					}
				}
			}
			total = round2(total)
			if err := tx.Model(order).Updates(map[string]interface{}{
				"subtotal": total, "total_amount": total, "grand_total": total,
			}).Error; err != nil {
				return err
			}
			summary.completed++
			summary.revenue += total
		}

		// ---- orders still live on the floor: unpaid, mid-service ------------
		// Distinct free dine-in tables, because the schema allows only one active
		// order per table. A couple of takeaways need no table.
		freeTables := freeDineInTables(tx, restaurantID)
		liveStates := []string{
			entity.OrderStatusSentToKitchen, entity.OrderStatusCooking,
			entity.OrderStatusCooking, entity.OrderStatusReady, entity.OrderStatusServed,
		}
		now := time.Now().In(loc)
		activeWanted := 3 + rng.Intn(3) // 3–5
		for i := 0; i < activeWanted; i++ {
			seq++
			openedAt := now.Add(-time.Duration(5+rng.Intn(80)) * time.Minute)
			status := liveStates[rng.Intn(len(liveStates))]
			order := &entity.Order{
				Model:         gorm.Model{CreatedAt: openedAt, UpdatedAt: now},
				RestaurantID:  restaurantID,
				OrderType:     entity.OrderTypeDineIn,
				OrderNumber:   fmt.Sprintf("DA-%s-%s-%03d", dateStr, tag, seq),
				OrderDate:     dateStr,
				StaffID:       staffID,
				CustomerCount: 1 + rng.Intn(4),
				Status:        status,
				PaymentStatus: entity.PaymentStatusUnpaid,
				Note:          marker,
				OpenedAt:      openedAt,
				Version:       1,
			}
			fulfillment := entity.OrderItemFulfillmentDineIn
			if i < len(freeTables) {
				order.TableID = &freeTables[i].ID
			} else if rng.Float64() < 0.5 {
				order.OrderType, fulfillment = entity.OrderTypeTakeaway, entity.OrderItemFulfillmentTakeaway
			} else {
				// No free table and staying dine-in would collide with nothing, but
				// a dine-in order with no table reads oddly; make it takeaway.
				order.OrderType, fulfillment = entity.OrderTypeTakeaway, entity.OrderItemFulfillmentTakeaway
			}
			if err := tx.Create(order).Error; err != nil {
				return err
			}
			items := buildItems(order, menus, fulfillment, now, rng)
			for idx := range items {
				items[idx].Status = activeItemStatus(status)
			}
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
			total := 0.0
			for idx := range items {
				total += items[idx].Subtotal
			}
			total = round2(total)
			if err := tx.Model(order).Updates(map[string]interface{}{
				"subtotal": total, "total_amount": total, "grand_total": total,
			}).Error; err != nil {
				return err
			}
			if order.TableID != nil {
				if err := tx.Model(&entity.RestaurantTable{}).
					Where("id = ?", *order.TableID).
					Update("status", entity.TableStatusOccupied).Error; err != nil {
					return err
				}
			}
			summary.active++
		}

		// ---- an expense or two: a restock, sometimes a utility bill ---------
		expenses := buildExpenses(restaurantID, day, staffID, marker, ingredients, rng)
		if len(expenses) > 0 {
			if err := tx.Create(&expenses).Error; err != nil {
				return err
			}
			summary.expenses = len(expenses)
		}

		// ---- drop live stock by what today's cooking consumed ---------------
		for ingredientID, qty := range consumed {
			if qty <= 0 {
				continue
			}
			// Clamp at zero: selling never drives recorded stock negative, it drives
			// it to empty and then the low-stock tools flag it.
			if err := tx.Model(&entity.Ingredient{}).
				Where("id = ? AND restaurant_id = ?", ingredientID, restaurantID).
				Update("stock", gorm.Expr("GREATEST(stock - ?, 0)", round2(qty))).Error; err != nil {
				return err
			}
			summary.stockMoved++
		}
		// The restock expense also puts stock back for the item it bought, so the
		// movement goes both ways and one ingredient climbs while others fall.
		for _, expense := range expenses {
			if expense.Category != "ingredient" || expense.IngredientTransactionID == nil {
				continue
			}
			if err := tx.Model(&entity.Ingredient{}).
				Where("id = ? AND restaurant_id = ?", *expense.IngredientTransactionID, restaurantID).
				Update("stock", gorm.Expr("stock + ?", restockUnits(expense.Amount))).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return summary, err
}

// activeItemStatus keeps an item's kitchen state consistent with its order's.
func activeItemStatus(orderStatus string) string {
	switch orderStatus {
	case entity.OrderStatusSentToKitchen:
		return entity.OrderItemStatusPending
	case entity.OrderStatusCooking:
		return entity.OrderItemStatusCooking
	case entity.OrderStatusReady:
		return entity.OrderItemStatusReady
	default:
		return entity.OrderItemStatusServed
	}
}

func buildItems(order *entity.Order, menus []entity.MenuItem, fulfillment string, servedAt time.Time, rng *rand.Rand) []entity.OrderItem {
	n := 1 + rng.Intn(4)
	if n > len(menus) {
		n = len(menus)
	}
	items := make([]entity.OrderItem, 0, n)
	for _, mi := range rng.Perm(len(menus))[:n] {
		menu := menus[mi]
		qty := 1
		if r := rng.Float64(); r > 0.93 {
			qty = 3
		} else if r > 0.7 {
			qty = 2
		}
		items = append(items, entity.OrderItem{
			Model:           gorm.Model{CreatedAt: order.OpenedAt, UpdatedAt: servedAt},
			OrderID:         order.ID,
			RestaurantID:    order.RestaurantID,
			MenuID:          menu.ID,
			MenuName:        menu.Name,
			UnitPrice:       menu.Price,
			Quantity:        qty,
			Subtotal:        round2(menu.Price * float64(qty)),
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

func buildCost(item *entity.OrderItem, ingredients []entity.Ingredient, staffID uint, rng *rand.Rand) ([]entity.OrderInventoryDeduction, []entity.OrderItemRecipeSnapshot) {
	ratio := 0.30 + 0.15*float64(item.MenuID%100)/100.0
	target := round2(item.Subtotal * ratio)
	k := 2 + rng.Intn(2)
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
		if i == k-1 {
			part = round2(target - round2(target/float64(k))*float64(k-1))
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
			Model:        gorm.Model{CreatedAt: item.CreatedAt, UpdatedAt: item.CreatedAt},
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
			Model:           gorm.Model{CreatedAt: item.CreatedAt, UpdatedAt: item.CreatedAt},
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

// buildExpenses writes what an owner would actually enter on a normal day: an
// ingredient restock most days, and now and then a utility bill.
func buildExpenses(restaurantID uint, day time.Time, staffID uint, marker string, ingredients []entity.Ingredient, rng *rand.Rand) []entity.Expense {
	spentAt := time.Date(day.Year(), day.Month(), day.Day(), 9, rng.Intn(50), 0, 0, day.Location())
	expenses := []entity.Expense{}

	if len(ingredients) > 0 {
		// Restock whichever ingredient is lowest, so the buy is one the shop needs.
		lowest := ingredients[0]
		for _, ing := range ingredients {
			if ing.Stock < lowest.Stock {
				lowest = ing
			}
		}
		amount := round2(600 + rng.Float64()*1900)
		// IngredientTransactionID is deliberately left nil. It means "this row was
		// written automatically by a stock-in", it is unique so one restock cannot
		// bill twice, and it points at ingredient_transactions — not at an
		// ingredient. It used to be filled with the ingredient's own ID, which was
		// the wrong table and, being unique, broke the whole seeding run on the
		// first day the same ingredient came up lowest twice (SQLSTATE 23505).
		// These rows stand for expenses the owner typed in, so nil is also correct.
		expenses = append(expenses, entity.Expense{
			Model:        gorm.Model{CreatedAt: spentAt, UpdatedAt: spentAt},
			RestaurantID: restaurantID,
			Category:     "ingredient",
			Amount:       amount,
			SpentAt:      spentAt,
			Note:         marker + " ซื้อ" + lowest.Name,
			CreatedByID:  staffID,
		})
	}
	if rng.Float64() < 0.25 {
		utility := spentAt.Add(2 * time.Hour)
		expenses = append(expenses, entity.Expense{
			Model:        gorm.Model{CreatedAt: utility, UpdatedAt: utility},
			RestaurantID: restaurantID,
			Category:     "utilities",
			Amount:       round2(150 + rng.Float64()*400),
			SpentAt:      utility,
			Note:         marker + " ค่าน้ำค่าไฟรายวัน",
			CreatedByID:  staffID,
		})
	}
	return expenses
}

// restockUnits turns a baht restock into a rough unit count to add back to
// stock. It does not need to be exact — it only has to move the number.
func restockUnits(amount float64) float64 {
	return round2(amount / 5)
}

func freeDineInTables(tx *gorm.DB, restaurantID uint) []entity.RestaurantTable {
	var tables []entity.RestaurantTable
	tx.Where("restaurant_id = ? AND status = ? AND deleted_at IS NULL",
		restaurantID, entity.TableStatusFree).
		Order("id asc").Limit(5).Find(&tables)
	return tables
}

func purgeDay(db *gorm.DB, restaurantID uint, marker string) {
	var orders []entity.Order
	db.Where("restaurant_id = ? AND note = ?", restaurantID, marker).Find(&orders)
	ids := make([]uint, 0, len(orders))
	tableIDs := make([]uint, 0, len(orders))
	for _, order := range orders {
		ids = append(ids, order.ID)
		if order.TableID != nil {
			tableIDs = append(tableIDs, *order.TableID)
		}
	}
	if len(ids) > 0 {
		db.Where("order_id IN ?", ids).Delete(&entity.OrderInventoryDeduction{})
		db.Where("order_id IN ?", ids).Delete(&entity.OrderItemRecipeSnapshot{})
		db.Where("order_id IN ?", ids).Delete(&entity.OrderItem{})
		db.Where("id IN ?", ids).Delete(&entity.Order{})
	}
	if len(tableIDs) > 0 {
		db.Model(&entity.RestaurantTable{}).Where("id IN ?", tableIDs).
			Update("status", entity.TableStatusFree)
	}
	db.Where("restaurant_id = ? AND note LIKE ?", restaurantID, marker+"%").Delete(&entity.Expense{})
	log.Printf("ลบกิจกรรมของ %s แล้ว (%d ออเดอร์)", marker, len(ids))
}

func loadMenus(db *gorm.DB, restaurantID uint) ([]entity.MenuItem, error) {
	var menus []entity.MenuItem
	err := db.Where("restaurant_id = ? AND price > 0 AND deleted_at IS NULL", restaurantID).
		Find(&menus).Error
	return menus, err
}

func loadIngredients(db *gorm.DB, restaurantID uint) ([]entity.Ingredient, error) {
	var ingredients []entity.Ingredient
	err := db.Where("restaurant_id = ? AND deleted_at IS NULL", restaurantID).
		Find(&ingredients).Error
	return ingredients, err
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
		return 0, fmt.Errorf("no user to attribute orders to: %w", err)
	}
	return user.ID, nil
}

// mealTime scatters an order across the day, clustered on lunch and dinner the
// way a real shop's tickets are.
func mealTime(day time.Time, loc *time.Location, rng *rand.Rand) time.Time {
	var hour int
	switch {
	case rng.Float64() < 0.45: // lunch
		hour = 11 + rng.Intn(3)
	case rng.Float64() < 0.75: // dinner
		hour = 17 + rng.Intn(4)
	default: // the rest of opening hours
		hour = 10 + rng.Intn(11)
	}
	return time.Date(day.Year(), day.Month(), day.Day(), hour, rng.Intn(60), rng.Intn(60), 0, loc)
}

func hashDate(date string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(date))
	return h.Sum32()
}

func bangkok() *time.Location {
	if loc, err := time.LoadLocation("Asia/Bangkok"); err == nil {
		return loc
	}
	return time.FixedZone("Asia/Bangkok", 7*60*60)
}

func round2(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}
