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
		{Name: "owner", DisplayName: "Owner", Permissions: `["*"]`, IsSystem: true},
		{Name: "manager", DisplayName: "Manager", Permissions: `["view_dashboard","manage_menu","manage_table","manage_staff","manage_inventory","view_reports","take_payment","view_orders","view_kitchen","update_order_status"]`, IsSystem: true},
		{Name: "cashier", DisplayName: "Cashier", Permissions: `["view_dashboard","take_payment","view_orders","view_tables"]`, IsSystem: true},
		{Name: "waiter", DisplayName: "Waiter", Permissions: `["view_dashboard","take_order","take_payment","view_tables","view_orders"]`, IsSystem: true},
		{Name: "chef", DisplayName: "Chef", Permissions: `["view_kitchen","update_order_status","view_inventory"]`, IsSystem: true},
	}
	for i := range roles {
		db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "name"}},
			DoUpdates: clause.AssignmentColumns([]string{"display_name", "permissions", "is_system", "updated_at"}),
		}).Create(&roles[i])
	}
	fmt.Println("Seeded default roles: owner, manager, cashier, waiter, chef")
}
