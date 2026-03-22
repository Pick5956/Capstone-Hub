package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
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
