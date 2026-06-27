package config

import (
	"Project-M/config/seed"
	"Project-M/internal/entity"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

func DB() *gorm.DB {
	return db
}

func ConnectionDB() {
	if os.Getenv("GIN_MODE") != ginReleaseMode {
		err := godotenv.Load()
		if err != nil {
			log.Fatal("Error loading .env file")
		}
	}

	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Bangkok", host, user, password, dbname, port)

	// GORM config: PrepareStmt caches prepared statements for reuse,
	// and production logger is quieter in release mode.
	gormCfg := &gorm.Config{
		PrepareStmt: true,
	}
	if os.Getenv("GIN_MODE") == ginReleaseMode {
		gormCfg.Logger = logger.Default.LogMode(logger.Warn)
	}

	database, err := gorm.Open(postgres.Open(dsn), gormCfg)

	if err != nil {
		panic(fmt.Sprintf("failed to connect database: %v", err))
	}

	// Connection pool tuning — values configurable via env vars.
	sqlDB, err := database.DB()
	if err != nil {
		panic(fmt.Sprintf("failed to get underlying sql.DB: %v", err))
	}
	sqlDB.SetMaxOpenConns(envInt("DB_MAX_OPEN_CONNS", 100))
	sqlDB.SetMaxIdleConns(envInt("DB_MAX_IDLE_CONNS", 25))
	sqlDB.SetConnMaxLifetime(time.Duration(envInt("DB_CONN_MAX_LIFETIME_MIN", 30)) * time.Minute)
	sqlDB.SetConnMaxIdleTime(time.Duration(envInt("DB_CONN_MAX_IDLE_TIME_MIN", 5)) * time.Minute)

	fmt.Println("Connect database")
	db = database
}

const ginReleaseMode = "release"

// envInt reads an integer from an environment variable, returning fallback if unset or invalid.
func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func SetupDatabase() *gorm.DB {
	if db.Migrator().HasColumn(&entity.User{}, "role_id") {
		_ = db.Migrator().DropColumn(&entity.User{}, "role_id")
	}
	if db.Migrator().HasColumn(&entity.User{}, "restaurant_id") {
		_ = db.Migrator().DropColumn(&entity.User{}, "restaurant_id")
	}
	if db.Migrator().HasTable(&entity.Role{}) && !db.Migrator().HasColumn(&entity.Role{}, "name") {
		_ = db.Migrator().DropTable(&entity.Role{})
	}
	if db.Migrator().HasColumn("restaurants", "invite_code") {
		_ = db.Migrator().DropColumn("restaurants", "invite_code")
	}
	_ = db.Exec("DO $$ BEGIN IF to_regclass('public.users') IS NOT NULL THEN ALTER TABLE users DROP CONSTRAINT IF EXISTS uni_users_email; END IF; END $$;").Error
	if db.Migrator().HasIndex(&entity.User{}, "uni_users_email") {
		_ = db.Migrator().DropIndex(&entity.User{}, "uni_users_email")
	}
	ensureTableZonePrefixIndex(db)

	db.AutoMigrate(
		&entity.Role{},
		&entity.RestaurantRoleHidden{},
		&entity.User{},
		&entity.Restaurant{},
		&entity.RestaurantMember{},
		&entity.Invitation{},
		&entity.RestaurantAuditLog{},
		&entity.Category{},
		&entity.MenuItem{},
		&entity.MenuItemCategory{},
		&entity.MenuItemIngredient{},
		&entity.MenuOptionGroup{},
		&entity.MenuOption{},
		&entity.TableZone{},
		&entity.TableTag{},
		&entity.RestaurantTable{},
		&entity.Order{},
		&entity.OrderItem{},
		&entity.OrderItemOption{},
		&entity.OrderPayment{},
		&entity.OrderStatusLog{},
		&entity.OrderInventoryDeduction{},
		&entity.IngredientCategory{},
		&entity.Ingredient{},
		&entity.IngredientTransaction{},
	)
	migrateLegacyTableLayout(db)
	backfillCustomerTableTokens(db)
	ensureOrderTakeawayColumns(db)
	ensureOrderItemFulfillmentColumns(db)
	ensureOrderNumberIndex(db)

	seed.SeedRoles(db)

	return db
}

func backfillCustomerTableTokens(db *gorm.DB) {
	var tables []entity.RestaurantTable
	if err := db.Where("customer_token = '' OR customer_token IS NULL").Find(&tables).Error; err != nil {
		return
	}
	for i := range tables {
		token := randomCustomerTableToken()
		if token == "" {
			continue
		}
		_ = db.Model(&tables[i]).Update("customer_token", token).Error
	}
}

func randomCustomerTableToken() string {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return ""
	}
	return hex.EncodeToString(bytes)
}

func migrateLegacyTableLayout(db *gorm.DB) {
	var tables []entity.RestaurantTable
	if err := db.Where("(display_label = '' OR display_label IS NULL) OR (zone_id IS NULL AND zone <> '')").Find(&tables).Error; err != nil {
		return
	}
	zoneCache := map[string]*entity.TableZone{}
	for i := range tables {
		table := &tables[i]
		if strings.TrimSpace(table.DisplayLabel) == "" {
			table.DisplayLabel = table.TableNumber
		}
		if strings.TrimSpace(table.TableNumber) == "" {
			table.TableNumber = table.DisplayLabel
		}
		if table.SequenceNumber == 0 {
			table.SequenceNumber = int(table.ID)
		}
		legacyZone := strings.TrimSpace(table.Zone)
		if table.ZoneID == nil && legacyZone != "" {
			key := fmt.Sprintf("%d:%s", table.RestaurantID, legacyZone)
			zone := zoneCache[key]
			if zone == nil {
				zone = findOrCreateLegacyTableZone(db, table.RestaurantID, legacyZone)
				zoneCache[key] = zone
			}
			if zone != nil {
				table.ZoneID = &zone.ID
			}
		}
		_ = db.Save(table).Error
	}
}

func findOrCreateLegacyTableZone(db *gorm.DB, restaurantID uint, name string) *entity.TableZone {
	var existing entity.TableZone
	if result := db.Where("restaurant_id = ? AND name = ?", restaurantID, name).Limit(1).Find(&existing); result.Error == nil && result.RowsAffected > 0 {
		return &existing
	}
	prefix := nextLegacyTableZonePrefix(db, restaurantID, name)
	zone := &entity.TableZone{
		RestaurantID: restaurantID,
		Name:         name,
		Prefix:       prefix,
		DisplayOrder: 0,
		IsActive:     true,
	}
	if err := db.Create(zone).Error; err != nil {
		return nil
	}
	return zone
}

func ensureTableZonePrefixIndex(db *gorm.DB) {
	if db.Migrator().HasIndex(&entity.TableZone{}, "idx_table_zones_restaurant_prefix") {
		_ = db.Migrator().DropIndex(&entity.TableZone{}, "idx_table_zones_restaurant_prefix")
	}
}

func nextLegacyTableZonePrefix(db *gorm.DB, restaurantID uint, name string) string {
	runes := []rune(strings.TrimSpace(name))
	prefix := "Z"
	if len(runes) > 0 {
		prefix = strings.ToUpper(string(runes[0]))
	}
	if !tableZonePrefixExists(db, restaurantID, prefix) {
		return prefix
	}
	for i := 2; i <= 99; i++ {
		candidate := fmt.Sprintf("%s%d", prefix, i)
		if !tableZonePrefixExists(db, restaurantID, candidate) {
			return candidate
		}
	}
	return fmt.Sprintf("Z%d", restaurantID)
}

func tableZonePrefixExists(db *gorm.DB, restaurantID uint, prefix string) bool {
	var count int64
	_ = db.Model(&entity.TableZone{}).Where("restaurant_id = ? AND prefix = ?", restaurantID, prefix).Count(&count).Error
	return count > 0
}

func ensureOrderNumberIndex(db *gorm.DB) {
	if db.Migrator().HasIndex(&entity.Order{}, "idx_orders_restaurant_day_number") {
		_ = db.Migrator().DropIndex(&entity.Order{}, "idx_orders_restaurant_day_number")
	}
	_ = db.Migrator().CreateIndex(&entity.Order{}, "idx_orders_restaurant_day_number")
}

func ensureOrderTakeawayColumns(db *gorm.DB) {
	if db.Migrator().HasTable(&entity.Order{}) && db.Migrator().HasColumn(&entity.Order{}, "table_id") {
		_ = db.Exec("ALTER TABLE orders ALTER COLUMN table_id DROP NOT NULL").Error
	}
	_ = db.Model(&entity.Order{}).
		Where("order_type = '' OR order_type IS NULL").
		Update("order_type", entity.OrderTypeDineIn).Error
}

func ensureOrderItemFulfillmentColumns(db *gorm.DB) {
	if !db.Migrator().HasTable(&entity.OrderItem{}) || !db.Migrator().HasColumn(&entity.OrderItem{}, "fulfillment_type") {
		return
	}
	_ = db.Exec(`
		UPDATE order_items
		SET fulfillment_type = COALESCE(NULLIF(orders.order_type, ''), ?)
		FROM orders
		WHERE order_items.order_id = orders.id
			AND (order_items.fulfillment_type = '' OR order_items.fulfillment_type IS NULL)
	`, entity.OrderItemFulfillmentDineIn).Error
}
