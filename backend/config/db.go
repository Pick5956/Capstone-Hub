package config

import (
	"Project-M/config/seed"
	"Project-M/internal/entity"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
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

	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})

	if err != nil {
		panic(fmt.Sprintf("failed to connect database: %v", err))
	}
	fmt.Println("Connect database")
	db = database
}

const ginReleaseMode = "release"

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

	db.AutoMigrate(
		&entity.Role{},
		&entity.User{},
		&entity.Restaurant{},
		&entity.RestaurantMember{},
		&entity.Invitation{},
		&entity.RestaurantAuditLog{},
		&entity.Category{},
		&entity.MenuItem{},
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
	)
	migrateLegacyTableLayout(db)
	ensureOrderNumberIndex(db)

	seed.SeedRoles(db)

	return db
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
	if err := db.Where("restaurant_id = ? AND name = ?", restaurantID, name).First(&existing).Error; err == nil {
		return &existing
	}
	prefix := strings.ToUpper(string([]rune(name)[0]))
	if prefix == "" {
		prefix = "Z"
	}
	if tableZonePrefixExists(db, restaurantID, prefix) {
		prefix = ""
	}
	zone := &entity.TableZone{
		RestaurantID: restaurantID,
		Name:         name,
		Prefix:       prefix,
		DisplayOrder: 0,
		IsActive:     true,
	}
	if err := db.Create(zone).Error; err != nil {
		zone.Prefix = ""
		if err := db.Create(zone).Error; err != nil {
			return nil
		}
	}
	return zone
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
