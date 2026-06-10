package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type RoleRepository struct {
	db *gorm.DB
}

func NewRoleRepository(db *gorm.DB) *RoleRepository {
	return &RoleRepository{db: db}
}

func (r *RoleRepository) FindAll() ([]entity.Role, error) {
	var roles []entity.Role
	err := r.db.Find(&roles).Error
	return roles, err
}

func (r *RoleRepository) FindAssignableByRestaurant(restaurantID uint) ([]entity.Role, error) {
	var roles []entity.Role
	hiddenRoleIDs := r.db.
		Model(&entity.RestaurantRoleHidden{}).
		Select("role_id").
		Where("restaurant_id = ?", restaurantID)
	err := r.db.
		Where("restaurant_id = ? OR (restaurant_id IS NULL AND id NOT IN (?))", restaurantID, hiddenRoleIDs).
		Order("is_system desc, id asc").
		Find(&roles).Error
	return roles, err
}

func (r *RoleRepository) FindByID(id uint) (*entity.Role, error) {
	var role entity.Role
	if err := r.db.First(&role, id).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *RoleRepository) Update(role *entity.Role) error {
	return r.db.Save(role).Error
}

func (r *RoleRepository) Create(role *entity.Role) error {
	return r.db.Create(role).Error
}

func (r *RoleRepository) Delete(role *entity.Role) error {
	return r.db.Delete(role).Error
}

func (r *RoleRepository) CountMembers(roleID uint) (int64, error) {
	var count int64
	err := r.db.Model(&entity.RestaurantMember{}).Where("role_id = ?", roleID).Count(&count).Error
	return count, err
}

func (r *RoleRepository) CountMembersForRestaurant(roleID uint, restaurantID uint) (int64, error) {
	var count int64
	err := r.db.Model(&entity.RestaurantMember{}).
		Where("role_id = ? AND restaurant_id = ?", roleID, restaurantID).
		Count(&count).Error
	return count, err
}

func (r *RoleRepository) CountPendingInvitations(roleID uint) (int64, error) {
	var count int64
	err := r.db.Model(&entity.Invitation{}).Where("role_id = ? AND status = ?", roleID, entity.InvitationStatusPending).Count(&count).Error
	return count, err
}

func (r *RoleRepository) CountPendingInvitationsForRestaurant(roleID uint, restaurantID uint) (int64, error) {
	var count int64
	err := r.db.Model(&entity.Invitation{}).
		Where("role_id = ? AND restaurant_id = ? AND status = ?", roleID, restaurantID, entity.InvitationStatusPending).
		Count(&count).Error
	return count, err
}

func (r *RoleRepository) HideSystemRoleForRestaurant(restaurantID uint, roleID uint) error {
	hidden := &entity.RestaurantRoleHidden{RestaurantID: restaurantID, RoleID: roleID}
	return r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(hidden).Error
}

func (r *RoleRepository) IsRoleHiddenForRestaurant(restaurantID uint, roleID uint) (bool, error) {
	var count int64
	err := r.db.Model(&entity.RestaurantRoleHidden{}).
		Where("restaurant_id = ? AND role_id = ?", restaurantID, roleID).
		Count(&count).Error
	return count > 0, err
}

func (r *RoleRepository) FindByName(name string) (*entity.Role, error) {
	var role entity.Role
	if err := r.db.Where("name = ?", name).First(&role).Error; err != nil {
		return nil, err
	}
	return &role, nil
}
