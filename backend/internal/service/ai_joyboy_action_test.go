package service

import (
	"strings"
	"testing"

	"gorm.io/gorm"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
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

// Saying "โอเค" to a confirm card used to build a second identical card, because
// the model reads the thread as text and a card waiting on screen is not text.
func TestPlanAsksForTheSameThingMatchesOnWhatWouldBeWritten(t *testing.T) {
	pending := &entity.AIActionPlan{
		Summary: "ปรับสต๊อก “หมูสับ”",
		Items: []entity.AIActionPlanItem{
			{ActionType: "adjust_ingredient_stock", PayloadJSON: `{"ingredient_id":2,"delta":2000}`},
		},
	}
	same := []repository.CreateAIActionPlanItemParams{
		// A different sentence ("โอเค" carried forward through history) producing
		// the same write is exactly the case worth catching.
		{ActionType: "adjust_ingredient_stock", PayloadJSON: `{"ingredient_id":2,"delta":2000}`},
	}
	if !aiPlanAsksForTheSameThing(pending, same) {
		t.Errorf("the same write should be recognised as already pending")
	}

	different := []repository.CreateAIActionPlanItemParams{
		{ActionType: "adjust_ingredient_stock", PayloadJSON: `{"ingredient_id":2,"delta":5000}`},
	}
	if aiPlanAsksForTheSameThing(pending, different) {
		t.Errorf("a different amount is a different command and needs its own card")
	}

	extra := append(same, repository.CreateAIActionPlanItemParams{
		ActionType: "set_menu_availability", PayloadJSON: `{"menu_item_id":2,"is_available":false}`,
	})
	if aiPlanAsksForTheSameThing(pending, extra) {
		t.Errorf("a plan that adds a second change is not the pending one")
	}
	if aiPlanAsksForTheSameThing(nil, same) {
		t.Errorf("no pending plan cannot match")
	}
}

// "เพิ่มไข่ไก่ 30 ฟอง แล้วก็เพิ่มของอีกอย่างที่ใกล้หมดด้วย" used to drop the second
// half without a word, so the owner asked for two things and heard about one.
func TestResolveStockCommandQuotesWhatItCouldNotIdentify(t *testing.T) {
	resolution := ResolveStockCommand(nil, AIStockCommandDraft{
		Kind: "in", Note: "ของอีกอย่างที่ใกล้หมด",
	})
	if resolution.Kind != AICommandOutcomeAsk {
		t.Fatalf("outcome = %v, want a question back", resolution.Kind)
	}
	if !strings.Contains(resolution.Question, "ของอีกอย่างที่ใกล้หมด") {
		t.Errorf("the owner's own words should be quoted back: %q", resolution.Question)
	}
}

// With nothing to quote the question still has to be asked, just generically.
func TestResolveStockCommandStillAsksWithNoNote(t *testing.T) {
	resolution := ResolveStockCommand(nil, AIStockCommandDraft{Kind: "in"})
	if resolution.Kind != AICommandOutcomeAsk || resolution.Question == "" {
		t.Errorf("a nameless command must ask, got %v %q", resolution.Kind, resolution.Question)
	}
}

// The extractor sends a nameless entry when it can tell a command is there but
// not what it is about. Dropping it here is what made the second half of
// "เพิ่มไข่ไก่ 30 ฟอง แล้วก็เพิ่มของอีกอย่างที่ใกล้หมดด้วย" vanish silently.
func TestParseStockCommandDraftsKeepsANamelessEntryThatCarriesTheOwnersWords(t *testing.T) {
	drafts, err := ParseStockCommandDrafts(
		`[{"name":"ไข่ไก่","kind":"in","quantity":30,"unit":"ฟอง"},` +
			`{"name":"","kind":"in","quantity":0,"unit":"","note":"ของอีกอย่างที่ใกล้หมด"}]`)
	if err != nil {
		t.Fatalf("ParseStockCommandDrafts: %v", err)
	}
	if len(drafts) != 2 {
		t.Fatalf("kept %d draft(s), want both halves of the sentence: %+v", len(drafts), drafts)
	}
	if drafts[1].Note != "ของอีกอย่างที่ใกล้หมด" {
		t.Errorf("the owner's words should survive: %+v", drafts[1])
	}
}

// A nameless entry with nothing to say is still noise and stays dropped.
func TestParseStockCommandDraftsDropsAnEmptyEntry(t *testing.T) {
	drafts, err := ParseStockCommandDrafts(`[{"name":"","kind":"in","quantity":0,"unit":""}]`)
	if err != nil {
		t.Fatalf("ParseStockCommandDrafts: %v", err)
	}
	if len(drafts) != 0 {
		t.Errorf("an entry with no name and no words is nothing: %+v", drafts)
	}
}

// The acknowledgment line is what the next turn rebuilds the whole command from,
// so it has to carry the amount: "ไข่ไก่ — รับทราบแล้ว" left the model nothing to
// work with and the first half of the sentence was lost when the owner answered.
func TestCommandAsSaidKeepsTheAmountAndUnit(t *testing.T) {
	said := aiCommandAsSaid("ไข่ไก่", AIStockCommandDraft{Name: "ไข่ไก่", Quantity: 30, Unit: "ฟอง"})
	if said != "ไข่ไก่ 30 ฟอง" {
		t.Errorf("aiCommandAsSaid = %q, want the amount and unit as the owner said them", said)
	}
	// A menu command has no amount, and "ต้มยำกุ้ง 0" would be nonsense.
	if said := aiCommandAsSaid("ต้มยำกุ้งน้ำข้น", AIStockCommandDraft{Name: "ต้มยำกุ้งน้ำข้น"}); said != "ต้มยำกุ้งน้ำข้น" {
		t.Errorf("aiCommandAsSaid = %q, want the name alone", said)
	}
}
