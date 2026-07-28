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

func (r *ReservationRepository) Transaction(fn func(tx *ReservationRepository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(&ReservationRepository{db: tx})
	})
}

func (r *ReservationRepository) Create(reservation *entity.Reservation) error {
	return r.db.Create(reservation).Error
}

// FindActiveByTable returns the reservation currently holding the given table.
func (r *ReservationRepository) FindActiveByTable(restaurantID, tableID uint) (*entity.Reservation, error) {
	var reservation entity.Reservation
	err := r.db.
		Where("restaurant_id = ? AND table_id = ? AND status = ?", restaurantID, tableID, entity.ReservationStatusActive).
		Order("id desc").
		First(&reservation).Error
	if err != nil {
		return nil, err
	}
	return &reservation, nil
}

func (r *ReservationRepository) Save(reservation *entity.Reservation) error {
	return r.db.Save(reservation).Error
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
