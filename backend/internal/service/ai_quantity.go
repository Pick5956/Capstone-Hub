package service

import (
	"fmt"
	"strings"

	"Project-M/internal/repository"
)

// Total units sold ("ขายได้กี่จานทั้งหมด").
//
// This asks for a count of dishes, but the router sent it to the sales summary,
// which answers in baht. Units and revenue are different questions, so this sums
// the per-menu quantity straight from the database.

// isTotalQuantityQuestion matches a store-wide count of dishes, leaving per-menu
// counts ("เมนูไหนขายกี่จาน") to the ranking tools.
func isTotalQuantityQuestion(question string) bool {
	n := strings.ToLower(strings.TrimSpace(question))
	if containsAny(n, "เมนูไหน", "จานไหน", "อันไหน", "แต่ละเมนู", "ตัวไหน") {
		return false
	}
	return containsAny(n,
		"กี่จาน", "กี่ที่", "กี่ชิ้น", "กี่รายการ", "จำนวนจาน", "จำนวนที่ขาย",
		"how many dishes", "how many plates", "how many items", "total dishes", "total items")
}

func (s *AIService) answerTotalQuantityQuery(restaurantID uint, question string) (*AIAskResponse, bool, error) {
	if s.repo == nil || !isTotalQuantityQuestion(question) {
		return nil, false, nil
	}

	now := repository.BangkokNow()
	start, end, label, _ := profitPeriod(question, now)
	rows, err := s.repo.MenuMetricsForRange(restaurantID, start, end)
	if err != nil {
		return nil, false, err
	}

	var qty int64
	var revenue float64
	for _, m := range rows {
		qty += m.Quantity
		revenue += m.Revenue
	}

	answer := fmt.Sprintf("%s ยังไม่มีรายการขายที่ปิดบิลครับ", label)
	if qty > 0 {
		answer = fmt.Sprintf("%s ขายได้รวม %s จานครับ (คิดเป็นรายได้จากเมนู %s บาท)",
			label, formatInt(qty), formatMoney(revenue))
	}

	hinted, assumed := appendScopeHint(question, answer, false)
	return &AIAskResponse{
		Answer:       hinted,
		ScopeAssumed: assumed,
		Intent:       AIIntentAnalysis,
		Task:         AITaskRetrieveFact,
		Model:        "local-total-quantity",
		Snapshot:     AISnapshot{},
	}, true, nil
}
