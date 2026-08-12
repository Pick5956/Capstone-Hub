package service

import "testing"

func TestQuestionSpansUncoveredConcern(t *testing.T) {
	cases := []struct {
		name string
		q    string
		tool AIToolName
		want bool
	}{
		{
			name: "sales + stock is compound for a popularity tool",
			q:    "เมนูไหนขายดีและกระทบสต็อกมากที่สุด",
			tool: AIToolGetTopSellingMenus,
			want: true,
		},
		{
			name: "sales + margin is compound for a popularity tool",
			q:    "เมนูขายดีแต่กำไรน้อย",
			tool: AIToolGetTopSellingMenus,
			want: true,
		},
		{
			name: "plain popularity question stays deterministic",
			q:    "เมนูขายดีที่สุด",
			tool: AIToolGetTopSellingMenus,
			want: false,
		},
		{
			name: "rank-1 popularity question stays deterministic",
			q:    "เมนูขายดีอันดับ 1",
			tool: AIToolGetTopSellingMenus,
			want: false,
		},
		{
			// A menu engineering tool already answers popularity x margin, so a
			// compound question routed there must NOT be second-guessed.
			name: "menu engineering is not a single-concern tool",
			q:    "เมนูขายดีแต่กำไรน้อย",
			tool: AIToolGetMenuEngineering,
			want: false,
		},
		{
			// "ต้นทุน" (cost) belongs to an ingredient-cost question; the ingredient
			// tool answers it directly and must not be treated as compound.
			name: "ingredient cost tool is not a popularity tool",
			q:    "วัตถุดิบไหนต้นทุนสูงสุด",
			tool: AIToolGetTopCostIngredients,
			want: false,
		},
		{
			name: "broad summary tool is never compound-gated",
			q:    "เมนูขายดีและกระทบสต็อก",
			tool: AIToolGetStoreSummary,
			want: false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := questionSpansUncoveredConcern(c.q, c.tool); got != c.want {
				t.Fatalf("questionSpansUncoveredConcern(%q, %s) = %v, want %v", c.q, c.tool, got, c.want)
			}
		})
	}
}
