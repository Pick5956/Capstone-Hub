package repository

import (
	"errors"
	"testing"

	"gorm.io/gorm"
)

func TestFindMenuItemsByExactNameScopesAIActionTargetToRestaurant(t *testing.T) {
	db, capture := dryRunAIConversationRepositoryDB(t)
	repo := NewMenuRepository(db)
	_, err := repo.FindMenuItemsByExactName(7, " Pad Thai ", 2)
	if err != nil && !errors.Is(err, gorm.ErrDryRunModeUnsupported) {
		t.Fatalf("FindMenuItemsByExactName() error = %v", err)
	}
	requireAIActionSQLFragments(t, capture.statements,
		"menu_items", "restaurant_id", "lower(trim(name))", "limit",
	)
}
