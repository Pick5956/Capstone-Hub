package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type InvitationRepository struct {
	db *gorm.DB
}

func NewInvitationRepository(db *gorm.DB) *InvitationRepository {
	return &InvitationRepository{db: db}
}

func (r *InvitationRepository) Create(inv *entity.Invitation) error {
	return r.db.Create(inv).Error
}

func (r *InvitationRepository) Update(inv *entity.Invitation) error {
	return r.db.Save(inv).Error
}

func (r *InvitationRepository) FindByID(id uint) (*entity.Invitation, error) {
	var inv entity.Invitation
	err := r.db.
		Preload("Restaurant").
		Preload("Role").
		Preload("InvitedBy").
		First(&inv, id).Error
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *InvitationRepository) FindByToken(token string) (*entity.Invitation, error) {
	var inv entity.Invitation
	err := r.db.
		Preload("Restaurant").
		Preload("Role").
		Preload("InvitedBy").
		Where("token = ?", token).
		First(&inv).Error
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

// ListPendingByRestaurant lists pending invitations of a restaurant for owner UI.
func (r *InvitationRepository) ListPendingByRestaurant(restaurantID uint) ([]entity.Invitation, error) {
	var invs []entity.Invitation
	err := r.db.
		Preload("Role").
		Preload("InvitedBy").
		Where("restaurant_id = ? AND status = ?", restaurantID, entity.InvitationStatusPending).
		Order("created_at desc").
		Find(&invs).Error
	if err != nil {
		return nil, err
	}
	return invs, nil
}
