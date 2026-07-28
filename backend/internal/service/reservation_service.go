package service

import (
	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type ReservationService struct {
	repo *repository.ReservationRepository
}

func ProvideReservationService(repo *repository.ReservationRepository) *ReservationService {
	return &ReservationService{repo: repo}
}

type ReservationListResult struct {
	Reservations []entity.Reservation
	HasMore      bool
	NextOffset   int
	Counts       map[string]int64
}

// ListReservations returns the reservation history, newest first. status ""
// returns all outcomes; otherwise it filters to active/seated/cancelled.
func (s *ReservationService) ListReservations(restaurantID uint, status string, limit, offset int) (*ReservationListResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if status != "" && status != entity.ReservationStatusActive &&
		status != entity.ReservationStatusSeated && status != entity.ReservationStatusCancelled {
		status = ""
	}

	rows, err := s.repo.List(restaurantID, status, limit+1, offset)
	if err != nil {
		return nil, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	counts, err := s.repo.CountByStatus(restaurantID)
	if err != nil {
		return nil, err
	}
	return &ReservationListResult{
		Reservations: rows,
		HasMore:      hasMore,
		NextOffset:   offset + len(rows),
		Counts:       counts,
	}, nil
}
