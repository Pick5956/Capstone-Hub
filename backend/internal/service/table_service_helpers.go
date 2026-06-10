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
