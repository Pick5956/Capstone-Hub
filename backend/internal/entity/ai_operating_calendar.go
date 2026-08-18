package entity

import "gorm.io/gorm"

// AIOperatingCalendarRule is the AI feature's own record of when a restaurant is
// closed, used by the sales forecast. It is deliberately kept out of the shared
// Restaurant entity so the AI feature owns its schema and migrations outright; it
// links by restaurant_id only. If the restaurant settings later grow a first-class
// operating schedule, these rules can be migrated there without touching callers,
// because the forecast reads them through an isOpen() abstraction.
//
// RuleType is one of:
//   - "weekly_closed": the shop is closed every <Weekday> (0=Sunday..6=Saturday)
//   - "date_closed":   the shop is closed on <Date> (a one-off / holiday)
//   - "date_open":     the shop IS open on <Date>, overriding a weekly/holiday rule
type AIOperatingCalendarRule struct {
	gorm.Model
	RestaurantID uint   `json:"restaurant_id" gorm:"index;not null"`
	RuleType     string `json:"rule_type" gorm:"size:20;not null"`
	Weekday      *int   `json:"weekday"`         // set for weekly_closed
	Date         string `json:"date" gorm:"size:10"` // "YYYY-MM-DD" for date rules
}
