package service

import (
	"strings"
	"testing"

	"gorm.io/gorm"

	"Project-M/internal/entity"
)

func aiTestTables() []entity.RestaurantTable {
	return []entity.RestaurantTable{
		{Model: gorm.Model{ID: 1}, TableNumber: "A1", Capacity: 2, Zone: "ในร้าน", Status: entity.TableStatusFree},
		{Model: gorm.Model{ID: 2}, TableNumber: "A2", Capacity: 4, Zone: "ในร้าน", Status: entity.TableStatusOccupied},
		{Model: gorm.Model{ID: 3}, TableNumber: "A3", Capacity: 6, Zone: "ระเบียง", Status: entity.TableStatusFree},
		{
			Model: gorm.Model{ID: 4}, TableNumber: "A4", Capacity: 4, Zone: "ระเบียง",
			Status:          entity.TableStatusReserved,
			ReservationName: "สมชาย", ReservationPhone: "0812345678",
		},
		{Model: gorm.Model{ID: 5}, TableNumber: "A5", Capacity: 2, Status: entity.TableStatusInactive},
	}
}

// The floor sheet has to carry the counts an owner actually asks for, and the
// seats behind them — "มีโต๊ะรับ 6 คนไหม" is answered from capacity, not from a
// table count.
func TestJoyboyTableStatusBody(t *testing.T) {
	body := joyboyTableStatusBody(aiTestTables())

	for _, want := range []string{
		"total_tables=5",
		"free=2",
		"occupied=1",
		"reserved=1",
		"inactive=1",
		"free_seats_total=8", // A1 (2) + A3 (6)
	} {
		if !strings.Contains(body, want) {
			t.Errorf("sheet is missing %q:\n%s", want, body)
		}
	}

	// The free tables have to be named with their size, or "which table seats six"
	// cannot be answered from the sheet.
	if !strings.Contains(body, "A1(2 ที่นั่ง") || !strings.Contains(body, "A3(6 ที่นั่ง") {
		t.Errorf("free tables are not described with their capacity:\n%s", body)
	}
	if !strings.Contains(body, "โซนระเบียง") {
		t.Errorf("the zone is missing, so \"which zone is busy\" cannot be answered:\n%s", body)
	}

	// A closed table has to be named, not just counted. Listing only the free,
	// taken and held tables made "โต๊ะ A5 ว่างไหม" come back as "there is no such
	// table" — the model saw a name in none of the lists and concluded it did not
	// exist.
	if !strings.Contains(body, "A5") {
		t.Errorf("a closed table must still be named:\n%s", body)
	}

	// The answer is written from this sheet alone, so the "I cannot book" rule
	// has to be in it — the tool catalogue is only read by the round that picks
	// tools, and the model booked a table in prose that it never booked.
	if !strings.Contains(body, "capability=read_only") {
		t.Errorf("the read-only rule must travel with the data:\n%s", body)
	}
}

// The sheet leaves the shop and goes to a model provider. A booking holder's
// phone number answers no question the assistant is asked, so it never travels.
func TestJoyboyTableStatusNeverSendsCustomerPhone(t *testing.T) {
	body := joyboyTableStatusBody(aiTestTables())

	if strings.Contains(body, "0812345678") {
		t.Fatalf("a customer phone number reached the fact sheet:\n%s", body)
	}
	// The name is enough to say who a table is held for.
	if !strings.Contains(body, "สมชาย") {
		t.Errorf("the reservation holder's name should be reported:\n%s", body)
	}
}

// A shop with no tables set up yet is reported as such, not as "0 free" — which
// reads as a full restaurant.
func TestJoyboyTableStatusWithNoTables(t *testing.T) {
	body := joyboyTableStatusBody(nil)
	if !strings.Contains(body, "no_data") || !strings.Contains(body, "no_tables_configured") {
		t.Errorf("an empty floor must say why:\n%s", body)
	}
}
