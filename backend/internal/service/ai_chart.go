package service

import (
	"sort"
	"strings"

	"Project-M/internal/repository"
)

// General chart payloads for the assistant.
//
// This is the "bounded-flexible" charting the owner asked for: the user says
// what to compare ("เทียบยอดเดือนนี้กับเดือนที่แล้ว") and the model's freedom is
// only to pick the tool and pull out the operands — it never lays out a chart or
// invents a number. The figures here are the same ones the answer text states
// (computed in Go), and the frontend draws them. A wrong chart reads as more
// authoritative than wrong text, so the numbers stay deterministic on purpose.
//
// AIChartData is deliberately small and generic (a kind, a title, labelled
// categories, one or more series) so a new chart type is a new builder, not a
// new response field.

// AIChartKind is the shape the frontend should draw.
type AIChartKind string

const (
	AIChartBar  AIChartKind = "bar"
	AIChartLine AIChartKind = "line"
	AIChartPie  AIChartKind = "pie"
)

// AIChartData is a chart-ready payload. Categories are the x-axis labels; each
// series carries one value per category, in the same order.
type AIChartData struct {
	Kind       AIChartKind     `json:"kind"`
	Title      string          `json:"title"`
	Unit       string          `json:"unit,omitempty"` // e.g. "บาท" — for axis / tooltip
	Categories []string        `json:"categories"`
	Series     []AIChartSeries `json:"series"`
}

// AIChartSeries is one line/set of bars. Values line up with Categories by index.
type AIChartSeries struct {
	Name   string    `json:"name,omitempty"`
	Values []float64 `json:"values"`
}

// buildSalesComparisonChart renders a two-period sales comparison as a bar chart:
// one bar per period, revenue on the value axis. The labels and numbers match
// joyboySalesComparisonBody's fact sheet, so the picture and the words agree.
func buildSalesComparisonChart(labelA string, revenueA float64, labelB string, revenueB float64) *AIChartData {
	return &AIChartData{
		Kind:       AIChartBar,
		Title:      "เทียบยอดขาย",
		Unit:       "บาท",
		Categories: []string{labelA, labelB},
		Series:     []AIChartSeries{{Name: "ยอดขาย", Values: []float64{revenueA, revenueB}}},
	}
}

// shortDayMonth turns an ISO date ("2026-08-27") into a compact "27/8" axis label.
func shortDayMonth(iso string) string {
	parts := strings.Split(strings.TrimSpace(iso), "-")
	if len(parts) != 3 {
		return iso
	}
	day := strings.TrimLeft(parts[2], "0")
	month := strings.TrimLeft(parts[1], "0")
	if day == "" {
		day = "0"
	}
	if month == "" {
		month = "0"
	}
	return day + "/" + month
}

// buildDailySalesLineChart renders revenue per day over the recent window as a
// line — the shape a "how are sales trending" question wants to see. It draws
// from the same daily figures the trend tool reports, so the picture and the
// answer agree. nil when there are too few days to make a line.
func buildDailySalesLineChart(days []repository.AISalesSummary) *AIChartData {
	type point struct {
		date    string
		revenue float64
	}
	points := make([]point, 0, len(days))
	for _, d := range days {
		iso := strings.TrimSpace(d.OrderDate)
		if iso == "" {
			continue
		}
		points = append(points, point{iso, d.Revenue})
	}
	if len(points) < 2 {
		return nil
	}
	// ISO dates sort correctly as plain strings.
	sort.SliceStable(points, func(i, j int) bool { return points[i].date < points[j].date })
	const maxDays = 30
	if len(points) > maxDays {
		points = points[len(points)-maxDays:]
	}
	categories := make([]string, len(points))
	values := make([]float64, len(points))
	for i, p := range points {
		categories[i] = shortDayMonth(p.date)
		values[i] = p.revenue
	}
	return &AIChartData{
		Kind:       AIChartLine,
		Title:      "ยอดขายรายวัน",
		Unit:       "บาท",
		Categories: categories,
		Series:     []AIChartSeries{{Name: "ยอดขาย", Values: values}},
	}
}

// menuRankingChartWanted is true when a menu question asks for a ranking or a
// chart ("เมนูขายดี", "5 อันดับ", "กราฟ") rather than a plain list of what is on
// the menu ("มีเมนูอะไรบ้าง") — the top-selling tool answers both, but only the
// former is worth a bar chart.
func menuRankingChartWanted(question string) bool {
	n := strings.ToLower(question)
	for _, k := range []string{
		"ขายดี", "อันดับ", "มากสุด", "เยอะสุด", "สูงสุด", "ยอดนิยม", "นิยม",
		"กราฟ", "ชาร์ต", "แผนภูมิ", "top", "chart", "ranking", "best",
	} {
		if strings.Contains(n, k) {
			return true
		}
	}
	return false
}

// buildTopMenusBarChart draws the best-selling menus by quantity — the same
// ranking the top-selling tool reports — as bars. Capped so the labels stay
// readable. nil when there is nothing sold.
func buildTopMenusBarChart(menus []repository.AIMenuSummary) *AIChartData {
	if len(menus) == 0 {
		return nil
	}
	const limit = 6
	if len(menus) > limit {
		menus = menus[:limit]
	}
	categories := make([]string, len(menus))
	values := make([]float64, len(menus))
	for i, m := range menus {
		categories[i] = m.MenuName
		values[i] = float64(m.Quantity)
	}
	return &AIChartData{
		Kind:       AIChartBar,
		Title:      "เมนูขายดี",
		Unit:       "รายการ",
		Categories: categories,
		Series:     []AIChartSeries{{Name: "จำนวน", Values: values}},
	}
}

// orderTypeLabel turns the stored order type into the Thai the owner reads.
func orderTypeLabel(orderType string) string {
	switch strings.TrimSpace(orderType) {
	case "dine_in":
		return "กินที่ร้าน"
	case "takeaway":
		return "กลับบ้าน"
	default:
		return orderType
	}
}

// buildOrderTypePieChart shows the share of revenue by order type (dine-in vs
// takeaway) as a pie — the same split the breakdown tool reports. nil when there
// is no revenue to divide.
func buildOrderTypePieChart(rows []repository.AIOrderTypeSummary) *AIChartData {
	categories := make([]string, 0, len(rows))
	values := make([]float64, 0, len(rows))
	var total float64
	for _, r := range rows {
		if r.Revenue <= 0 {
			continue
		}
		categories = append(categories, orderTypeLabel(r.OrderType))
		values = append(values, r.Revenue)
		total += r.Revenue
	}
	if total <= 0 || len(categories) == 0 {
		return nil
	}
	return &AIChartData{
		Kind:       AIChartPie,
		Title:      "สัดส่วนยอดขายตามประเภท",
		Unit:       "บาท",
		Categories: categories,
		Series:     []AIChartSeries{{Name: "ยอดขาย", Values: values}},
	}
}
