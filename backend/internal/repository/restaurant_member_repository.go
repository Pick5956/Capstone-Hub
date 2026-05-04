package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type RestaurantMemberRepository struct {
	db *gorm.DB
}

func NewRestaurantMemberRepository(db *gorm.DB) *RestaurantMemberRepository {
	return &RestaurantMemberRepository{db: db}
}

func (r *RestaurantMemberRepository) Create(member *entity.RestaurantMember) error {
	return r.db.Create(member).Error
}

func (r *RestaurantMemberRepository) Update(member *entity.RestaurantMember) error {
	return r.db.Omit(clause.Associations).Save(member).Error
}

func (r *RestaurantMemberRepository) FindByID(id uint) (*entity.RestaurantMember, error) {
	var member entity.RestaurantMember
	err := r.db.
		Preload("Role").
		Preload("Restaurant").
		Preload("User").
		First(&member, id).Error
	if err != nil {
		return nil, err
	}
	return &member, nil
}

func (r *RestaurantMemberRepository) FindByUserAndRestaurant(userID, restaurantID uint) (*entity.RestaurantMember, error) {
	var member entity.RestaurantMember
	err := r.db.
		Preload("Role").
		Preload("Restaurant").
		Where("user_id = ? AND restaurant_id = ?", userID, restaurantID).
		First(&member).Error
	if err != nil {
		return nil, err
	}
	return &member, nil
}

// FindActiveByUser returns all active memberships for a user, with restaurant + role preloaded.
func (r *RestaurantMemberRepository) FindActiveByUser(userID uint) ([]entity.RestaurantMember, error) {
	var members []entity.RestaurantMember
	err := r.db.
		Preload("Role").
		Preload("Restaurant").
		Where("user_id = ? AND status = ?", userID, "active").
		Order("joined_at desc").
		Find(&members).Error
	if err != nil {
		return nil, err
	}
	return members, nil
}

// FindActiveByRestaurant lists active members of a restaurant.
func (r *RestaurantMemberRepository) FindActiveByRestaurant(restaurantID uint) ([]entity.RestaurantMember, error) {
	var members []entity.RestaurantMember
	err := r.db.
		Preload("Role").
		Preload("User").
		Where("restaurant_id = ? AND status = ?", restaurantID, "active").
		Order("joined_at asc").
		Find(&members).Error
	if err != nil {
		return nil, err
	}
	return members, nil
}

func (r *RestaurantMemberRepository) FindAllByRestaurant(restaurantID uint) ([]entity.RestaurantMember, error) {
	var members []entity.RestaurantMember
	err := r.db.
		Preload("Role").
		Preload("User").
		Where("restaurant_id = ?", restaurantID).
		Order("joined_at asc").
		Find(&members).Error
	if err != nil {
		return nil, err
	}
	return members, nil
}
