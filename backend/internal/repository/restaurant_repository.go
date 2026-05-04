package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type RestaurantRepository struct {
	db *gorm.DB
}

func NewRestaurantRepository(db *gorm.DB) *RestaurantRepository {
	return &RestaurantRepository{db: db}
}

func (r *RestaurantRepository) Create(restaurant *entity.Restaurant) error {
	return r.db.Create(restaurant).Error
}

func (r *RestaurantRepository) FindByID(id uint) (*entity.Restaurant, error) {
	var restaurant entity.Restaurant
	if err := r.db.First(&restaurant, id).Error; err != nil {
		return nil, err
	}
	return &restaurant, nil
}

func (r *RestaurantRepository) Update(restaurant *entity.Restaurant) error {
	return r.db.Save(restaurant).Error
}
