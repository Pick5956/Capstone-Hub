package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type RestaurantAuditLogRepository struct {
	db *gorm.DB
}

func NewRestaurantAuditLogRepository(db *gorm.DB) *RestaurantAuditLogRepository {
	return &RestaurantAuditLogRepository{db: db}
}

func (r *RestaurantAuditLogRepository) Create(log *entity.RestaurantAuditLog) error {
	return r.db.Create(log).Error
}

func (r *RestaurantAuditLogRepository) ListByRestaurant(restaurantID uint, limit int) ([]entity.RestaurantAuditLog, error) {
	if limit <= 0 {
		limit = 20
	}

	var logs []entity.RestaurantAuditLog
	err := r.db.
		Preload("ActorUser").
		Preload("TargetUser").
		Preload("Invitation").
		Where("restaurant_id = ?", restaurantID).
		Order("created_at desc").
		Limit(limit).
		Find(&logs).Error
	if err != nil {
		return nil, err
	}

	return logs, nil
}
