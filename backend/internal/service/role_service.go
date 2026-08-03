package service

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type RoleService struct {
	roleRepo *repository.RoleRepository
}

func ProvideRoleService(roleRepo *repository.RoleRepository) *RoleService {
	return &RoleService{roleRepo: roleRepo}
}

func (s *RoleService) GetAssignableRoles(restaurantID uint) ([]entity.Role, error) {
	return s.roleRepo.FindAssignableByRestaurant(restaurantID)
}

type RoleRequest struct {
	DisplayName string   `json:"display_name"`
	Permissions []string `json:"permissions"`
}

type rolePermissionMutationKind int

const (
	rolePermissionDirect rolePermissionMutationKind = iota
	rolePermissionRestaurantOverride
)

var editablePermissionKeys = map[string]bool{
	"view_dashboard":      true,
	"manage_menu":         true,
	"view_tables":         true,
	"manage_table":        true,
	"take_order":          true,
	"view_orders":         true,
	"take_payment":        true,
	"view_kitchen":        true,
	"update_order_status": true,
	"view_inventory":      true,
	"manage_inventory":    true,
	"manage_expenses":     true,
	"view_reports":        true,
	"manage_staff":        true,
}

var deprecatedPermissionKeys = map[string]bool{
	"view_menu": true,
}

func (s *RoleService) UpdateRolePermissions(roleID uint, restaurantID uint, actorRoleName string, permissions []string) (*entity.Role, error) {
	role, err := s.roleRepo.FindByID(roleID)
	if err != nil {
		return nil, errors.New("role not found")
	}
	target, err := rolePermissionMutationTargetForRole(role, restaurantID)
	if err != nil {
		return nil, err
	}
	if target == rolePermissionRestaurantOverride {
		hidden, err := s.roleRepo.IsRoleHiddenForRestaurant(restaurantID, role.ID)
		if err != nil {
			return nil, err
		}
		if hidden {
			return nil, errors.New("role is not available for this restaurant")
		}
	}
	if !canEditRolePermissions(actorRoleName, role.Name) {
		return nil, errors.New("you do not have permission to edit this role")
	}
	normalized, err := normalizePermissions(permissions)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(normalized)
	if err != nil {
		return nil, err
	}
	role.Permissions = string(raw)
	if target == rolePermissionRestaurantOverride {
		if err := s.roleRepo.UpsertRestaurantPermissionOverride(restaurantID, role.ID, role.Permissions); err != nil {
			return nil, err
		}
	} else {
		if err := s.roleRepo.Update(role); err != nil {
			return nil, err
		}
	}
	return role, nil
}

func rolePermissionMutationTargetForRole(role *entity.Role, restaurantID uint) (rolePermissionMutationKind, error) {
	if role == nil {
		return rolePermissionDirect, errors.New("role not found")
	}
	if role.RestaurantID == nil {
		return rolePermissionRestaurantOverride, nil
	}
	if *role.RestaurantID != restaurantID {
		return rolePermissionDirect, errors.New("role does not belong to this restaurant")
	}
	return rolePermissionDirect, nil
}

func (s *RoleService) CreateCustomRole(restaurantID uint, actorRoleName string, req *RoleRequest) (*entity.Role, error) {
	if !canEditRolePermissions(actorRoleName, "custom") {
		return nil, errors.New("you do not have permission to create roles")
	}
	displayName := normalizeRoleDisplayName(req.DisplayName)
	if displayName == "" {
		return nil, errors.New("role name is required")
	}
	normalized, err := normalizePermissions(req.Permissions)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(normalized)
	if err != nil {
		return nil, err
	}
	name, err := customRoleName(restaurantID)
	if err != nil {
		return nil, err
	}
	role := &entity.Role{
		RestaurantID: &restaurantID,
		Name:         name,
		DisplayName:  displayName,
		Permissions:  string(raw),
		IsSystem:     false,
	}
	if err := s.roleRepo.Create(role); err != nil {
		return nil, err
	}
	return role, nil
}

func (s *RoleService) UpdateCustomRole(roleID uint, restaurantID uint, actorRoleName string, req *RoleRequest) (*entity.Role, error) {
	role, err := s.roleRepo.FindByID(roleID)
	if err != nil {
		return nil, errors.New("role not found")
	}
	if !roleBelongsToRestaurant(role, restaurantID) || role.IsSystem {
		return nil, errors.New("only custom roles can be edited here")
	}
	if !canEditRolePermissions(actorRoleName, role.Name) {
		return nil, errors.New("you do not have permission to edit this role")
	}
	displayName := normalizeRoleDisplayName(req.DisplayName)
	if displayName == "" {
		return nil, errors.New("role name is required")
	}
	role.DisplayName = displayName
	if err := s.roleRepo.Update(role); err != nil {
		return nil, err
	}
	return role, nil
}

func (s *RoleService) DeleteCustomRole(roleID uint, restaurantID uint, actorRoleName string) error {
	role, err := s.roleRepo.FindByID(roleID)
	if err != nil {
		return errors.New("role not found")
	}
	if !roleAssignableToRestaurant(role, restaurantID) {
		return errors.New("role does not belong to this restaurant")
	}
	if !canEditRolePermissions(actorRoleName, role.Name) {
		return errors.New("you do not have permission to delete this role")
	}
	memberCount, err := s.roleRepo.CountMembersForRestaurant(role.ID, restaurantID)
	if err != nil {
		return err
	}
	if memberCount > 0 {
		return errors.New("role is still assigned to staff")
	}
	inviteCount, err := s.roleRepo.CountPendingInvitationsForRestaurant(role.ID, restaurantID)
	if err != nil {
		return err
	}
	if inviteCount > 0 {
		return errors.New("role is used by pending invitations")
	}
	if role.RestaurantID == nil {
		return s.roleRepo.HideSystemRoleForRestaurant(restaurantID, role.ID)
	}
	return s.roleRepo.Delete(role)
}

func canEditRolePermissions(actorRoleName string, targetRoleName string) bool {
	switch actorRoleName {
	case "owner":
		return targetRoleName != "owner"
	case "manager":
		return targetRoleName != "owner" && targetRoleName != "manager"
	default:
		return false
	}
}

func roleBelongsToRestaurant(role *entity.Role, restaurantID uint) bool {
	return role != nil && role.RestaurantID != nil && *role.RestaurantID == restaurantID
}

func normalizeRoleDisplayName(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}

func customRoleName(restaurantID uint) (string, error) {
	bytes := make([]byte, 6)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("custom_%d_%s", restaurantID, hex.EncodeToString(bytes)), nil
}

func normalizePermissions(permissions []string) ([]string, error) {
	seen := map[string]bool{}
	result := make([]string, 0, len(permissions))
	for _, permission := range permissions {
		if permission == "" || deprecatedPermissionKeys[permission] || seen[permission] {
			continue
		}
		if permission == "*" {
			return nil, errors.New("wildcard permissions cannot be assigned")
		}
		if !editablePermissionKeys[permission] {
			return nil, errors.New("invalid permission")
		}
		seen[permission] = true
		result = append(result, permission)
	}
	return result, nil
}
