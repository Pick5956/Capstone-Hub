package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type ReservationRepository struct {
	db *gorm.DB
}

func NewReservationRepository(db *gorm.DB) *ReservationRepository {
	return &ReservationRepository{db: db}
}

// List returns reservations for the archive, newest first, filtered by status
// ("" = all). Returns limit+1 rows so the caller can detect more pages.
func (r *ReservationRepository) List(restaurantID uint, status string, limit, offset int) ([]entity.Reservation, error) {
	var reservations []entity.Reservation
	query := r.db.
		Preload("Table").
		Where("restaurant_id = ?", restaurantID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	err := query.Order("id desc").Limit(limit).Offset(offset).Find(&reservations).Error
	return reservations, err
}

func (r *ReservationRepository) CountByStatus(restaurantID uint) (map[string]int64, error) {
	type row struct {
		Status string
		Count  int64
	}
	var rows []row
	err := r.db.Model(&entity.Reservation{}).
		Select("status, count(*) as count").
		Where("restaurant_id = ?", restaurantID).
		Group("status").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	counts := map[string]int64{}
	for _, item := range rows {
		counts[item.Status] = item.Count
	}
	return counts, nil
}
