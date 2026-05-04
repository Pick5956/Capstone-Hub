package seed

import (
	"Project-M/internal/entity"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SeedRoles inserts the default restaurant roles + permissions if the table is empty.
// Permissions are stored as a JSON array of permission keys.
func SeedRoles(db *gorm.DB) {
	roles := []entity.Role{
		{Name: "owner", Permissions: `["*"]`},
		{Name: "manager", Permissions: `["view_dashboard","manage_menu","manage_table","manage_staff","manage_inventory","view_reports","manage_promotion","take_payment","view_orders","view_kitchen","update_order_status"]`},
		{Name: "cashier", Permissions: `["view_dashboard","take_payment","view_orders","view_tables"]`},
		{Name: "waiter", Permissions: `["view_dashboard","take_order","manage_table","view_menu","view_orders"]`},
		{Name: "chef", Permissions: `["view_kitchen","update_order_status","view_menu","view_inventory"]`},
	}
	for i := range roles {
		db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "name"}},
			DoUpdates: clause.AssignmentColumns([]string{"permissions", "updated_at"}),
		}).Create(&roles[i])
	}
	fmt.Println("Seeded default roles: owner, manager, cashier, waiter, chef")
}
