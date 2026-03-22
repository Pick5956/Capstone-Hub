package service

import (
	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type RoleService struct {
	roleRepo *repository.RoleRepository
}

func ProvideRoleService(roleRepo *repository.RoleRepository) *RoleService {
	return &RoleService{roleRepo: roleRepo}
}

func (s *RoleService) GetAllRoles() ([]entity.Role, error) {
	return s.roleRepo.FindAll()
}
