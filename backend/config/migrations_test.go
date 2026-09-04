package config

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"reflect"
	"testing"

	"Project-M/internal/entity"
)

func TestSchemaMigrationPlanIsOrderedAndMatchesCurrentVersion(t *testing.T) {
	plan := schemaMigrationPlan()
	if len(plan) == 0 {
		t.Fatal("schema migration plan is empty")
	}
	if err := validateMigrationPlan(plan); err != nil {
		t.Fatalf("validateMigrationPlan() error = %v", err)
	}
	if got := plan[len(plan)-1].Version; got != CurrentSchemaVersion {
		t.Fatalf("latest migration = %d, CurrentSchemaVersion = %d", got, CurrentSchemaVersion)
	}
}

func TestValidateMigrationPlanRejectsDuplicateOrOutOfOrderVersions(t *testing.T) {
	noop := func(*MigrationContext) error { return nil }
	tests := []struct {
		name string
		plan []SchemaMigration
	}{
		{
			name: "duplicate",
			plan: []SchemaMigration{
				{Version: 1, Name: "one", Up: noop},
				{Version: 1, Name: "duplicate", Up: noop},
			},
		},
		{
			name: "gap",
			plan: []SchemaMigration{
				{Version: 1, Name: "one", Up: noop},
				{Version: 3, Name: "three", Up: noop},
			},
		},
		{
			name: "missing function",
			plan: []SchemaMigration{
				{Version: 1, Name: "one"},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateMigrationPlan(test.plan); err == nil {
				t.Fatal("validateMigrationPlan() unexpectedly succeeded")
			}
		})
	}
}

func TestSchemaModelRegistryFingerprintMatchesVersion(t *testing.T) {
	// Add a new expected fingerprint only alongside a new numbered migration.
	// A mismatch at the same version means a model or GORM constraint changed
	// without a migration.
	expectedByVersion := map[int64]string{
		3: "93f62e8ae2c047002f2e9ce2aa18393e5fd69451c9f99cdebb897da0a27794d9",
		4: "54e77aad004fbfea627460ce1142c09f4135346a7bf045887d8f85f032b689d9",
		5: "e2eeb8569b40e91640b95e366422330bdbc8da7c0a779f319fd58a548dd993a0",
		6: "33ff3e4d49f8621dfb806c3cab572de8692e248f2dfe83be032fae0cb0da3835",
		7: "6ef6936c4f2e182a3e37a64d9addcfc9b4a80869cc546d324666041e826cc343",
		// Versions 8 and 9 are the AI migrations. They register their tables
		// inside the migration itself, so the frozen baseline registry — and
		// therefore its fingerprint — is unchanged from version 7.
		8:  "6ef6936c4f2e182a3e37a64d9addcfc9b4a80869cc546d324666041e826cc343",
		9:  "6ef6936c4f2e182a3e37a64d9addcfc9b4a80869cc546d324666041e826cc343",
		10: "6ef6936c4f2e182a3e37a64d9addcfc9b4a80869cc546d324666041e826cc343",
		11: "ff8fe0c5b93334a83a0d0595008a4dbab6c27986148edff3dfb6dd4445395b0f",
		// Version 12 (AI operating calendar) registers its table inside the
		// migration and touches no baseline model, so the frozen registry
		// fingerprint is unchanged from version 11.
		12: "ff8fe0c5b93334a83a0d0595008a4dbab6c27986148edff3dfb6dd4445395b0f",
		// Version 13 rebuilt idx_orders_restaurant_day_number_v2 as a partial unique
		// index, which changed the Order model's gorm index tag — so the registry
		// fingerprint advances here.
		13: "fdad3196f5a6414532f5d5aa0236e815d0ec8970e1c69412c0cb000797fa0235",
		// Version 14 reseeds the waiter role (data only). The menu availability read
		// model also added a computed gorm:"-" field to MenuItem (no DB change); the
		// fingerprint reflects the current models.
		14: "fdad3196f5a6414532f5d5aa0236e815d0ec8970e1c69412c0cb000797fa0235",
		// Version 15 adds Restaurant.AIActionsEnabled — the owner's toggle for the
		// assistant's write actions — so the registry fingerprint advances.
		15: "567155fe0788640f0e6c032c2a2ed8723e7adfe43eee6f782614711d43d650c4",
		// Version 16 adds the multi-item action plan tables (AIActionPlan +
		// AIActionPlanItem) inside the migration itself, following the same rule as
		// the earlier AI tables: the frozen baseline registry stays untouched, so
		// the fingerprint is unchanged from version 15.
		16: "567155fe0788640f0e6c032c2a2ed8723e7adfe43eee6f782614711d43d650c4",
		// Version 17 only widens a CHECK constraint on an AI-owned table, so the
		// frozen baseline registry is unchanged again.
		17: "567155fe0788640f0e6c032c2a2ed8723e7adfe43eee6f782614711d43d650c4",
		// Version 18 widens the same CHECK constraint again (menu availability),
		// still on an AI-owned table outside the frozen registry.
		18: "567155fe0788640f0e6c032c2a2ed8723e7adfe43eee6f782614711d43d650c4",
		// Version 19 widens the same CHECK once more (recording an expense).
		19: "567155fe0788640f0e6c032c2a2ed8723e7adfe43eee6f782614711d43d650c4",
		// Version 20 adds latency_ms to AI conversation turns — how long the
		// owner waited for each answer — so the registry moves with it.
		20: "1d46fef8248ae39fbde5a15d9ef9a06d98bbddfaeb5203ecc990039372173453",
	}
	want, ok := expectedByVersion[CurrentSchemaVersion]
	if !ok {
		t.Fatalf(
			"schema version %d has no reviewed model fingerprint; add its migration and fingerprint together",
			CurrentSchemaVersion,
		)
	}
	if got := schemaModelRegistryFingerprint(SchemaModels()); got != want {
		t.Fatalf(
			"schema model registry changed without a reviewed migration: got %s, want %s for version %d",
			got,
			want,
			CurrentSchemaVersion,
		)
	}
}

func TestAIConversationMigrationIsAdditiveVersionEight(t *testing.T) {
	plan := schemaMigrationPlan()
	conversationMigration := plan[7]
	if conversationMigration.Version != 8 || conversationMigration.Name != "add_ai_conversation_state" {
		t.Fatalf("migration 8 = %d %q, want AI conversation migration", conversationMigration.Version, conversationMigration.Name)
	}
	if conversationMigration.Up == nil {
		t.Fatal("AI conversation migration has no up function")
	}

	// The migration-1 clean-reset registry is frozen. New models belong only in
	// the numbered migration so disabling the feature does not change the
	// baseline or require destructive table removal.
	for _, model := range SchemaModels() {
		typeName := reflect.TypeOf(model).Elem().Name()
		if typeName == "AIConversation" || typeName == "AIConversationTurn" {
			t.Fatalf("%s must not be added to the frozen SchemaModels baseline", typeName)
		}
	}
}

func TestAIActionPreviewMigrationIsAdditiveVersionNine(t *testing.T) {
	plan := schemaMigrationPlan()
	actionPreviewMigration := plan[8]
	if actionPreviewMigration.Version != 9 || actionPreviewMigration.Name != "add_ai_action_previews" {
		t.Fatalf("migration 9 = %d %q, want AI action preview migration", actionPreviewMigration.Version, actionPreviewMigration.Name)
	}
	if actionPreviewMigration.Up == nil {
		t.Fatal("AI action preview migration has no up function")
	}

	// The migration-1 registry must stay frozen. Version 9 is additive and its
	// safe rollback is disabling the feature while retaining the table. A
	// version-8 application is not a valid rollback after this ledger advances.
	for _, model := range SchemaModels() {
		typeName := reflect.TypeOf(model).Elem().Name()
		if typeName == "AIActionPreview" {
			t.Fatal("AIActionPreview must not be added to the frozen SchemaModels baseline")
		}
	}
	wantForeignKeys := []string{"Restaurant", "Owner", "Conversation", "Turn", "TargetMenuItem"}
	if !reflect.DeepEqual(aiActionPreviewForeignKeys, wantForeignKeys) {
		t.Fatalf("AI action preview foreign keys = %#v, want %#v", aiActionPreviewForeignKeys, wantForeignKeys)
	}
}

func TestGranularPermissionDefaultsAreReseededInVersionTen(t *testing.T) {
	plan := schemaMigrationPlan()
	permissionMigration := plan[9]
	if permissionMigration.Version != 10 || permissionMigration.Name != "reseed_granular_role_permissions" {
		t.Fatalf("migration 10 = %d %q, want granular permission reseed", permissionMigration.Version, permissionMigration.Name)
	}
	if permissionMigration.Up == nil {
		t.Fatal("granular permission migration has no up function")
	}
}

func TestRoleDisplayNameOverrideMigrationIsAdditiveVersionEleven(t *testing.T) {
	plan := schemaMigrationPlan()
	// v11 is no longer the latest (v12 AI calendar follows), so index it directly.
	displayNameMigration := plan[10]
	if displayNameMigration.Version != 11 || displayNameMigration.Name != "add_restaurant_role_display_name_overrides" {
		t.Fatalf("migration 11 = %d %q, want scoped role display names", displayNameMigration.Version, displayNameMigration.Name)
	}
	if displayNameMigration.Up == nil {
		t.Fatal("role display-name override migration has no up function")
	}
	for _, model := range SchemaModels() {
		if typeName := reflect.TypeOf(model).Elem().Name(); typeName == "RestaurantRoleDisplayNameOverride" {
			t.Fatal("RestaurantRoleDisplayNameOverride must not be added to frozen SchemaModels")
		}
	}
	wantForeignKeys := []string{"Restaurant", "Role"}
	if !reflect.DeepEqual(roleDisplayNameOverrideForeignKeys, wantForeignKeys) {
		t.Fatalf("role display-name override foreign keys = %#v, want %#v", roleDisplayNameOverrideForeignKeys, wantForeignKeys)
	}
}

func TestAIOperatingCalendarMigrationIsAdditiveVersionTwelve(t *testing.T) {
	plan := schemaMigrationPlan()
	// v12 is no longer the latest (v13/v14 follow), so index it directly.
	calendarMigration := plan[11]
	if calendarMigration.Version != 12 || calendarMigration.Name != "add_ai_operating_calendar" {
		t.Fatalf("migration 12 = %d %q, want version 12 AI operating calendar migration", calendarMigration.Version, calendarMigration.Name)
	}
	if calendarMigration.Up == nil {
		t.Fatal("AI operating calendar migration has no up function")
	}
	// The migration-1 registry stays frozen. The calendar table is registered
	// only in the numbered migration, so disabling the forecast leaves it unused.
	for _, model := range SchemaModels() {
		if reflect.TypeOf(model).Elem().Name() == "AIOperatingCalendarRule" {
			t.Fatal("AIOperatingCalendarRule must not be added to the frozen SchemaModels baseline")
		}
	}
}

func TestAdditiveMigrationModelFingerprintsStayFrozen(t *testing.T) {
	tests := []struct {
		name   string
		models []any
		want   string
	}{
		{
			name:   "version 8 conversations",
			models: []any{&entity.AIConversation{}, &entity.AIConversationTurn{}},
			want:   "f1f926bb1052ed0fad231a128cd78a46378d3c05d82284662fa3f5e56dc3f2a9", // refrozen at v20: latency_ms added to the turn row,
		},
		{
			name:   "version 9 action previews",
			models: []any{&entity.AIActionPreview{}},
			want:   "0287437f4aef0d4042319d049ad4877cbee7ee29e0b6636a3ea2cc5a87b4df94",
		},
		{
			name:   "version 11 role display-name overrides",
			models: []any{&entity.RestaurantRoleDisplayNameOverride{}},
			want:   "2978cb8604d30e130a39ccbeec9f6bd5b5138c4cde27497a9ac4afd435107f56",
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			got := schemaModelRegistryFingerprint(testCase.models)
			if got != testCase.want {
				t.Errorf("additive migration model changed without a new migration: got %s want %s", got, testCase.want)
			}
		})
	}
}

func schemaModelRegistryFingerprint(models []any) string {
	hash := sha256.New()
	for index, model := range models {
		modelType := reflect.TypeOf(model)
		for modelType.Kind() == reflect.Pointer {
			modelType = modelType.Elem()
		}
		_, _ = fmt.Fprintf(
			hash,
			"%d|%s.%s\n",
			index,
			modelType.PkgPath(),
			modelType.Name(),
		)
		for fieldIndex := 0; fieldIndex < modelType.NumField(); fieldIndex++ {
			field := modelType.Field(fieldIndex)
			_, _ = fmt.Fprintf(
				hash,
				"%s|%s|%t|%s\n",
				field.Name,
				field.Type.String(),
				field.Anonymous,
				field.Tag.Get("gorm"),
			)
		}
	}
	return hex.EncodeToString(hash.Sum(nil))
}
