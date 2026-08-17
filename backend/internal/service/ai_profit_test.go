package service

import (
	"testing"
	"time"
)

func TestIsTotalProfitQuestion(t *testing.T) {
	yes := []string{
		"กำไรรวมเดือนนี้เท่าไหร่",
		"กำไรทั้งหมดกี่บาท",
		"เดือนนี้กำไรสุทธิเท่าไหร่",
		"ร้านกำไรเท่าไหร่",
		"สรุปกำไรเดือนกรกฎาคม",
		"profit เดือนนี้เท่าไหร่",
		"กำไรเดือนกรกฎาคม", // period alone is enough
	}
	for _, q := range yes {
		if !isTotalProfitQuestion(q) {
			t.Errorf("%q should be a store-wide profit question", q)
		}
	}

	no := []string{
		"เมนูไหนกำไรน้อยสุด",  // per-menu ranking
		"เมนูไหนกำไรดีสุด",    // per-menu ranking
		"กำไรน้อยสุด",         // lowest-margin menu (backstop owns this)
		"กำไรดี",              // highest-margin menu
		"เมนูกำไรสูงสุด",      // per-menu
		"margin เท่าไหร่",     // margin %, not a baht total
		"ยอดขายเดือนนี้เท่าไหร่", // sales, not profit
		"สวัสดีครับ",
	}
	for _, q := range no {
		if isTotalProfitQuestion(q) {
			t.Errorf("%q must not be routed to the total-profit flow", q)
		}
	}
}

func TestProfitPeriodDefaultsToRollingWindow(t *testing.T) {
	ref := time.Date(2026, time.August, 13, 20, 0, 0, 0, bangkokLocation())

	// No named period → last 30 days, flagged as not explicit.
	start, end, label, explicit := profitPeriod("กำไรรวมเท่าไหร่", ref)
	if explicit || label != "ช่วง 30 วันล่าสุด" {
		t.Fatalf("bare profit question should default to rolling window: %q explicit=%v", label, explicit)
	}
	if end.Sub(start) != 30*24*time.Hour {
		t.Fatalf("rolling window should span the last 30 days: %v..%v", start, end)
	}

	// A named month is used verbatim and marked explicit.
	_, _, label, explicit = profitPeriod("กำไรเดือนกรกฎาคมเท่าไหร่", ref)
	if !explicit || label != "เดือนกรกฎาคม 2569" {
		t.Fatalf("named month should win: %q explicit=%v", label, explicit)
	}
}

// "วันนี้ขายกี่จาน" used to fall through to the 30-day window because only months
// were parsed. Relative single days and specific dates must now scope correctly.
func TestProfitPeriodParsesDays(t *testing.T) {
	ref := time.Date(2026, time.August, 14, 20, 0, 0, 0, bangkokLocation())
	today := time.Date(2026, time.August, 14, 0, 0, 0, 0, bangkokLocation())

	start, end, label, explicit := profitPeriod("วันนี้ขายกี่จาน", ref)
	if !explicit || label != "วันนี้" || !start.Equal(today) || !end.Equal(today.AddDate(0, 0, 1)) {
		t.Fatalf("today wrong: %v..%v %q explicit=%v", start, end, label, explicit)
	}

	start, end, label, explicit = profitPeriod("เมื่อวานขายกี่จาน", ref)
	if !explicit || label != "เมื่อวาน" || !start.Equal(today.AddDate(0, 0, -1)) || !end.Equal(today) {
		t.Fatalf("yesterday wrong: %v..%v %q explicit=%v", start, end, label, explicit)
	}

	// A specific date still wins over everything.
	_, _, label, explicit = profitPeriod("กำไรวันที่ 2 กรกฎาคมเท่าไหร่", ref)
	if !explicit || label != "วันที่ 2 กรกฎาคม 2569" {
		t.Fatalf("specific date should win: %q explicit=%v", label, explicit)
	}
}
