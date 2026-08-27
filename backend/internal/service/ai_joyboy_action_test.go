package service

import (
	"testing"

	"gorm.io/gorm"

	"Project-M/internal/entity"
)

// Telling a command from a question is the model's judgement now — a word list
// could only ever cover the phrasings someone thought of, and it used to veto
// "ต้มยำกุ้งหมดแล้ว เอาลงก่อน" for containing none of them. What Go still owns is
// everything after that: which menu the name means, and whether the change is
// real. That is what this covers.
func TestResolveMenuCommand(t *testing.T) {
	menus := []entity.MenuItem{
		{Model: gorm.Model{ID: 1}, Name: "ต้มยำกุ้งน้ำข้น", IsAvailable: true},
		{Model: gorm.Model{ID: 2}, Name: "ต้มยำกุ้งน้ำใส", IsAvailable: true},
		{Model: gorm.Model{ID: 3}, Name: "ผัดไทย", IsAvailable: true},
		{Model: gorm.Model{ID: 4}, Name: "ชาไทยเย็น", IsAvailable: false},
	}

	t.Run("an exact name closes that menu", func(t *testing.T) {
		got := ResolveMenuCommand(menus, AIStockCommandDraft{Name: "ผัดไทย", Kind: "menu_off"})
		if got.Kind != AICommandOutcomeReady {
			t.Fatalf("outcome = %v (%s)", got.Kind, got.Question)
		}
		if got.Command.MenuItemID != 3 || got.Command.Available {
			t.Errorf("command = %+v, want menu 3 closed", got.Command)
		}
		if got.Title != "ผัดไทย" {
			t.Errorf("title = %q", got.Title)
		}
	})

	t.Run("a name matching two menus is asked about, never guessed", func(t *testing.T) {
		got := ResolveMenuCommand(menus, AIStockCommandDraft{Name: "ต้มยำกุ้ง", Kind: "menu_off"})
		if got.Kind != AICommandOutcomeAsk {
			t.Fatalf("outcome = %v, want ask", got.Kind)
		}
		if got.Command.MenuItemID != 0 {
			t.Error("an ambiguous name must not resolve to a menu")
		}
	})

	t.Run("a menu nobody has is asked about", func(t *testing.T) {
		got := ResolveMenuCommand(menus, AIStockCommandDraft{Name: "ข้าวมันไก่", Kind: "menu_off"})
		if got.Kind != AICommandOutcomeAsk {
			t.Fatalf("outcome = %v, want ask", got.Kind)
		}
	})

	t.Run("a partial name matching exactly one menu is taken, not asked about", func(t *testing.T) {
		// "ผัดไทยหมดแล้ว" against a shop selling "ผัดไทย" alone. Asking "which menu
		// did you mean — ผัดไทย" when that is the only answer is the assistant not
		// paying attention; the confirm bar still shows the full name.
		single := []entity.MenuItem{{Model: gorm.Model{ID: 9}, Name: "ผัดไทยกุ้งสด", IsAvailable: true}}
		got := ResolveMenuCommand(single, AIStockCommandDraft{Name: "ผัดไทย", Kind: "menu_off"})
		if got.Kind != AICommandOutcomeReady {
			t.Fatalf("outcome = %v (%s), want ready", got.Kind, got.Question)
		}
		if got.Command.MenuItemID != 9 {
			t.Errorf("resolved to %d, want 9", got.Command.MenuItemID)
		}
		if got.Title != "ผัดไทยกุ้งสด" {
			t.Errorf("title = %q, want the menu's real name", got.Title)
		}
	})

	t.Run("closing a menu that is already closed changes nothing", func(t *testing.T) {
		got := ResolveMenuCommand(menus, AIStockCommandDraft{Name: "ชาไทยเย็น", Kind: "menu_off"})
		if got.Kind != AICommandOutcomeNothingToDo {
			t.Fatalf("outcome = %v, want nothing_to_do", got.Kind)
		}
		if got.Question == "" {
			t.Error("the owner must be told why nothing happened")
		}
	})

	t.Run("reopening a closed menu is a real change", func(t *testing.T) {
		got := ResolveMenuCommand(menus, AIStockCommandDraft{Name: "ชาไทยเย็น", Kind: "menu_on"})
		if got.Kind != AICommandOutcomeReady {
			t.Fatalf("outcome = %v (%s)", got.Kind, got.Question)
		}
		if got.Command.MenuItemID != 4 || !got.Command.Available {
			t.Errorf("command = %+v, want menu 4 opened", got.Command)
		}
	})

	t.Run("a nameless or directionless command asks", func(t *testing.T) {
		if got := ResolveMenuCommand(menus, AIStockCommandDraft{Kind: "menu_off"}); got.Kind != AICommandOutcomeAsk {
			t.Errorf("no name: outcome = %v", got.Kind)
		}
		if got := ResolveMenuCommand(menus, AIStockCommandDraft{Name: "ผัดไทย", Kind: "wat"}); got.Kind != AICommandOutcomeAsk {
			t.Errorf("unknown kind: outcome = %v", got.Kind)
		}
	})
}

// The shelf and the menu share one matching rule, so a partial name behaves the
// same way in both catalogues.
func TestResolveMenuNamePrefersTheShortestNearMatch(t *testing.T) {
	menus := []entity.MenuItem{
		{Model: gorm.Model{ID: 1}, Name: "ข้าวผัดกุ้งใส่ไข่ดาว"},
		{Model: gorm.Model{ID: 2}, Name: "ข้าวผัด"},
	}
	match := ResolveMenuName(menus, "ข้าวผัด")
	if match.Exact == nil || match.Exact.ID != 2 {
		t.Fatalf("an exact name must win over a longer one containing it: %+v", match)
	}
}
