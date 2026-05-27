package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
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

func tableFromRequest(repo *repository.TableRepository, restaurantID uint, req *TableRequest) (*entity.RestaurantTable, []entity.TableTag, error) {
	capacity := req.Capacity
	normalizedCapacity, err := normalizeCapacity(capacity)
	if err != nil {
		return nil, nil, err
	}
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = entity.TableStatusFree
	}
	if !isValidTableStatus(status) {
		return nil, nil, errors.New("invalid table status")
	}
	zone, zoneID, err := zoneContext(repo, restaurantID, req.ZoneID)
	if err != nil {
		return nil, nil, err
	}
	tags, err := repo.FindTags(restaurantID, req.TagIDs)
	if err != nil {
		return nil, nil, err
	}
	if len(tags) != len(uniqueUint(req.TagIDs)) {
		return nil, nil, errors.New("one or more table tags were not found")
	}
	next, err := repo.NextSequence(restaurantID, zoneID)
	if err != nil {
		return nil, nil, err
	}
	label := tableLabel(zone, next)
	return &entity.RestaurantTable{
		RestaurantID:   restaurantID,
		ZoneID:         zoneID,
		TableNumber:    label,
		DisplayLabel:   label,
		SequenceNumber: next,
		Capacity:       normalizedCapacity,
		Zone:           zoneName(zone),
		Status:         status,
		CustomerToken:  GenerateCustomerTableToken(),
	}, tags, nil
}

func isValidTableStatus(status string) bool {
	return status == entity.TableStatusFree ||
		status == entity.TableStatusOccupied ||
		status == entity.TableStatusReserved ||
		status == entity.TableStatusInactive
}

func isValidReservationPhone(phone string) bool {
	digits := 0
	for _, char := range phone {
		if char >= '0' && char <= '9' {
			digits++
		}
	}
	return digits >= 9
}

func GenerateCustomerTableToken() string {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("fallback-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

func normalizeCapacity(capacity int) (int, error) {
	if capacity == 0 {
		capacity = 2
	}
	if capacity < 1 || capacity > 50 {
		return 0, errors.New("capacity must be between 1 and 50")
	}
	return capacity, nil
}

func zoneContext(repo *repository.TableRepository, restaurantID uint, zoneID *uint) (*entity.TableZone, *uint, error) {
	if zoneID == nil || *zoneID == 0 {
		return nil, nil, nil
	}
	zone, err := repo.FindZone(restaurantID, *zoneID)
	if err != nil {
		return nil, nil, errors.New("table zone not found")
	}
	return zone, &zone.ID, nil
}

func tableLabel(zone *entity.TableZone, sequence int) string {
	if zone == nil {
		return fmt.Sprintf("T%d", sequence)
	}
	prefix := strings.TrimSpace(zone.Prefix)
	if prefix == "" {
		prefix = "Z"
	}
	return fmt.Sprintf("%s%02d", prefix, sequence)
}

func zoneName(zone *entity.TableZone) string {
	if zone == nil {
		return ""
	}
	return zone.Name
}

func zoneFromRequest(repo *repository.TableRepository, restaurantID, currentID uint, req *TableZoneRequest) (*entity.TableZone, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("zone name is required")
	}
	prefix := strings.ToUpper(strings.TrimSpace(req.Prefix))
	if prefix != "" {
		exists, err := repo.PrefixExists(restaurantID, prefix, currentID)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, errors.New("zone prefix is already used")
		}
	}
	zone := &entity.TableZone{
		RestaurantID: restaurantID,
		Name:         name,
		Prefix:       prefix,
		DisplayOrder: req.DisplayOrder,
		IsActive:     true,
	}
	if req.IsActive != nil {
		zone.IsActive = *req.IsActive
	}
	return zone, nil
}

func tagFromRequest(restaurantID uint, req *TableTagRequest) (*entity.TableTag, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("tag name is required")
	}
	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "gray"
	}
	if !validTagColor(color) {
		return nil, errors.New("invalid tag color")
	}
	tag := &entity.TableTag{
		RestaurantID: restaurantID,
		Name:         name,
		Color:        color,
		DisplayOrder: req.DisplayOrder,
		IsActive:     true,
	}
	if req.IsActive != nil {
		tag.IsActive = *req.IsActive
	}
	return tag, nil
}

func validTagColor(color string) bool {
	switch color {
	case "gray", "orange", "sky", "emerald", "amber":
		return true
	default:
		return false
	}
}

func uniqueUint(values []uint) []uint {
	seen := map[uint]bool{}
	unique := []uint{}
	for _, value := range values {
		if value == 0 || seen[value] {
			continue
		}
		seen[value] = true
		unique = append(unique, value)
	}
	return unique
}
