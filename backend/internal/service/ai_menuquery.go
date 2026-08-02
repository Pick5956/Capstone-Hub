package service

// PILOT (not wired into the live flow) — a proof of the semantic-parsing
// approach on the menu domain. Instead of one narrow tool per question
// ("get_most_expensive_menu", "get_highest_margin_menu", ...), a single intent
// with parameters covers all of them:
//
//	menuRankQuery{metric, direction, rank, limit}
//
// Any phrasing that means the same thing maps to the same query, and "รองลงมา" /
// "อันดับสอง" become rank=2 — which fixes the runner-up bug for free. Everything
// here is deterministic and DB-free (operates on rows passed in) so it is fully
// unit-testable without an LLM.
import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type menuRankQuery struct {
	Metric    string // price | margin | revenue | quantity | cost
	Direction string // high | low
	Rank      int    // 1 = top, 2 = รองลงมา, ...
	Limit     int    // how many to list
}

// menuMetricRow is a uniform per-menu row the executor sorts by any metric.
type menuMetricRow struct {
	Name     string
	Price    float64
	Quantity int64
	Revenue  float64
	Cost     float64
	Profit   float64
	Margin   float64
}

var (
	reMenuLimit   = regexp.MustCompile(`(\d+)\s*อันดับ|top\s+(\d+)|(\d+)\s*เมนู`)
	reMenuRankNum = regexp.MustCompile(`อันดับ(?:ที่)?\s*(\d+)`)
)

// parseMenuRankQuery translates a menu-ranking question into a structured query.
// ok is false when no menu metric is detected, so it never hijacks sales-total or
// ingredient questions.
func parseMenuRankQuery(question string) (menuRankQuery, bool) {
	n := strings.ToLower(strings.TrimSpace(question))
	// Metric words like "ต้นทุน" are shared with the ingredient domain, so a
	// question that names ingredients/stock and never mentions a menu belongs to
	// the ingredient parser, not this one.
	if containsAny(n, "วัตถุดิบ", "ingredient", "สต๊อก", "สต็อก", "คลัง", "stock") &&
		!containsAny(n, "เมนู", "menu", "จาน", "dish") {
		return menuRankQuery{}, false
	}
	metric, ok := detectMenuMetric(n)
	if !ok {
		return menuRankQuery{}, false
	}

	q := menuRankQuery{
		Metric:    metric,
		Direction: detectMenuDirection(n),
		Rank:      1,
		Limit:     1,
	}

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

// detectMenuMetric checks in priority order so overlapping words resolve
// sensibly (e.g. "ต้นทุนถูกสุด" is cost, not price).
func detectMenuMetric(n string) (string, bool) {
	switch {
	case containsAny(n, "กำไร", "มาร์จิ้น", "มาร์จิน", "margin", "profit"):
		return "margin", true
	case containsAny(n, "ต้นทุน", "cost"):
		return "cost", true
	case containsAny(n, "รายได้", "ทำเงิน", "ทำรายได้", "revenue", "turnover"):
		return "revenue", true
	case containsAny(n, "ขายดี", "ขายเยอะ", "ขายไม่ออก", "ขายไม่ดี", "ยอดนิยม", "นิยม", "สั่งบ่อย", "คนสั่ง", "popular", "best selling", "selling"):
		return "quantity", true
	case containsAny(n, "ราคา", "แพง", "ถูก", "expensive", "cheap", "price", "โหด", "แรง", "priciest"):
		return "price", true
	}
	return "", false
}

func detectMenuDirection(n string) string {
	if containsAny(n, "ต่ำ", "น้อย", "ถูก", "แย่", "ไม่ออก", "ไม่ดี", "ไม่ค่อย", "lowest", "least", "cheap", "worst", "slow") {
		return "low"
	}
	return "high"
}

// explicitRank reads a rank the user stated outright ("รองลงมา", "อันดับสอง",
// "อันดับที่ 3"), returning 0 when none is present. It is read from the user's own
// words rather than any rewritten form, so a follow-up never loses its ordinal.
func explicitRank(question string) int {
	n := strings.ToLower(strings.TrimSpace(question))
	if m := reMenuRankNum.FindStringSubmatch(n); m != nil {
		if v, err := strconv.Atoi(m[1]); err == nil && v > 1 {
			return v
		}
	}
	if r := detectOrdinalRank(n); r > 1 {
		return r
	}
	return 0
}

// hasMetricWord reports whether the text names a menu or ingredient metric by
// itself. "อันดับรองลงมา" does not, which is exactly what makes it a follow-up.
func hasMetricWord(question string) bool {
	n := strings.ToLower(strings.TrimSpace(question))
	if _, ok := detectMenuMetric(n); ok {
		return true
	}
	if _, _, ok := detectIngredientDimension(n); ok {
		return true
	}
	return false
}

// detectOrdinalRank maps runner-up / ordinal wording to a rank. This is the piece
// that fixes "รองลงมา".
func detectOrdinalRank(n string) int {
	switch {
	case containsAny(n, "รองลงมา", "รองจาก", "ถัดไป", "รองอันดับ", "runner", "next",
		"อันดับสอง", "อันดับที่สอง", "ที่สอง", "second"):
		return 2
	case containsAny(n, "อันดับสาม", "อันดับที่สาม", "ที่สาม", "third"):
		return 3
	case containsAny(n, "อันดับสี่", "ที่สี่", "fourth"):
		return 4
	case containsAny(n, "อันดับห้า", "ที่ห้า", "fifth"):
		return 5
	}
	return 0
}

// executeMenuRank sorts the rows by the query's metric+direction and returns the
// window starting at Rank for Limit items. Pure — the caller supplies the rows.
func executeMenuRank(rows []menuMetricRow, q menuRankQuery) []menuMetricRow {
	sorted := make([]menuMetricRow, len(rows))
	copy(sorted, rows)
	sort.SliceStable(sorted, func(i, j int) bool {
		vi, vj := menuMetricValue(sorted[i], q.Metric), menuMetricValue(sorted[j], q.Metric)
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

func menuMetricValue(r menuMetricRow, metric string) float64 {
	switch metric {
	case "price":
		return r.Price
	case "quantity":
		return float64(r.Quantity)
	case "revenue":
		return r.Revenue
	case "cost":
		return r.Cost
	case "margin":
		return r.Margin
	}
	return 0
}

func formatMenuRank(q menuRankQuery, rows []menuMetricRow) string {
	return formatMenuRankInPeriod(q, rows, "")
}

// formatMenuRankInPeriod renders the ranking, optionally stating the calendar
// period it covers so the reader never has to guess which window a figure is from.
func formatMenuRankInPeriod(q menuRankQuery, rows []menuMetricRow, periodLabel string) string {
	if len(rows) == 0 {
		return "ยังไม่มีข้อมูลเมนูสำหรับจัดอันดับครับ"
	}
	scope := ""
	if periodLabel != "" {
		scope = "ใน" + periodLabel + " "
	}
	if q.Limit <= 1 {
		r := rows[0]
		return fmt.Sprintf("%sเมนูที่%sคือ **%s** (%s) ครับ", scope, menuRankDescriptor(q.Metric, q.Direction, q.Rank), r.Name, menuValueString(q.Metric, r))
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%sเมนูที่%s เรียงตามลำดับครับ:\n\n", scope, menuRankDescriptor(q.Metric, q.Direction, 1)))
	for i, r := range rows {
		sb.WriteString(fmt.Sprintf("%d. **%s** (%s)\n", q.Rank+i, r.Name, menuValueString(q.Metric, r)))
	}
	return strings.TrimRight(sb.String(), "\n")
}

func menuRankDescriptor(metric, direction string, rank int) string {
	base := map[string]map[string]string{
		"price":    {"high": "ราคาสูง", "low": "ราคาถูก"},
		"margin":   {"high": "กำไรดี", "low": "กำไรน้อย"},
		"revenue":  {"high": "รายได้มาก", "low": "รายได้น้อย"},
		"quantity": {"high": "ขายดี", "low": "ขายน้อย"},
		"cost":     {"high": "ต้นทุนสูง", "low": "ต้นทุนต่ำ"},
	}[metric][direction]
	if rank <= 1 {
		return base + "ที่สุด"
	}
	return fmt.Sprintf("%sเป็นอันดับที่ %d", base, rank)
}

func menuValueString(metric string, r menuMetricRow) string {
	switch metric {
	case "price":
		return fmt.Sprintf("ราคา %s บาท", formatMoney(r.Price))
	case "margin":
		// Show the baht figure too when known: "กำไรดี" can mean either the
		// percentage or the money, and the two can rank differently.
		if r.Profit != 0 {
			return fmt.Sprintf("Margin %.2f%% — กำไร %s บาท", r.Margin, formatMoney(r.Profit))
		}
		return fmt.Sprintf("Margin %.2f%%", r.Margin)
	case "revenue":
		return fmt.Sprintf("รายได้ %s บาท", formatMoney(r.Revenue))
	case "quantity":
		return fmt.Sprintf("ขายได้ %d จาน", r.Quantity)
	case "cost":
		return fmt.Sprintf("ต้นทุน %s บาท/จาน", formatMoney(r.Cost))
	}
	return ""
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return "0"
}
