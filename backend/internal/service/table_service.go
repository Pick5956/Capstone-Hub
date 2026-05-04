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
	TableNumber string `json:"table_number" binding:"required"`
	Capacity    int    `json:"capacity"`
	Zone        string `json:"zone"`
	Status      string `json:"status"`
}

func (s *TableService) ListTables(restaurantID uint) ([]entity.RestaurantTable, error) {
	return s.repo.ListTables(restaurantID)
}

func (s *TableService) CreateTable(restaurantID uint, req *TableRequest) (*entity.RestaurantTable, error) {
	table, err := tableFromRequest(restaurantID, req)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateTable(table); err != nil {
		return nil, err
	}
	return table, nil
}

func (s *TableService) UpdateTable(restaurantID, tableID uint, req *TableRequest) (*entity.RestaurantTable, error) {
	table, err := s.repo.FindTable(restaurantID, tableID)
	if err != nil {
		return nil, err
	}
	next, err := tableFromRequest(restaurantID, req)
	if err != nil {
		return nil, err
	}
	table.TableNumber = next.TableNumber
	table.Capacity = next.Capacity
	table.Zone = next.Zone
	table.Status = next.Status
	if err := s.repo.UpdateTable(table); err != nil {
		return nil, err
	}
	return table, nil
}

func (s *TableService) DeleteTable(restaurantID, tableID uint) error {
	table, err := s.repo.FindTable(restaurantID, tableID)
	if err != nil {
		return err
	}
	return s.repo.DeleteTable(table)
}

func tableFromRequest(restaurantID uint, req *TableRequest) (*entity.RestaurantTable, error) {
	tableNumber := strings.TrimSpace(req.TableNumber)
	if tableNumber == "" {
		return nil, errors.New("table number is required")
	}
	capacity := req.Capacity
	if capacity == 0 {
		capacity = 2
	}
	if capacity < 1 || capacity > 50 {
		return nil, errors.New("capacity must be between 1 and 50")
	}
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = entity.TableStatusFree
	}
	if status != entity.TableStatusFree && status != entity.TableStatusOccupied && status != entity.TableStatusReserved {
		return nil, errors.New("invalid table status")
	}
	return &entity.RestaurantTable{
		RestaurantID: restaurantID,
		TableNumber:  tableNumber,
		Capacity:     capacity,
		Zone:         strings.TrimSpace(req.Zone),
		Status:       status,
	}, nil
}
