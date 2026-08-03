package config

import (
	"context"
	"errors"
	"fmt"
	"time"

	"Project-M/config/seed"
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

const (
	CurrentSchemaVersion int64 = 7
	migrationAdvisoryKey int64 = 0x524855424d494752
)

type MigrationContext struct {
	DB *gorm.DB
}

type SchemaMigration struct {
	Version int64
	Name    string
	Up      func(*MigrationContext) error
}

type schemaMigrationRecord struct {
	Version   int64     `gorm:"primaryKey;autoIncrement:false"`
	Name      string    `gorm:"size:160;not null;uniqueIndex"`
	AppliedAt time.Time `gorm:"not null"`
}

func (schemaMigrationRecord) TableName() string {
	return "schema_migrations"
}

func schemaMigrationPlan() []SchemaMigration {
	return []SchemaMigration{
		{
			Version: 1,
			Name:    "create_current_schema",
			Up: func(ctx *MigrationContext) error {
				// SchemaModels is the clean-reset baseline for the first
				// versioned release. Once that baseline ships, it must be
				// frozen and later schema changes must use a new migration.
				if err := ctx.DB.AutoMigrate(SchemaModels()...); err != nil {
					return fmt.Errorf("auto migrate current schema: %w", err)
				}
				return nil
			},
		},
		{
			Version: 2,
			Name:    "seed_system_roles",
			Up: func(ctx *MigrationContext) error {
				if err := seed.SeedRoles(ctx.DB); err != nil {
					return fmt.Errorf("seed system roles: %w", err)
				}
				return nil
			},
		},
		{
			Version: 3,
			Name:    "harden_operational_schema",
			Up: func(ctx *MigrationContext) error {
				models := []any{
					&entity.User{},
					&entity.RestaurantRolePermissionOverride{},
					&entity.RestaurantMember{},
					&entity.Invitation{},
					&entity.IngredientCategory{},
					&entity.Ingredient{},
					&entity.IngredientTransaction{},
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
					&entity.OrderPayment{},
					&entity.OrderItemRecipeSnapshot{},
					&entity.OrderInventoryDeduction{},
					&entity.CustomerOrderSubmission{},
				}
				if err := ctx.DB.AutoMigrate(models...); err != nil {
					return fmt.Errorf("migrate hardened operational models: %w", err)
				}
				if err := createOrderSearchIndexes(ctx.DB); err != nil {
					return err
				}
				return nil
			},
		},
		{
			Version: 4,
			Name:    "add_restaurant_order_geofence",
			Up: func(ctx *MigrationContext) error {
				// Adds latitude/longitude/order_radius_meters used to keep QR
				// table orders from being sent outside the restaurant.
				if err := ctx.DB.AutoMigrate(&entity.Restaurant{}); err != nil {
					return fmt.Errorf("migrate restaurant order geofence: %w", err)
				}
				return nil
			},
		},
		{
			Version: 5,
			Name:    "add_reservations",
			Up: func(ctx *MigrationContext) error {
				// Reservation history: track table bookings and their outcome
				// (seated / cancelled / no-show) separately from the order archive.
				if err := ctx.DB.AutoMigrate(&entity.Reservation{}); err != nil {
					return fmt.Errorf("migrate reservations: %w", err)
				}
				return nil
			},
		},
		{
			Version: 6,
			Name:    "add_ai_conversation_state",
			Up: func(ctx *MigrationContext) error {
				// Additive-only persistence for compact AI conversation state and
				// bounded turn history. Feature rollback leaves these unused tables in
				// place instead of destructively dropping user history. A schema-v5
				// binary is still rejected by the existing schema-ledger policy.
				models := []any{
					&entity.AIConversation{},
					&entity.AIConversationTurn{},
				}
				if err := ctx.DB.AutoMigrate(models...); err != nil {
					return fmt.Errorf("migrate AI conversation state: %w", err)
				}
				return nil
			},
		},
		{
			Version: 7,
			Name:    "add_ai_action_previews",
			Up: func(ctx *MigrationContext) error {
				// Additive-only persistence for short-lived, owner-confirmed AI
				// actions. Disabling AI actions leaves this table unused and is the
				// supported application rollback. Once version 7 is recorded, the
				// schema ledger intentionally rejects an older version-6 binary.
				if err := migrateAIActionPreviews(ctx.DB); err != nil {
					return fmt.Errorf("migrate AI action previews: %w", err)
				}
				return nil
			},
		},
	}
}

var aiActionPreviewForeignKeys = []string{"Restaurant", "Owner", "Conversation", "Turn", "TargetMenuItem"}

func migrateAIActionPreviews(database *gorm.DB) error {
	// AutoMigrate normally walks relationship dependencies and can migrate the
	// referenced restaurant, user, conversation, turn, and menu tables too. Keep
	// version 7 truly additive by creating/updating only the preview table, then
	// add its reviewed foreign keys explicitly.
	migrationDB := database.Session(&gorm.Session{NewDB: true})
	configCopy := *migrationDB.Config
	configCopy.IgnoreRelationshipsWhenMigrating = true
	migrationDB.Config = &configCopy
	if err := migrationDB.AutoMigrate(&entity.AIActionPreview{}); err != nil {
		return err
	}
	for _, relationship := range aiActionPreviewForeignKeys {
		if database.Migrator().HasConstraint(&entity.AIActionPreview{}, relationship) {
			continue
		}
		if err := database.Migrator().CreateConstraint(&entity.AIActionPreview{}, relationship); err != nil {
			return fmt.Errorf("create AI action preview %s constraint: %w", relationship, err)
		}
	}
	return nil
}

func createOrderSearchIndexes(database *gorm.DB) error {
	statements := []string{
		"CREATE EXTENSION IF NOT EXISTS pg_trgm",
		"CREATE INDEX IF NOT EXISTS idx_orders_number_trgm ON orders USING gin (lower(order_number) gin_trgm_ops) WHERE deleted_at IS NULL",
		"CREATE INDEX IF NOT EXISTS idx_orders_customer_name_trgm ON orders USING gin (lower(COALESCE(customer_name, '')) gin_trgm_ops) WHERE deleted_at IS NULL",
		"CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_trgm ON orders USING gin (lower(COALESCE(customer_phone, '')) gin_trgm_ops) WHERE deleted_at IS NULL",
		"CREATE INDEX IF NOT EXISTS idx_restaurant_tables_number_trgm ON restaurant_tables USING gin (lower(COALESCE(table_number, '')) gin_trgm_ops) WHERE deleted_at IS NULL",
		"CREATE INDEX IF NOT EXISTS idx_restaurant_tables_label_trgm ON restaurant_tables USING gin (lower(COALESCE(display_label, '')) gin_trgm_ops) WHERE deleted_at IS NULL",
		"CREATE INDEX IF NOT EXISTS idx_restaurant_tables_zone_trgm ON restaurant_tables USING gin (lower(COALESCE(zone, '')) gin_trgm_ops) WHERE deleted_at IS NULL",
		"CREATE INDEX IF NOT EXISTS idx_table_zones_name_trgm ON table_zones USING gin (lower(COALESCE(name, '')) gin_trgm_ops) WHERE deleted_at IS NULL",
	}
	for _, statement := range statements {
		if err := database.Exec(statement).Error; err != nil {
			return fmt.Errorf("create order search index: %w", err)
		}
	}
	return nil
}

func validateMigrationPlan(plan []SchemaMigration) error {
	if len(plan) == 0 {
		return errors.New("migration plan is empty")
	}
	for index, migration := range plan {
		expectedVersion := int64(index + 1)
		if migration.Version != expectedVersion {
			return fmt.Errorf("migration version %d must be %d", migration.Version, expectedVersion)
		}
		if migration.Name == "" {
			return fmt.Errorf("migration %d has no name", migration.Version)
		}
		if migration.Up == nil {
			return fmt.Errorf("migration %d has no up function", migration.Version)
		}
	}
	return nil
}

func RunMigrations(database *gorm.DB) error {
	if database == nil {
		return errors.New("database is not connected")
	}
	plan := schemaMigrationPlan()
	if err := validateMigrationPlan(plan); err != nil {
		return err
	}
	if plan[len(plan)-1].Version != CurrentSchemaVersion {
		return fmt.Errorf(
			"migration plan ends at version %d, expected %d",
			plan[len(plan)-1].Version,
			CurrentSchemaVersion,
		)
	}

	// The transaction-level lock is safe through PgBouncer transaction pooling:
	// PgBouncer pins one PostgreSQL connection for this entire transaction and
	// PostgreSQL releases the lock automatically on commit or rollback.
	return database.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", migrationAdvisoryKey).Error; err != nil {
			return fmt.Errorf("acquire migration advisory lock: %w", err)
		}
		if err := tx.AutoMigrate(&schemaMigrationRecord{}); err != nil {
			return fmt.Errorf("create schema migration ledger: %w", err)
		}

		var applied []schemaMigrationRecord
		if err := tx.Order("version asc").Find(&applied).Error; err != nil {
			return fmt.Errorf("read applied migrations: %w", err)
		}
		appliedByVersion := make(map[int64]schemaMigrationRecord, len(applied))
		for _, record := range applied {
			if record.Version > CurrentSchemaVersion {
				return fmt.Errorf(
					"database schema version %d is newer than supported version %d",
					record.Version,
					CurrentSchemaVersion,
				)
			}
			appliedByVersion[record.Version] = record
		}

		for _, migration := range plan {
			if record, ok := appliedByVersion[migration.Version]; ok {
				if record.Name != migration.Name {
					return fmt.Errorf(
						"migration %d name changed from %q to %q",
						migration.Version,
						record.Name,
						migration.Name,
					)
				}
				continue
			}

			if err := migration.Up(&MigrationContext{DB: tx}); err != nil {
				return fmt.Errorf("apply migration %d (%s): %w", migration.Version, migration.Name, err)
			}
			record := schemaMigrationRecord{
				Version:   migration.Version,
				Name:      migration.Name,
				AppliedAt: time.Now().UTC(),
			}
			if err := tx.Create(&record).Error; err != nil {
				return fmt.Errorf("record migration %d: %w", migration.Version, err)
			}
		}
		return nil
	})
}

func EnsureSchemaCurrent(database *gorm.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return ensureSchemaCurrent(ctx, database)
}

func ensureSchemaCurrent(ctx context.Context, database *gorm.DB) error {
	if database == nil {
		return errors.New("database is not connected")
	}
	plan := schemaMigrationPlan()
	if err := validateMigrationPlan(plan); err != nil {
		return err
	}
	if plan[len(plan)-1].Version != CurrentSchemaVersion {
		return fmt.Errorf(
			"migration plan ends at version %d, expected %d",
			plan[len(plan)-1].Version,
			CurrentSchemaVersion,
		)
	}

	database = database.WithContext(ctx)
	var ledgerExists bool
	if err := database.Raw(
		"SELECT to_regclass('public.schema_migrations') IS NOT NULL",
	).Scan(&ledgerExists).Error; err != nil {
		return fmt.Errorf("check database schema ledger: %w", err)
	}
	if !ledgerExists {
		return errors.New("database schema is not initialized; run the migration command")
	}

	var applied []schemaMigrationRecord
	if err := database.Order("version asc").Find(&applied).Error; err != nil {
		return fmt.Errorf("read database schema migrations: %w", err)
	}
	if len(applied) != len(plan) {
		return fmt.Errorf(
			"database has %d applied schema migrations; application requires %d",
			len(applied),
			len(plan),
		)
	}
	for index, migration := range plan {
		record := applied[index]
		if record.Version != migration.Version || record.Name != migration.Name {
			return fmt.Errorf(
				"database migration ledger mismatch at version %d; run the migration command",
				migration.Version,
			)
		}
	}
	return nil
}

func CheckDatabaseReadiness(ctx context.Context) error {
	if err := PingDatabase(ctx); err != nil {
		return err
	}
	return ensureSchemaCurrent(ctx, DB())
}
