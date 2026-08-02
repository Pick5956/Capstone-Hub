package service

import (
	"fmt"
	"strings"

	"Project-M/internal/repository"
)

// Data-coverage questions.
//
// When the newest sales are older than today, every "today" question answers
// "ยังไม่มีออเดอร์" — technically true, useless in practice, and it left the user
// asking the same thing three different ways with no way to find out how far the
// data actually goes. This answers that question directly, from the database.

// looksLikeDataCoverageQuestion recognises "how far does the data reach?" in the
// forms people actually type.
func looksLikeDataCoverageQuestion(question string) bool {
	n := strings.ToLower(strings.TrimSpace(question))

	asksAboutData := containsAny(n, "ข้อมูล", "ยอดขาย", "ออเดอร์", "บันทึก", "data", "sales", "records")
	if !asksAboutData {
		return false
	}
	return containsAny(n,
		"ถึงวันไหน", "ถึงช่วงวันไหน", "ถึงช่วงไหน", "ถึงเมื่อไหร่", "ล่าสุดวันไหน",
		"มีตั้งแต่", "ตั้งแต่วันไหน", "ย้อนหลังกี่", "ย้อนหลังถึง", "มีกี่วัน", "ครอบคลุม",
		"how far back", "date range", "up to when", "latest data",
	)
}

// answerDataCoverage reports the first and last day with paid sales.
func (s *AIService) answerDataCoverage(restaurantID uint, question string) (*AIAskResponse, bool, error) {
	if s.repo == nil || !looksLikeDataCoverageQuestion(question) {
		return nil, false, nil
	}
	coverage, err := s.repo.SalesCoverage(restaurantID)
	if err != nil {
		return nil, false, err
	}
	if coverage.Orders == 0 || coverage.LastDate == "" {
		return &AIAskResponse{
			Answer:   "ตอนนี้ยังไม่มีรายการขายที่ปิดบิลและชำระเงินแล้วบันทึกไว้เลยครับ",
			Intent:   AIIntentAnalysis,
			Task:     AITaskRetrieveFact,
			Model:    "local-data-coverage",
			Snapshot: AISnapshot{},
		}, true, nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(
		"ข้อมูลยอดขายที่บันทึกไว้มีตั้งแต่ %s ถึง %s ครับ\n\n- วันที่มีการขาย %d วัน\n- ออเดอร์รวม %d ออเดอร์\n- ยอดขายรวม %s บาท",
		formatThaiDate(coverage.FirstDate),
		formatThaiDate(coverage.LastDate),
		coverage.Days,
		coverage.Orders,
		formatMoney(coverage.Revenue),
	))

	today := repository.BangkokNow().Format("2006-01-02")
	if coverage.LastDate < today {
		sb.WriteString(fmt.Sprintf("\n\nวันนี้ (%s) ยังไม่มีออเดอร์ที่ปิดบิล ข้อมูลล่าสุดจึงเป็นของวันที่ %s ครับ",
			formatThaiDate(today), formatThaiDate(coverage.LastDate)))
	}

	return &AIAskResponse{
		Answer:   sb.String(),
		Intent:   AIIntentAnalysis,
		Task:     AITaskRetrieveFact,
		Model:    "local-data-coverage",
		Snapshot: AISnapshot{},
	}, true, nil
}
