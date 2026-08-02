// Command resetdb wipes the development database.
//
// Two modes:
//
//	--mode=full  DROP the public schema and re-run migrations + role seeds.
//	             Result: a brand-new empty database exactly like a fresh app
//	             start. You must re-create the restaurant ("ซีพีอี") and its
//	             menu afterwards.
//
//	--mode=data  TRUNCATE the operational tables (orders, reservations and their
//	             children) and free every table. Keeps users, restaurants,
//	             members, menus, ingredients, tables and zones. Ingredient stock
//	             already deducted by past orders is NOT restored — use --mode=full
//	             for a truly clean slate.
//
// It refuses to run without --yes and refuses databases whose name looks like
// production. Stop the backend before running --mode=full.
//
// Usage (from the backend/ directory, which holds .env):
//
//	go run ./cmd/resetdb --mode=data --yes
//	go run ./cmd/resetdb --mode=full --yes
package main

import (
	"flag"
	"fmt"
	"log"
	"strings"

	"Project-M/config"

	"gorm.io/gorm"
)

// operationalTables are the GORM default table names for order/reservation
// data. Truncated in dependency-safe order; CASCADE covers any FK edges.
// (No entity overrides TableName, so these track the struct names directly.)
var operationalTables = []string{
	"order_item_options",
	"order_item_recipe_snapshots",
	"order_inventory_deductions",
	"order_payments",
	"order_status_logs",
	"order_items",
	"orders",
	"customer_order_submissions",
	"reservations",
}

func main() {
	mode := flag.String("mode", "", "reset mode: full | data")
	yes := flag.Bool("yes", false, "confirm the destructive reset")
	flag.Parse()

	if *mode != "full" && *mode != "data" {
		log.Fatal("usage: go run ./cmd/resetdb --mode=full|data --yes")
	}

	if err := config.LoadRuntimeEnvironment(); err != nil {
		// The shell may already export DB_* variables; let ConnectionDB validate.
		log.Printf("warning: %v (continuing with the current environment)", err)
	}
	if err := config.ConnectionDB(); err != nil {
		log.Fatalf("connect database: %v", err)
	}
	db := config.DB()

	var dbName string
	if err := db.Raw("SELECT current_database()").Scan(&dbName).Error; err != nil {
		log.Fatalf("read database name: %v", err)
	}
	fmt.Printf("Target database: %q  (mode=%s)\n", dbName, *mode)

	if strings.Contains(strings.ToLower(dbName), "prod") {
		log.Fatalf("refusing: database name %q looks like production", dbName)
	}
	if !*yes {
		log.Fatal("refusing to run without --yes — this permanently deletes data")
	}

	var err error
	switch *mode {
	case "full":
		err = resetFull(db)
	case "data":
		err = resetData(db)
	}
	if err != nil {
		log.Fatalf("%s reset failed: %v", *mode, err)
	}
	fmt.Printf("Done. Database %q reset (mode=%s).\n", dbName, *mode)
	if *mode == "full" {
		fmt.Println("Restart the backend, then sign in and re-create the restaurant.")
	}
}

// resetFull drops and recreates the public schema, then replays the migration
// plan (schema + system-role seeds) — identical to a first-ever app start.
func resetFull(db *gorm.DB) error {
	if err := db.Exec("DROP SCHEMA public CASCADE").Error; err != nil {
		return fmt.Errorf("drop schema: %w", err)
	}
	if err := db.Exec("CREATE SCHEMA public").Error; err != nil {
		return fmt.Errorf("create schema: %w", err)
	}
	if err := config.RunMigrations(db); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}

// resetData clears operational order/reservation rows and frees every table,
// leaving the restaurant setup (menu, ingredients, tables, members) intact.
func resetData(db *gorm.DB) error {
	quoted := make([]string, len(operationalTables))
	for i, name := range operationalTables {
		quoted[i] = `"` + name + `"`
	}
	truncate := fmt.Sprintf(
		"TRUNCATE TABLE %s RESTART IDENTITY CASCADE",
		strings.Join(quoted, ", "),
	)
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(truncate).Error; err != nil {
			return fmt.Errorf("truncate operational tables: %w", err)
		}
		if err := tx.Exec(
			`UPDATE "restaurant_tables" SET status = 'free', reservation_name = '', reservation_phone = ''`,
		).Error; err != nil {
			return fmt.Errorf("free tables: %w", err)
		}
		return nil
	})
}
