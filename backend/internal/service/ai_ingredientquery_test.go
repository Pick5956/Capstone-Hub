package service

import (
	"strings"
	"testing"
)

func TestParseIngredientRankQueryParaphrases(t *testing.T) {
	cases := []struct {
		q    string
		dim  string
		dir  string
		rank int
		limit int
	}{
		{"วัตถุดิบอะไรกินต้นทุนเยอะสุด", "cost", "high", 1, 1},
		{"วัตถุดิบไหนต้นทุนสูงสุด", "cost", "high", 1, 1},
		{"top ingredient cost", "cost", "high", 1, 1},
		{"วัตถุดิบอะไรใช้ต้นทุนน้อยสุด", "cost", "low", 1, 1},
		{"วัตถุดิบไหนใช้เยอะสุด", "usage", "high", 1, 1},
		{"มีของค้างสต๊อกที่ไม่ได้ใช้ไหม", "usage", "low", 1, 1},
		{"เงินจมวัตถุดิบตัวไหน", "usage", "low", 1, 1},
		{"วัตถุดิบอะไรใกล้หมด", "stock", "low", 1, 1},
		{"วัตถุดิบไหนเหลือเยอะสุด", "stock", "high", 1, 1},
		{"ของไหนจะหมดก่อน พอใช้อีกกี่วัน", "daysleft", "low", 1, 1},
		{"ควรสั่งวัตถุดิบอะไรเพิ่ม", "daysleft", "low", 1, 1},
		{"5 อันดับวัตถุดิบกินต้นทุนเยอะ", "cost", "high", 1, 5},
		{"วัตถุดิบต้นทุนแพงรองลงมา", "cost", "high", 2, 1},
	}
	for _, c := range cases {
		got, ok := parseIngredientRankQuery(c.q)
		if !ok {
			t.Errorf("%q: expected an ingredient-rank query, got ok=false", c.q)
			continue
		}
		if got.Dimension != c.dim || got.Direction != c.dir || got.Rank != c.rank || got.Limit != c.limit {
			t.Errorf("%q: got {%s %s rank=%d limit=%d}, want {%s %s rank=%d limit=%d}",
				c.q, got.Dimension, got.Direction, got.Rank, got.Limit, c.dim, c.dir, c.rank, c.limit)
		}
	}
}

func TestParseIngredientRankQueryIgnoresMenuAndSales(t *testing.T) {
	for _, q := range []string{
		"เมนูไหนกินต้นทุนเยอะสุด", // menu, not ingredient
		"ยอดขายรวมเท่าไหร่",
		"เมนูไหนแพงสุด",
	} {
		if _, ok := parseIngredientRankQuery(q); ok {
			t.Errorf("%q should not be treated as an ingredient-rank query", q)
		}
	}
}

var pilotIngredientRows = []ingredientMetricRow{
	{Name: "กุ้งสด", Unit: "กก.", Stock: 3, Used: 40, Cost: 8000, DaysLeft: 2},
	{Name: "กะทิ", Unit: "กล่อง", Stock: 50, Used: 30, Cost: 1500, DaysLeft: 20},
	{Name: "พริกแกง", Unit: "กก.", Stock: 12, Used: 0, Cost: 0, DaysLeft: 999},
	{Name: "ข้าวสาร", Unit: "กก.", Stock: 5, Used: 60, Cost: 3000, DaysLeft: 1},
}

func TestExecuteIngredientRank(t *testing.T) {
	topCost := executeIngredientRank(pilotIngredientRows, ingredientRankQuery{Dimension: "cost", Direction: "high", Rank: 1, Limit: 1})
	if topCost[0].Name != "กุ้งสด" {
		t.Fatalf("top cost wrong: %+v", topCost)
	}
	// dead stock = used least (พริกแกง used 0)
	dead := executeIngredientRank(pilotIngredientRows, ingredientRankQuery{Dimension: "usage", Direction: "low", Rank: 1, Limit: 1})
	if dead[0].Name != "พริกแกง" {
		t.Fatalf("dead stock wrong: %+v", dead)
	}
	// soonest to run out = fewest days left (ข้าวสาร 1 วัน)
	soonest := executeIngredientRank(pilotIngredientRows, ingredientRankQuery{Dimension: "daysleft", Direction: "low", Rank: 1, Limit: 1})
	if soonest[0].Name != "ข้าวสาร" {
		t.Fatalf("soonest-to-run-out wrong: %+v", soonest)
	}
}

func TestIngredientRankEndToEnd(t *testing.T) {
	q, ok := parseIngredientRankQuery("มีของค้างสต๊อกที่ไม่ได้ใช้ไหม")
	if !ok {
		t.Fatal("expected parse ok")
	}
	answer := formatIngredientRank(q, executeIngredientRank(pilotIngredientRows, q))
	if !strings.Contains(answer, "พริกแกง") || !strings.Contains(answer, "ค้างสต๊อก") {
		t.Fatalf("dead-stock answer wrong: %s", answer)
	}
}
