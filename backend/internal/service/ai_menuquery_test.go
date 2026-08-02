package service

import (
	"strings"
	"testing"
)

// TestParseMenuRankQueryParaphrases is the core proof: many different phrasings
// with the same meaning must parse to the same structured query — including the
// runner-up wording that the old single-tool flow got wrong.
func TestParseMenuRankQueryParaphrases(t *testing.T) {
	cases := []struct {
		q      string
		metric string
		dir    string
		rank   int
		limit  int
	}{
		// price — the confusable family + the runner-up bug
		{"เมนูไหนแพงสุด", "price", "high", 1, 1},
		{"จานไหนราคาโหดสุด", "price", "high", 1, 1},
		{"อะไรแพงที่สุดในร้าน", "price", "high", 1, 1},
		{"เมนูไหนขายราคาแพงที่สุด", "price", "high", 1, 1},
		{"แล้วเมนูไหนขายราคาแพงรองลงมา", "price", "high", 2, 1}, // ← the bug, now rank 2
		{"เมนูราคาแพงอันดับที่ 3", "price", "high", 3, 1},
		{"5 อันดับเมนูราคาแพง", "price", "high", 1, 5},
		{"เมนูไหนราคาถูกสุด", "price", "low", 1, 1},
		{"which dish is the priciest", "price", "high", 1, 1},

		// margin
		{"เมนูกำไรดีสุด", "margin", "high", 1, 1},
		{"which dish has the best margin", "margin", "high", 1, 1},
		{"เมนูไหนกำไรน้อยสุด", "margin", "low", 1, 1},
		{"worst margin dish", "margin", "low", 1, 1},
		{"เมนูกำไรดีอันดับสอง", "margin", "high", 2, 1},

		// revenue
		{"เมนูไหนทำรายได้เยอะสุด", "revenue", "high", 1, 1},
		{"เมนูไหนทำเงินให้ร้านมากสุด", "revenue", "high", 1, 1},

		// quantity
		{"เมนูไหนขายดีสุด", "quantity", "high", 1, 1},
		{"เมนูไหนคนสั่งบ่อยสุด", "quantity", "high", 1, 1},
		{"เมนูไหนขายไม่ออก", "quantity", "low", 1, 1},

		// cost (ต้นทุน wins over ถูก)
		{"เมนูต้นทุนถูกสุด", "cost", "low", 1, 1},
		{"เมนูไหนต้นทุนต่อจานสูงสุด", "cost", "high", 1, 1},
	}
	for _, c := range cases {
		got, ok := parseMenuRankQuery(c.q)
		if !ok {
			t.Errorf("%q: expected a menu-rank query, got ok=false", c.q)
			continue
		}
		if got.Metric != c.metric || got.Direction != c.dir || got.Rank != c.rank || got.Limit != c.limit {
			t.Errorf("%q: got {%s %s rank=%d limit=%d}, want {%s %s rank=%d limit=%d}",
				c.q, got.Metric, got.Direction, got.Rank, got.Limit, c.metric, c.dir, c.rank, c.limit)
		}
	}
}

// Non-menu questions must not be claimed by this parser.
func TestParseMenuRankQueryIgnoresNonMenu(t *testing.T) {
	for _, q := range []string{
		"ยอดขายรวมเท่าไหร่",
		"วัตถุดิบอะไรใกล้หมด",
		"เทียบยอดเดือนนี้กับเดือนก่อน",
		"สวัสดีครับ",
		// Shared metric words must not pull ingredient questions into the menu domain.
		"วัตถุดิบอะไรกินต้นทุนเยอะสุด",
		"วัตถุดิบต้นทุนแพงรองลงมา",
	} {
		if _, ok := parseMenuRankQuery(q); ok {
			t.Errorf("%q should not be treated as a menu-rank query", q)
		}
	}
}

var pilotMenuRows = []menuMetricRow{
	{Name: "ต้มยำกุ้งน้ำข้น", Price: 139, Quantity: 120, Revenue: 16680, Cost: 60, Margin: 56.8},
	{Name: "แกงเขียวหวานไก่", Price: 129, Quantity: 90, Revenue: 11610, Cost: 55, Margin: 57.4},
	{Name: "ปีกไก่ทอดน้ำปลา", Price: 99, Quantity: 200, Revenue: 19800, Cost: 35, Margin: 64.6},
	{Name: "ข้าวผัดปู", Price: 95, Quantity: 60, Revenue: 5700, Cost: 40, Margin: 57.9},
}

// TestExecuteMenuRankRunnerUp proves the fix: rank 2 returns the second item.
func TestExecuteMenuRankRunnerUp(t *testing.T) {
	top := executeMenuRank(pilotMenuRows, menuRankQuery{Metric: "price", Direction: "high", Rank: 1, Limit: 1})
	if len(top) != 1 || top[0].Name != "ต้มยำกุ้งน้ำข้น" {
		t.Fatalf("rank 1 price wrong: %+v", top)
	}
	second := executeMenuRank(pilotMenuRows, menuRankQuery{Metric: "price", Direction: "high", Rank: 2, Limit: 1})
	if len(second) != 1 || second[0].Name != "แกงเขียวหวานไก่" {
		t.Fatalf("รองลงมา (rank 2) should be แกงเขียวหวานไก่, got %+v", second)
	}
	cheapest := executeMenuRank(pilotMenuRows, menuRankQuery{Metric: "price", Direction: "low", Rank: 1, Limit: 1})
	if len(cheapest) != 1 || cheapest[0].Name != "ข้าวผัดปู" {
		t.Fatalf("cheapest wrong: %+v", cheapest)
	}
}

func TestExecuteMenuRankOtherMetrics(t *testing.T) {
	bestSelling := executeMenuRank(pilotMenuRows, menuRankQuery{Metric: "quantity", Direction: "high", Rank: 1, Limit: 1})
	if bestSelling[0].Name != "ปีกไก่ทอดน้ำปลา" {
		t.Fatalf("best selling (quantity) wrong: %+v", bestSelling)
	}
	bestMargin := executeMenuRank(pilotMenuRows, menuRankQuery{Metric: "margin", Direction: "high", Rank: 1, Limit: 1})
	if bestMargin[0].Name != "ปีกไก่ทอดน้ำปลา" {
		t.Fatalf("best margin wrong: %+v", bestMargin)
	}
	topRevenue := executeMenuRank(pilotMenuRows, menuRankQuery{Metric: "revenue", Direction: "high", Rank: 1, Limit: 1})
	if topRevenue[0].Name != "ปีกไก่ทอดน้ำปลา" {
		t.Fatalf("top revenue wrong: %+v", topRevenue)
	}
}

// End-to-end (parse → execute → format) for the exact bug scenario.
func TestMenuRankEndToEndRunnerUp(t *testing.T) {
	q, ok := parseMenuRankQuery("แล้วเมนูไหนขายราคาแพงรองลงมา")
	if !ok {
		t.Fatal("expected parse ok")
	}
	rows := executeMenuRank(pilotMenuRows, q)
	answer := formatMenuRank(q, rows)
	if !strings.Contains(answer, "แกงเขียวหวานไก่") {
		t.Fatalf("runner-up answer should name แกงเขียวหวานไก่: %s", answer)
	}
	if !strings.Contains(answer, "อันดับที่ 2") {
		t.Fatalf("answer should mention อันดับที่ 2: %s", answer)
	}
	if strings.Contains(answer, "ต้มยำกุ้งน้ำข้น") {
		t.Fatalf("runner-up answer must not lead with the #1 item: %s", answer)
	}
}

func TestMenuRankFormatList(t *testing.T) {
	q, _ := parseMenuRankQuery("5 อันดับเมนูราคาแพง")
	rows := executeMenuRank(pilotMenuRows, q)
	answer := formatMenuRank(q, rows)
	for _, want := range []string{"1. **ต้มยำกุ้งน้ำข้น**", "2. **แกงเขียวหวานไก่**", "เรียงตามลำดับ"} {
		if !strings.Contains(answer, want) {
			t.Fatalf("list answer missing %q: %s", want, answer)
		}
	}
}
