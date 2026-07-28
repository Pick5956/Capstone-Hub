package repository

import (
	"Project-M/internal/entity"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type InvitationAcceptanceStore interface {
	FindInvitationByTokenForUpdate(token string) (*entity.Invitation, error)
	FindMemberByUserAndRestaurant(userID, restaurantID uint) (*entity.RestaurantMember, error)
	FindUserByID(userID uint) (*entity.User, error)
	CreateMember(member *entity.RestaurantMember) error
	UpdateMember(member *entity.RestaurantMember) error
	UpdateInvitation(invitation *entity.Invitation) error
}

type InvitationAcceptanceTransactionRunner interface {
	WithInvitationAcceptanceTransaction(func(InvitationAcceptanceStore) error) error
}

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
	return r.db.Omit(clause.Associations).Save(inv).Error
}

func (r *InvitationRepository) MarkExpiredIfPending(invitationID uint) error {
	return r.db.
		Model(&entity.Invitation{}).
		Where("id = ? AND status = ?", invitationID, entity.InvitationStatusPending).
		Update("status", entity.InvitationStatusExpired).Error
}

func (r *InvitationRepository) RevokePending(invitationID, restaurantID uint) error {
	result := r.db.
		Model(&entity.Invitation{}).
		Where(
			"id = ? AND restaurant_id = ? AND status = ?",
			invitationID,
			restaurantID,
			entity.InvitationStatusPending,
		).
		Update("status", entity.InvitationStatusRevoked)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("only pending invitations can be revoked")
	}
	return nil
}

func (r *InvitationRepository) FindByID(id uint) (*entity.Invitation, error) {
	var inv entity.Invitation
	err := r.db.
		Preload("Restaurant").
		Preload("Role").
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
		Preload("Restaurant").
		Where("restaurant_id = ? AND status = ?", restaurantID, entity.InvitationStatusPending).
		Order("created_at desc").
		Find(&invs).Error
	if err != nil {
		return nil, err
	}
	return invs, nil
}

func (r *InvitationRepository) WithInvitationAcceptanceTransaction(
	fn func(InvitationAcceptanceStore) error,
) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(&gormInvitationAcceptanceStore{db: tx})
	})
}

type gormInvitationAcceptanceStore struct {
	db *gorm.DB
}

func (s *gormInvitationAcceptanceStore) FindInvitationByTokenForUpdate(token string) (*entity.Invitation, error) {
	var invitation entity.Invitation
	err := s.db.
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Restaurant").
		Preload("Role").
		Where("token = ?", token).
		First(&invitation).Error
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

func (s *gormInvitationAcceptanceStore) FindMemberByUserAndRestaurant(userID, restaurantID uint) (*entity.RestaurantMember, error) {
	var member entity.RestaurantMember
	err := s.db.
		Preload("Role").
		Preload("Restaurant").
		Preload("User").
		Where("user_id = ? AND restaurant_id = ?", userID, restaurantID).
		First(&member).Error
	if err != nil {
		return nil, err
	}
	if err := applyEffectiveRolePermissions(s.db, restaurantID, member.Role); err != nil {
		return nil, err
	}
	return &member, nil
}

func (s *gormInvitationAcceptanceStore) FindUserByID(userID uint) (*entity.User, error) {
	var user entity.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *gormInvitationAcceptanceStore) CreateMember(member *entity.RestaurantMember) error {
	return s.db.Omit(clause.Associations).Create(member).Error
}

func (s *gormInvitationAcceptanceStore) UpdateMember(member *entity.RestaurantMember) error {
	return s.db.Omit(clause.Associations).Save(member).Error
}

func (s *gormInvitationAcceptanceStore) UpdateInvitation(invitation *entity.Invitation) error {
	return s.db.Omit(clause.Associations).Save(invitation).Error
}
