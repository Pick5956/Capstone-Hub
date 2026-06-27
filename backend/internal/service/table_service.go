package service

import (
	"errors"
	"strings"

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
	return s.repo.ListTables(restaurantID)
}

func (s *TableService) CreateTable(restaurantID uint, req *TableRequest) (*entity.RestaurantTable, error) {
	var created *entity.RestaurantTable
	err := s.repo.Transaction(func(tx *repository.TableRepository) error {
		table, tags, err := tableFromRequest(tx, restaurantID, req)
		if err != nil {
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
	table, err := s.repo.FindTable(restaurantID, tableID)
	if err != nil {
		return nil, err
	}
	next, tags, err := tableFromRequest(s.repo, restaurantID, req)
	if err != nil {
		return nil, err
	}
	table.Capacity = next.Capacity
	table.Status = next.Status
	if table.Status != entity.TableStatusReserved {
		table.ReservationName = ""
		table.ReservationPhone = ""
	}
	if err := s.repo.UpdateTable(table); err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceTableTags(table, tags); err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, table.ID)
}

func (s *TableService) UpdateTableStatus(restaurantID, tableID uint, status string, reservationPhone string, reservationName string) (*entity.RestaurantTable, error) {
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
		table, err := tx.FindTable(restaurantID, tableID)
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

func (s *TableService) RegenerateCustomerToken(restaurantID, tableID uint) (*entity.RestaurantTable, error) {
	table, err := s.repo.FindTable(restaurantID, tableID)
	if err != nil {
		return nil, err
	}
	table.CustomerToken = GenerateCustomerTableToken()
	if err := s.repo.UpdateTable(table); err != nil {
		return nil, err
	}
	return s.repo.FindTable(restaurantID, table.ID)
}

func (s *TableService) DeleteTable(restaurantID, tableID uint) error {
	table, err := s.repo.FindTable(restaurantID, tableID)
	if err != nil {
		return err
	}
	return s.repo.DeleteTable(table)
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
			table := &entity.RestaurantTable{
				RestaurantID:   restaurantID,
				ZoneID:         zoneID,
				TableNumber:    label,
				DisplayLabel:   label,
				SequenceNumber: sequence,
				Capacity:       capacity,
				Zone:           zoneName(zone),
				Status:         status,
				CustomerToken:  GenerateCustomerTableToken(),
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
		table, err := tx.FindTable(restaurantID, tableID)
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
