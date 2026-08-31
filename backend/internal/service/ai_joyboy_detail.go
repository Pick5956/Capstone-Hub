package service

import (
	"fmt"
	"sort"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

// Looking one named thing up.
//
// Every other tool here ranks or totals: best sellers, low stock, revenue by
// period. None of them answers "how much หมูสับ is left" or "how many ผัดไทย did
// we sell", which is what an owner asks most often — and the shape of question
// the assistant handled worst. Asked for a menu outside the top five it reported
// the menu had no sales at all; asked which menus use a given ingredient it
// invented "กะเพราไก่" for a shop whose menu is called "ข้าวกะเพราไก่ไข่ดาว".
// Both failures come from the same place: no tool could look a name up, so the
// model filled the gap from a ranked list or from the name itself.
//
// Tools take no arguments in this design — the model picks a name, not a call
// signature — so the subject is resolved here, from the question text against
// the shop's own rows. That keeps the split intact: the model decided this
// question is about one item; Go decides which item and what is true of it.

// aiFindNamedRows returns the indexes of rows whose name appears in the question,
// longest name first so "ต้มยำกุ้งน้ำข้น" wins over a shorter "ต้มยำกุ้ง" that is
// contained in it. Matching is on the shop's real names, never on a word list.
// aiFindNamedRowsInThread resolves a name the question points at without spelling
// out: "เมนูแรกที่บอกไป กำไรดีไหม" one turn after the assistant said the best
// seller was ชาไทยเย็น. The selection round now picks get_menu_detail for those,
// but the detail tool matched against the sentence alone, found no menu in it,
// and reported "ไม่พบข้อมูล" over a shop whose margin was one lookup away.
//
// The question always wins: a name written in this turn is what the owner is
// asking about. Only when the sentence names nothing does the thread get read,
// newest turn first, so "อันนั้น" resolves to the thing most recently discussed
// rather than something from five turns ago.
func aiFindNamedRowsInThread(names []string, question string, history []AIConversationMessage) []int {
	if found := aiFindNamedRows(names, question); len(found) > 0 {
		return found
	}
	for i := len(history) - 1; i >= 0; i-- {
		if found := aiFindNamedRows(names, history[i].Content); len(found) > 0 {
			return found
		}
	}
	return nil
}

func aiFindNamedRows(names []string, question string) []int {
	haystack := aiNormalizeName(question)
	if haystack == "" {
		return nil
	}
	type hit struct {
		index  int
		length int
	}
	hits := make([]hit, 0, 4)
	for index, name := range names {
		needle := aiNormalizeName(name)
		if needle == "" {
			continue
		}
		if strings.Contains(haystack, needle) {
			hits = append(hits, hit{index: index, length: len([]rune(needle))})
		}
	}
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].length > hits[j].length })

	// Drop a shorter name that is contained in an already-accepted longer one:
	// "ต้มยำกุ้งน้ำข้น" in the question also contains "ต้มยำกุ้ง", and reporting
	// both would read as two separate menus.
	kept := make([]int, 0, len(hits))
	taken := make([]string, 0, len(hits))
	for _, h := range hits {
		candidate := aiNormalizeName(names[h.index])
		swallowed := false
		for _, longer := range taken {
			if strings.Contains(longer, candidate) {
				swallowed = true
				break
			}
		}
		if swallowed {
			continue
		}
		taken = append(taken, candidate)
		kept = append(kept, h.index)
		if len(kept) == 3 {
			break
		}
	}
	return kept
}

// joyboyIngredientDetailBody reports everything known about the ingredients named
// in the question, including which menus consume them — the recipe link no other
// tool exposes.
func joyboyIngredientDetailBody(shelf []entity.Ingredient, menus []entity.MenuItem, question string, history []AIConversationMessage) string {
	if len(shelf) == 0 {
		return joyboyNoData("no_ingredients_recorded")
	}
	names := make([]string, len(shelf))
	for index, item := range shelf {
		names[index] = item.Name
	}
	found := aiFindNamedRowsInThread(names, question, history)
	if len(found) == 0 {
		// Naming what the shop actually stocks turns a dead end into a question the
		// owner can answer in one word.
		sample := make([]string, 0, 8)
		for _, item := range shelf {
			sample = append(sample, item.Name)
			if len(sample) == 8 {
				break
			}
		}
		return joyboyJoin([]string{
			joyboyNoData("no_ingredient_named_in_question"),
			"note=ยังไม่รู้ว่าถามถึงวัตถุดิบตัวไหน ให้ถามกลับว่าหมายถึงตัวไหน",
			"ingredients_in_stock_sample=" + strings.Join(sample, ", "),
			fmt.Sprintf("total_ingredients=%d", len(shelf)),
		})
	}

	lines := make([]string, 0, len(found)*6)
	for _, index := range found {
		item := shelf[index]
		lines = append(lines,
			"ingredient="+item.Name,
			fmt.Sprintf("stock=%s unit=%s", joyboyNum(item.Stock), item.Unit),
			fmt.Sprintf("min_stock=%s cost_per_unit=%s stock_value=%s",
				joyboyNum(item.MinStock), joyboyNum(item.CostPerUnit),
				joyboyNum(roundBaht(item.Stock*item.CostPerUnit))),
		)
		switch {
		case item.Stock <= 0:
			lines = append(lines, "status=หมดแล้ว")
		case item.MinStock > 0 && item.Stock < item.MinStock:
			lines = append(lines, "status=ต่ำกว่าขั้นต่ำ")
		default:
			lines = append(lines, "status=ปกติ")
		}
		if used := aiMenusUsingIngredient(menus, item.ID); len(used) > 0 {
			lines = append(lines, "used_by_menus="+strings.Join(used, ", "))
		} else {
			lines = append(lines, "used_by_menus=ไม่มีเมนูไหนใช้วัตถุดิบนี้ตามสูตรที่บันทึกไว้")
		}
	}
	return joyboyJoin(lines)
}

// aiMenusUsingIngredient reads the stored recipes rather than guessing from the
// name. The invented "กะเพราไก่" came from having no such list to read.
func aiMenusUsingIngredient(menus []entity.MenuItem, ingredientID uint) []string {
	used := make([]string, 0, 4)
	for _, menu := range menus {
		for _, component := range menu.Ingredients {
			if component.IngredientID == ingredientID {
				used = append(used, menu.Name)
				break
			}
		}
	}
	return used
}

// joyboyMenuDetailBody reports one named menu: its price, whether it is being
// sold, what it did over the analysis window, and what it is made of.
func joyboyMenuDetailBody(menus []entity.MenuItem, margins []repository.AIMenuMarginSummary, window, question string, history []AIConversationMessage) string {
	if len(menus) == 0 {
		return joyboyNoData("no_menu_items_recorded")
	}
	names := make([]string, len(menus))
	for index, item := range menus {
		names[index] = item.Name
	}
	found := aiFindNamedRowsInThread(names, question, history)
	if len(found) == 0 {
		sample := make([]string, 0, 8)
		for _, item := range menus {
			sample = append(sample, item.Name)
			if len(sample) == 8 {
				break
			}
		}
		return joyboyJoin([]string{
			joyboyNoData("no_menu_named_in_question"),
			"note=ยังไม่รู้ว่าถามถึงเมนูไหน ให้ถามกลับว่าหมายถึงเมนูไหน",
			"menus_sample=" + strings.Join(sample, ", "),
			fmt.Sprintf("total_menus=%d", len(menus)),
		})
	}

	byName := make(map[string]repository.AIMenuMarginSummary, len(margins))
	for _, row := range margins {
		byName[aiNormalizeName(row.MenuName)] = row
	}

	lines := make([]string, 0, len(found)*7)
	lines = append(lines, window)
	for _, index := range found {
		menu := menus[index]
		lines = append(lines, "menu="+menu.Name, fmt.Sprintf("price=%s", joyboyNum(menu.Price)))
		if menu.IsAvailable {
			lines = append(lines, "selling_status=เปิดขายอยู่")
		} else {
			lines = append(lines, "selling_status=ปิดขายอยู่")
		}
		if row, ok := byName[aiNormalizeName(menu.Name)]; ok {
			lines = append(lines, fmt.Sprintf("qty_sold=%d revenue=%s cost=%s profit=%s margin_pct=%s",
				row.Quantity, joyboyNum(row.Revenue), joyboyNum(row.Cost),
				joyboyNum(row.Profit), joyboyNum(row.Margin)))
			// Per-plate figures are computed here because the model is forbidden to
			// do arithmetic: given only a total profit and a quantity it answered
			// "ผมไม่ทราบกำไรต่อจาน" — the division it must not perform was the whole
			// question. Go divides, the model reads.
			if row.Quantity > 0 {
				lines = append(lines, fmt.Sprintf("profit_per_unit=%s cost_per_unit=%s revenue_per_unit=%s",
					joyboyNum(roundBaht(row.Profit/float64(row.Quantity))),
					joyboyNum(roundBaht(row.Cost/float64(row.Quantity))),
					joyboyNum(roundBaht(row.Revenue/float64(row.Quantity)))))
			}
		} else {
			// Not in the margin set means no paid sales in the window — a real zero,
			// which is different from "this menu is unknown".
			lines = append(lines, "qty_sold=0 note=ไม่มียอดขายในช่วงที่วิเคราะห์")
		}
		if recipe := aiMenuRecipeLines(menu); recipe != "" {
			lines = append(lines, "recipe="+recipe)
		} else {
			lines = append(lines, "recipe=ยังไม่ได้บันทึกสูตรของเมนูนี้")
		}
	}
	return joyboyJoin(lines)
}

// aiMenuRecipeLines renders a menu's stored recipe as "name qty unit" pairs.
func aiMenuRecipeLines(menu entity.MenuItem) string {
	parts := make([]string, 0, len(menu.Ingredients))
	for _, component := range menu.Ingredients {
		name := ""
		if component.Ingredient != nil {
			name = component.Ingredient.Name
		}
		if strings.TrimSpace(name) == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s %s %s", name, joyboyNum(component.Quantity), component.Unit))
	}
	return strings.Join(parts, " · ")
}
