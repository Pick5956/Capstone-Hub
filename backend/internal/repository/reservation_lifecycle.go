package repository

import (
	"errors"
	"fmt"

	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// reconcileActiveReservationsForUpdate requires the caller to hold the parent
// table row lock first. It locks every active lifecycle row, keeps the newest
// row as the canonical current reservation, and cancels older duplicates left
// by the legacy non-atomic status flow.
func reconcileActiveReservationsForUpdate(db *gorm.DB, restaurantID, tableID uint) (*entity.Reservation, error) {
	var active []entity.Reservation
	if err := db.
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("restaurant_id = ? AND table_id = ? AND status = ?", restaurantID, tableID, entity.ReservationStatusActive).
		Order("id desc").
		Find(&active).Error; err != nil {
		return nil, err
	}
	if len(active) == 0 {
		return nil, nil
	}

	canonical := active[0]
	if len(active) == 1 {
		return &canonical, nil
	}

	supersededIDs := make([]uint, 0, len(active)-1)
	for index := 1; index < len(active); index++ {
		supersededIDs = append(supersededIDs, active[index].ID)
	}
	resolvedAt := BangkokNow()
	result := db.Model(&entity.Reservation{}).
		Where(
			"restaurant_id = ? AND table_id = ? AND status = ? AND id IN ?",
			restaurantID,
			tableID,
			entity.ReservationStatusActive,
			supersededIDs,
		).
		Updates(map[string]any{
			"status":      entity.ReservationStatusCancelled,
			"resolved_at": resolvedAt,
		})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected != int64(len(supersededIDs)) {
		return nil, fmt.Errorf(
			"reconcile active reservations: updated %d superseded rows, want %d",
			result.RowsAffected,
			len(supersededIDs),
		)
	}
	return &canonical, nil
}

func resolveCanonicalActiveReservation(db *gorm.DB, restaurantID, tableID uint, status string) error {
	canonical, err := reconcileActiveReservationsForUpdate(db, restaurantID, tableID)
	if err != nil {
		return err
	}
	if canonical == nil {
		return errors.New("table has no active reservation")
	}

	resolvedAt := BangkokNow()
	result := db.Model(&entity.Reservation{}).
		Where(
			"id = ? AND restaurant_id = ? AND table_id = ? AND status = ?",
			canonical.ID,
			restaurantID,
			tableID,
			entity.ReservationStatusActive,
		).
		Updates(map[string]any{"status": status, "resolved_at": resolvedAt})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("table has no active reservation")
	}
	return nil
}
