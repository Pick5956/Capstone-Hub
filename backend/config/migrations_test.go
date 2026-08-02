package config

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"reflect"
	"testing"
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
		6: "e2eeb8569b40e91640b95e366422330bdbc8da7c0a779f319fd58a548dd993a0",
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

func TestAIConversationMigrationIsAdditiveVersionSix(t *testing.T) {
	plan := schemaMigrationPlan()
	latest := plan[len(plan)-1]
	if latest.Version != 6 || latest.Name != "add_ai_conversation_state" {
		t.Fatalf("latest migration = %d %q, want version 6 AI conversation migration", latest.Version, latest.Name)
	}
	if latest.Up == nil {
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
