package service

import (
	"errors"
	"strings"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type TableService struct {
	repo *repository.TableRepository
}

func ProvideTableService(repo *repository.TableRepository) *TableService {
	return &TableService{repo: repo}
}

type TableRequest struct {
	ZoneID   *uint  `json:"zone_id"`
	Capacity int    `json:"capacity"`
	Status   string `json:"status"`
	TagIDs   []uint `json:"tag_ids"`
}

type BulkCreateTablesRequest struct {
	ZoneID   *uint  `json:"zone_id"`
	Count    int    `json:"count" binding:"required"`
	Capacity int    `json:"capacity"`
	Status   string `json:"status"`
	TagIDs   []uint `json:"tag_ids"`
}

type MoveTableZoneRequest struct {
	ZoneID *uint `json:"zone_id"`
}

type TableZoneRequest struct {
	Name         string `json:"name" binding:"required"`
	Prefix       string `json:"prefix"`
	DisplayOrder int    `json:"display_order"`
	IsActive     *bool  `json:"is_active"`
}

type TableTagRequest struct {
	Name         string `json:"name" binding:"required"`
	Color        string `json:"color"`
	DisplayOrder int    `json:"display_order"`
	IsActive     *bool  `json:"is_active"`
}

func (s *TableService) ListTables(restaurantID uint) ([]entity.RestaurantTable, error) {
	tables, err := s.repo.ListTables(restaurantID)
	if err != nil {
		return nil, err
	}
	// A failure to look up bookings must not cost the floor its table map: the
	// reminder is an extra on the card, and losing it is far cheaper than
	// losing the ability to open a table.
	upcoming, err := s.repo.UpcomingReservationsByTable(restaurantID, repository.BangkokNow())
	if err != nil {
		return tables, nil
	}
	for index := range tables {
		reservation, ok := upcoming[tables[index].ID]
		if !ok {
			continue
		}
		tables[index].UpcomingReservationAt = reservation.ReservedFor
		tables[index].UpcomingReservationName = reservation.Name
	}
	return tables, nil
}

func (s *TableService) CreateTable(restaurantID uint, req *TableRequest) (*entity.RestaurantTable, error) {
	var created *entity.RestaurantTable
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, tags, err := tableFromRequest(tx, restaurantID, req)
		if err != nil {
			return err
		}
		if err := validateMetadataTableStatus(entity.TableStatusFree, table.Status); err != nil {
			return err
		}
		if err := tx.CreateTable(table); err != nil {
			return err
		}
		if err := tx.ReplaceTableTags(table, tags); err != nil {
			return err
		}
		created = table
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, created.ID)
}

func (s *TableService) UpdateTable(restaurantID, tableID uint, req *TableRequest) (*entity.RestaurantTable, error) {
	var updatedID uint
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		next, tags, err := tableFromRequest(tx, restaurantID, req)
		if err != nil {
			return err
		}
		if err := validateMetadataTableStatus(table.Status, next.Status); err != nil {
			return err
		}
		hasOpenOrder, err := tx.HasOpenOrderForTable(restaurantID, tableID)
		if err != nil {
			return err
		}
		applyTableMetadataUpdate(table, next)
		if hasOpenOrder && table.Status != entity.TableStatusOccupied {
			return errors.New("table has an open order")
		}
		if err := tx.UpdateTable(table); err != nil {
			return err
		}
		if err := tx.ReplaceTableTags(table, tags); err != nil {
			return err
		}
		updatedID = table.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, updatedID)
}

func (s *TableService) UpdateTableStatus(restaurantID, userID, tableID uint, status string, reservationPhone string, reservationName string) (*entity.RestaurantTable, error) {
	status = strings.TrimSpace(status)
	if !isValidTableStatus(status) {
		return nil, errors.New("invalid table status")
	}
	reservationPhone = strings.TrimSpace(reservationPhone)
	reservationName = strings.TrimSpace(reservationName)
	if status == entity.TableStatusReserved && !isValidReservationPhone(reservationPhone) {
		return nil, errors.New("reservation phone is required")
	}
	var updatedID uint
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		hasOpenOrder, err := tx.HasOpenOrderForTable(restaurantID, tableID)
		if err != nil {
			return err
		}
		if hasOpenOrder && status != entity.TableStatusOccupied {
			return errors.New("table has an open order")
		}
		wasReserved := table.Status == entity.TableStatusReserved
		activeReservation, err := findActiveReservation(tx, restaurantID, tableID)
		if err != nil {
			return err
		}
		if status == entity.TableStatusOccupied {
			if wasReserved || activeReservation != nil {
				return errors.New("reservation seating requires opening an order")
			}
			if !hasOpenOrder {
				return errors.New("table occupation requires opening an order")
			}
		}
		if status == entity.TableStatusReserved {
			if activeReservation == nil {
				activeReservation = reservationForTable(table, userID, reservationPhone, reservationName)
				if err := tx.CreateReservation(activeReservation); err != nil {
					return err
				}
			}
			activeReservation.Name = reservationName
			activeReservation.Phone = reservationPhone
			if err := tx.UpdateReservation(activeReservation); err != nil {
				return err
			}
		} else if wasReserved || activeReservation != nil {
			if activeReservation == nil {
				activeReservation = reservationForTable(table, userID, table.ReservationPhone, table.ReservationName)
				if err := tx.CreateReservation(activeReservation); err != nil {
					return err
				}
			}
			if err := tx.ResolveActiveReservation(restaurantID, tableID, entity.ReservationStatusCancelled); err != nil {
				return err
			}
		}
		table.Status = status
		if status == entity.TableStatusReserved {
			table.ReservationName = reservationName
			table.ReservationPhone = reservationPhone
		} else {
			table.ReservationName = ""
			table.ReservationPhone = ""
		}
		if err := tx.UpdateTable(table); err != nil {
			return err
		}
		updatedID = table.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, updatedID)
}

// ReserveTable books a table. With reservedFor nil it holds the table now: the
// table switches to `reserved` and stops taking orders. With reservedFor set it
// records a booking for later and deliberately leaves the table alone, so the
// floor can keep selling it until the guests actually turn up. See the field
// comment on entity.Reservation.ReservedFor for why.
func (s *TableService) ReserveTable(restaurantID, userID, tableID uint, phone, name string, guestCount int, reservedFor *time.Time) (*entity.RestaurantTable, error) {
	phone = strings.TrimSpace(phone)
	name = strings.TrimSpace(name)
	if !isValidReservationPhone(phone) {
		return nil, errors.New("reservation phone is required")
	}
	guestCount = normalizeReservationGuestCount(guestCount)
	if reservedFor != nil {
		return s.scheduleReservation(restaurantID, userID, tableID, phone, name, guestCount, *reservedFor)
	}
	var updatedID uint
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		if err := validateTableCanBeReserved(table.Status); err != nil {
			return err
		}
		activeReservation, err := findActiveReservation(tx, restaurantID, tableID)
		if err != nil {
			return err
		}
		hasOpenOrder, err := tx.HasOpenOrderForTable(restaurantID, tableID)
		if err != nil {
			return err
		}
		if hasOpenOrder {
			return errors.New("table has an open order")
		}
		table.Status = entity.TableStatusReserved
		table.ReservationName = name
		table.ReservationPhone = phone
		if err := tx.UpdateTable(table); err != nil {
			return err
		}
		reservation := reservationForTable(table, userID, phone, name)
		if activeReservation == nil {
			if err := tx.CreateReservation(reservation); err != nil {
				return err
			}
		} else {
			activeReservation.TableLabel = reservation.TableLabel
			activeReservation.Name = reservation.Name
			activeReservation.Phone = reservation.Phone
			activeReservation.ReservedByUserID = reservation.ReservedByUserID
			activeReservation.ResolvedAt = nil
			if err := tx.UpdateReservation(activeReservation); err != nil {
				return err
			}
		}
		updatedID = table.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, updatedID)
}

// scheduleReservation records a booking for later without touching the table.
//
// It deliberately skips both guards the hold path applies. The `free`-only check
// is wrong here because a table with guests on it right now is exactly the table
// you want to book for tonight, and the open-order check is wrong for the same
// reason. Nothing about this row stops the floor selling the table meanwhile;
// it is a note with a time on it.
func (s *TableService) scheduleReservation(restaurantID, userID, tableID uint, phone, name string, guestCount int, reservedFor time.Time) (*entity.RestaurantTable, error) {
	var updatedID uint
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		if table.Status == entity.TableStatusInactive {
			return errors.New("table is inactive")
		}
		reservation := reservationForTable(table, userID, phone, name)
		reservation.GuestCount = guestCount
		reservation.ReservedFor = &reservedFor
		// Always a new row, never a reuse of the table's open hold: one table can
		// carry several bookings at different times, and folding them into one
		// another would silently overwrite somebody's booking.
		if err := tx.CreateReservation(reservation); err != nil {
			return err
		}
		updatedID = table.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, updatedID)
}

// CancelReservation frees a reserved table and marks its reservation cancelled.
func (s *TableService) CancelReservation(restaurantID, userID, tableID uint) (*entity.RestaurantTable, error) {
	return s.releaseReservedTable(restaurantID, userID, tableID, entity.ReservationStatusCancelled)
}

func (s *TableService) releaseReservedTable(restaurantID, userID, tableID uint, outcome string) (*entity.RestaurantTable, error) {
	var updatedID uint
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		hasOpenOrder, err := tx.HasOpenOrderForTable(restaurantID, tableID)
		if err != nil {
			return err
		}
		activeReservation, err := findActiveReservation(tx, restaurantID, tableID)
		if err != nil {
			return err
		}
		if table.Status == entity.TableStatusReserved {
			if err := validateReservedTableRelease(table.Status, hasOpenOrder); err != nil {
				return err
			}
		} else {
			if hasOpenOrder {
				return errors.New("table has an open order")
			}
			if activeReservation == nil {
				return errors.New("table is not reserved")
			}
		}
		if activeReservation == nil {
			activeReservation = reservationForTable(table, userID, table.ReservationPhone, table.ReservationName)
			if err := tx.CreateReservation(activeReservation); err != nil {
				return err
			}
		}
		table.Status = entity.TableStatusFree
		table.ReservationName = ""
		table.ReservationPhone = ""
		if err := tx.UpdateTable(table); err != nil {
			return err
		}
		updatedID = table.ID
		return tx.ResolveActiveReservation(restaurantID, tableID, outcome)
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, updatedID)
}

func (s *TableService) RegenerateCustomerToken(restaurantID, tableID uint) (*entity.RestaurantTable, error) {
	var updatedID uint
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		customerToken, err := GenerateCustomerTableToken()
		if err != nil {
			return err
		}
		table.CustomerToken = customerToken
		if err := tx.UpdateTable(table); err != nil {
			return err
		}
		updatedID = table.ID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, updatedID)
}

func (s *TableService) DeleteTable(restaurantID, tableID uint) error {
	return s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		hasActiveReservation, err := tx.HasActiveReservation(restaurantID, tableID)
		if err != nil {
			return err
		}
		if table.Status == entity.TableStatusReserved || hasActiveReservation {
			return errors.New("table has an active reservation; cancel it first")
		}
		referenced, err := tx.HasAnyOrderForTable(restaurantID, tableID)
		if err != nil {
			return err
		}
		if referenced {
			return errors.New("table has order history; mark it inactive instead")
		}
		return tx.DeleteTable(table)
	})
}

func findActiveReservation(tx *repository.TableRepository, restaurantID, tableID uint) (*entity.Reservation, error) {
	return tx.ReconcileActiveReservationsForUpdate(restaurantID, tableID)
}

func reservationForTable(table *entity.RestaurantTable, userID uint, phone, name string) *entity.Reservation {
	label := table.DisplayLabel
	if strings.TrimSpace(label) == "" {
		label = table.TableNumber
	}
	return &entity.Reservation{
		RestaurantID:     table.RestaurantID,
		TableID:          table.ID,
		TableLabel:       label,
		Name:             name,
		Phone:            phone,
		Status:           entity.ReservationStatusActive,
		ReservedByUserID: userID,
	}
}

func (s *TableService) BulkCreateTables(restaurantID uint, req *BulkCreateTablesRequest) ([]entity.RestaurantTable, error) {
	count := req.Count
	if count < 1 || count > 200 {
		return nil, errors.New("count must be between 1 and 200")
	}
	capacity, err := normalizeCapacity(req.Capacity)
	if err != nil {
		return nil, err
	}
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = entity.TableStatusFree
	}
	if !isValidTableStatus(status) {
		return nil, errors.New("invalid table status")
	}
	if err := validateMetadataTableStatus(entity.TableStatusFree, status); err != nil {
		return nil, err
	}
	var created []entity.RestaurantTable
	err = s.repo.Transaction(func(tx *repository.TableRepository) error {
		zone, zoneID, err := zoneContext(tx, restaurantID, req.ZoneID)
		if err != nil {
			return err
		}
		tags, err := tx.FindTags(restaurantID, req.TagIDs)
		if err != nil {
			return err
		}
		if len(tags) != len(uniqueUint(req.TagIDs)) {
			return errors.New("one or more table tags were not found")
		}
		next, err := tx.NextSequence(restaurantID, zoneID)
		if err != nil {
			return err
		}
		for i := 0; i < count; i++ {
			sequence := next + i
			label := tableLabel(zone, sequence)
			customerToken, err := GenerateCustomerTableToken()
			if err != nil {
				return err
			}
			table := &entity.RestaurantTable{
				RestaurantID:   restaurantID,
				ZoneID:         zoneID,
				TableNumber:    label,
				DisplayLabel:   label,
				SequenceNumber: sequence,
				Capacity:       capacity,
				Zone:           zoneName(zone),
				Status:         status,
				CustomerToken:  customerToken,
			}
			if err := tx.CreateTable(table); err != nil {
				return err
			}
			if err := tx.ReplaceTableTags(table, tags); err != nil {
				return err
			}
			created = append(created, *table)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.ListTables(restaurantID)
}

func (s *TableService) MoveTableZone(restaurantID, tableID uint, req *MoveTableZoneRequest) (*entity.RestaurantTable, error) {
	var moved *entity.RestaurantTable
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, err := tx.FindTableForUpdate(restaurantID, tableID)
		if err != nil {
			return err
		}
		zone, zoneID, err := zoneContext(tx, restaurantID, req.ZoneID)
		if err != nil {
			return err
		}
		next, err := tx.NextSequence(restaurantID, zoneID)
		if err != nil {
			return err
		}
		label := tableLabel(zone, next)
		table.ZoneID = zoneID
		table.Zone = zoneName(zone)
		table.SequenceNumber = next
		table.DisplayLabel = label
		table.TableNumber = label
		if err := tx.UpdateTable(table); err != nil {
			return err
		}
		moved = table
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, moved.ID)
}

func (s *TableService) ListZones(restaurantID uint) ([]entity.TableZone, error) {
	return s.repo.ListZones(restaurantID)
}

func (s *TableService) CreateZone(restaurantID uint, req *TableZoneRequest) (*entity.TableZone, error) {
	zone, err := zoneFromRequest(s.repo, restaurantID, 0, req)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateZone(zone); err != nil {
		return nil, err
	}
	return zone, nil
}

func (s *TableService) UpdateZone(restaurantID, zoneID uint, req *TableZoneRequest) (*entity.TableZone, error) {
	var updated *entity.TableZone
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		zone, err := tx.FindZone(restaurantID, zoneID)
		if err != nil {
			return err
		}
		next, err := zoneFromRequest(tx, restaurantID, zoneID, req)
		if err != nil {
			return err
		}
		prefixChanged := strings.TrimSpace(zone.Prefix) != strings.TrimSpace(next.Prefix)
		nameChanged := zone.Name != next.Name
		zone.Name = next.Name
		zone.Prefix = next.Prefix
		zone.DisplayOrder = next.DisplayOrder
		zone.IsActive = next.IsActive
		if err := tx.UpdateZone(zone); err != nil {
			return err
		}
		if prefixChanged || nameChanged {
			tables, err := tx.ListTablesInZone(restaurantID, zone.ID)
			if err != nil {
				return err
			}
			for i := range tables {
				tables[i].Zone = zone.Name
				if prefixChanged {
					label := tableLabel(zone, tables[i].SequenceNumber)
					tables[i].TableNumber = label
					tables[i].DisplayLabel = label
				}
				if err := tx.UpdateTable(&tables[i]); err != nil {
					return err
				}
			}
		}
		updated = zone
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (s *TableService) DeleteZone(restaurantID, zoneID uint) error {
	zone, err := s.repo.FindZone(restaurantID, zoneID)
	if err != nil {
		return err
	}
	count, err := s.repo.CountTablesInZone(restaurantID, zoneID)
	if err != nil {
		return err
	}
	if count > 0 {
		return errors.New("cannot delete a zone that still has tables")
	}
	return s.repo.DeleteZone(zone)
}

func (s *TableService) ListTags(restaurantID uint) ([]entity.TableTag, error) {
	return s.repo.ListTags(restaurantID)
}

func (s *TableService) CreateTag(restaurantID uint, req *TableTagRequest) (*entity.TableTag, error) {
	tag, err := tagFromRequest(restaurantID, req)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateTag(tag); err != nil {
		return nil, err
	}
	return tag, nil
}

func (s *TableService) UpdateTag(restaurantID, tagID uint, req *TableTagRequest) (*entity.TableTag, error) {
	tag, err := s.repo.FindTag(restaurantID, tagID)
	if err != nil {
		return nil, err
	}
	next, err := tagFromRequest(restaurantID, req)
	if err != nil {
		return nil, err
	}
	tag.Name = next.Name
	tag.Color = next.Color
	tag.DisplayOrder = next.DisplayOrder
	tag.IsActive = next.IsActive
	if err := s.repo.UpdateTag(tag); err != nil {
		return nil, err
	}
	return tag, nil
}

func (s *TableService) DeleteTag(restaurantID, tagID uint) error {
	tag, err := s.repo.FindTag(restaurantID, tagID)
	if err != nil {
		return err
	}
	return s.repo.DeleteTag(tag)
}
