package service

// PILOT (not wired into the live flow) — the same intent-schema pattern applied
// to a SECOND domain (ingredients), to show it generalises. One parameterised
// query replaces get_top_cost_ingredients / get_dead_stock /
// get_low_stock_ingredients / get_ingredient_reorder_forecast:
//
//	ingredientRankQuery{dimension, direction, rank, limit}
//
// Reuses the generic rank/limit/ordinal parsing from the menu pilot.
import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type ingredientRankQuery struct {
	Dimension string // cost | usage | stock | daysleft
	Direction string // high | low
	Rank      int
	Limit     int
}

type ingredientMetricRow struct {
	Name     string
	Unit     string
	Stock    float64
	Used     float64
	Cost     float64
	DaysLeft float64
}

// parseIngredientRankQuery returns ok=false unless the question is clearly about
// ingredients/stock, so it never competes with the menu or sales domains.
func parseIngredientRankQuery(question string) (ingredientRankQuery, bool) {
	n := strings.ToLower(strings.TrimSpace(question))
	if containsAny(n, "เมนู", "menu", "จาน", "dish") {
		return ingredientRankQuery{}, false
	}

	dim, dir, ok := detectIngredientDimension(n)
	if !ok {
		return ingredientRankQuery{}, false
	}
	// A cost/usage/stock question can be flipped low by explicit "น้อย/ต่ำ" words.
	if dir == "high" && containsAny(n, "น้อย", "ต่ำ", "least", "lowest") {
		dir = "low"
	}

	q := ingredientRankQuery{Dimension: dim, Direction: dir, Rank: 1, Limit: 1}
	if m := reMenuLimit.FindStringSubmatch(n); m != nil {
		if v, err := strconv.Atoi(firstNonEmpty(m[1], m[2], m[3])); err == nil && v > 0 {
			q.Limit = v
		}
	}
	if m := reMenuRankNum.FindStringSubmatch(n); m != nil {
		if v, err := strconv.Atoi(m[1]); err == nil && v > 0 {
			q.Rank = v
		}
	}
	if r := detectOrdinalRank(n); r > 0 {
		q.Rank = r
	}
	return q, true
}

// detectIngredientDimension returns the dimension and its natural default
// direction. Checked in priority order so overlapping words resolve sensibly.
func detectIngredientDimension(n string) (dim, dir string, ok bool) {
	switch {
	case containsAny(n, "จะหมด", "หมดก่อน", "กี่วัน", "ควรสั่ง", "สั่งเพิ่ม", "reorder", "run out", "restock"):
		return "daysleft", "low", true // soonest to run out
	case containsAny(n, "ค้างสต๊อก", "ค้างสต็อก", "ไม่ได้ใช้", "ไม่ถูกใช้", "เงินจม", "dead", "unused"):
		return "usage", "low", true // dead stock = used least
	case containsAny(n, "ต้นทุน", "กินต้นทุน", "cost", "งบ", "budget", "แพง"):
		return "cost", "high", true
	case containsAny(n, "ใช้เยอะ", "ใช้มาก", "ใช้บ่อย", "ใช้ไป", "usage", "consume"):
		return "usage", "high", true
	case containsAny(n, "ใกล้หมด", "เหลือน้อย", "low stock", "out of stock", "หมดสต๊อก"):
		return "stock", "low", true
	case containsAny(n, "เหลือ", "คงเหลือ", "สต๊อก", "สต็อก", "คลัง", "stock", "remaining"):
		return "stock", "high", true
	case containsAny(n, "วัตถุดิบ", "ingredient"):
		return "stock", "high", true
	}
	return "", "", false
}

func executeIngredientRank(rows []ingredientMetricRow, q ingredientRankQuery) []ingredientMetricRow {
	sorted := make([]ingredientMetricRow, len(rows))
	copy(sorted, rows)
	sort.SliceStable(sorted, func(i, j int) bool {
		vi, vj := ingredientDimValue(sorted[i], q.Dimension), ingredientDimValue(sorted[j], q.Dimension)
		if q.Direction == "low" {
			return vi < vj
		}
		return vi > vj
	})

	start := q.Rank - 1
	if start < 0 {
		start = 0
	}
	if start >= len(sorted) {
		return nil
	}
	end := start + q.Limit
	if q.Limit < 1 {
		end = start + 1
	}
	if end > len(sorted) {
		end = len(sorted)
	}
	return sorted[start:end]
}

func ingredientDimValue(r ingredientMetricRow, dim string) float64 {
	switch dim {
	case "cost":
		return r.Cost
	case "usage":
		return r.Used
	case "stock":
		return r.Stock
	case "daysleft":
		return r.DaysLeft
	}
	return 0
}

func formatIngredientRank(q ingredientRankQuery, rows []ingredientMetricRow) string {
	if len(rows) == 0 {
		return "ยังไม่มีข้อมูลวัตถุดิบสำหรับจัดอันดับครับ"
	}
	desc := ingredientDescriptor(q.Dimension, q.Direction)
	if q.Limit <= 1 {
		r := rows[0]
		return fmt.Sprintf("วัตถุดิบที่%sคือ **%s** (%s) ครับ", desc, r.Name, ingredientValueString(q.Dimension, r))
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("วัตถุดิบที่%s เรียงตามลำดับครับ:\n\n", desc))
	for i, r := range rows {
		sb.WriteString(fmt.Sprintf("%d. **%s** (%s)\n", q.Rank+i, r.Name, ingredientValueString(q.Dimension, r)))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func ingredientDescriptor(dim, dir string) string {
	switch dim {
	case "cost":
		if dir == "low" {
			return "ใช้ต้นทุนน้อยที่สุด"
		}
		return "กินต้นทุนมากที่สุด"
	case "usage":
		if dir == "low" {
			return "ถูกใช้น้อยที่สุด (ของค้างสต๊อก)"
		}
		return "ถูกใช้มากที่สุด"
	case "stock":
		if dir == "low" {
			return "เหลือน้อยที่สุด (ใกล้หมด)"
		}
		return "เหลือมากที่สุด"
	case "daysleft":
		return "จะหมดเร็วที่สุด"
	}
	return ""
}

func ingredientValueString(dim string, r ingredientMetricRow) string {
	switch dim {
	case "cost":
		return fmt.Sprintf("ต้นทุนที่ใช้ %.2f บาท", r.Cost)
	case "usage":
		return fmt.Sprintf("ใช้ไป %.2f %s", r.Used, r.Unit)
	case "stock":
		return fmt.Sprintf("คงเหลือ %.2f %s", r.Stock, r.Unit)
	case "daysleft":
		return fmt.Sprintf("พออีกประมาณ %.0f วัน", r.DaysLeft)
	}
	return ""
}
