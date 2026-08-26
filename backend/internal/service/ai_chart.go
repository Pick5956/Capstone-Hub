package service

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
