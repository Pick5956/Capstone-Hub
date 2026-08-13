package service

import (
	"strings"

	"Project-M/internal/repository"
)

// Scope-less metric questions ("ยอดขายเท่าไหร่", "กำไรเท่าไหร่", "ขายกี่จาน").
//
// A bare metric question names no time window, so the assistant quietly answered
// for the default 30-day window and presented it as if that was the question. A
// person asked "how much are the sales?" would first wonder "sales over what
// period?". The fix is not to interrogate the user on every quick question, but to
// answer with the sensible default AND say out loud that a default was chosen, so
// changing the period is obvious. The window figure is real either way — this only
// adds the missing "I assumed X, tell me to change it" that makes the answer read
// as understood rather than pattern-matched.

// scopeTimeWords are any words that pin a question to a time window. When one is
// present the question already states its scope and needs no assumption note.
var scopeTimeWords = []string{
	"วันนี้", "เมื่อวาน", "วานนี้", "พรุ่งนี้", "ล่าสุด", "ที่ผ่านมา", "ย้อนหลัง",
	"สัปดาห์", "อาทิตย์", "7 วัน", "เดือน", "ไตรมาส", "ปีนี้", "ปีที่แล้ว", "ทั้งปี", "วันที่",
	"เช้า", "สาย", "เที่ยง", "บ่าย", "เย็น", "ค่ำ", "ดึก", "กลางวัน", "กลางคืน",
	"จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์",
	"มกรา", "กุมภา", "มีนา", "เมษา", "พฤษภา", "มิถุนา", "กรกฎา", "สิงหา", "กันยา", "ตุลา", "พฤศจิกา", "ธันวา",
	"week", "month", "year", "today", "yesterday", "quarter", "last ", "จนถึง",
}

// hasTimeScope reports whether the question already names a time window.
func hasTimeScope(question string) bool {
	return containsAny(strings.ToLower(question), scopeTimeWords...)
}

// isScopelessMetricQuestion is a headline-metric ask with no time window. Menu-
// or ingredient-scoped asks are excluded — "ยอดขายเมนูต้มยำ" is about one item,
// not the store-wide period figure this note is meant for.
func isScopelessMetricQuestion(question string) bool {
	n := strings.ToLower(strings.TrimSpace(question))
	if hasTimeScope(n) {
		return false
	}
	if containsAny(n, "เมนู", "จานไหน", "อันไหน", "ตัวไหน", "วัตถุดิบ") {
		return false
	}
	return containsAny(n, "ยอดขาย", "รายได้", "ยอดรวม", "กำไร", "กี่จาน", "กี่ออเดอร์", "กี่บิล", "ขายได้เท่าไหร่")
}

// todayHasNoSales is true when the current day has no closed orders yet — the
// reason a rolling window, not "today", is the safer default to lead with.
func todayHasNoSales(snapshot AISnapshot) bool {
	today := repository.BangkokNow().Format("2006-01-02")
	for _, d := range snapshot.SalesDays {
		if d.OrderDate == today && d.Orders > 0 {
			return false
		}
	}
	return true
}

// appendScopeHint adds the "I assumed the default window" note to a scope-less
// metric answer, and nothing to anything else. When today has no sales it uses
// that to explain why the rolling window was chosen — the touch that makes the
// assistant read as aware of its own assumption rather than guessing.
func appendScopeHint(question, answer string, todayEmpty bool) string {
	if !isScopelessMetricQuestion(question) {
		return answer
	}
	if todayEmpty {
		return answer + "\n\nวันนี้ยังไม่มีออเดอร์ ผมเลยสรุป " + analysisWindowLabel() +
			"ให้ก่อนนะครับ — อยากดูเดือนนี้ หรือเดือนก่อน บอกได้เลย"
	}
	return answer + "\n\nผมสรุปเป็น " + analysisWindowLabel() +
		"ให้ก่อนนะครับ — อยากดูวันนี้ เดือนนี้ หรือเดือนก่อน บอกได้เลย"
}
