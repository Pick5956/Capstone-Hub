package config

import (
	"Project-M/config/seed"
	"Project-M/internal/entity"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var db *gorm.DB

func DB() *gorm.DB {
	return db
}

func ConnectionDB() {
	if os.Getenv("GIN_MODE") != "releasw" {
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
		&entity.RestaurantTable{},
	)

	seed.SeedRoles(db)

	return db
}
