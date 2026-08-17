package service

import (
	"encoding/json"
	"errors"
	"strings"

	"Project-M/internal/entity"
)

func normalizeBusinessTime(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	if len(value) >= 5 {
		return value[:5]
	}
	return value
}

const (
	PermissionManageInvites            = "manage_invites"
	PermissionManageMembers            = "manage_members"
	PermissionManageRoles              = "manage_roles"
	PermissionViewAuditLog             = "view_audit_log"
	PermissionManageRestaurantSettings = "manage_restaurant_settings"
)

var granularAdministrationPermissions = []string{
	PermissionManageInvites,
	PermissionManageMembers,
	PermissionManageRoles,
	PermissionViewAuditLog,
	PermissionManageRestaurantSettings,
}

var permissionDependencies = map[string][]string{
	"update_order_status": {"view_kitchen"},
	"take_payment":        {"view_orders"},
	"manage_table":        {"view_tables"},
	"manage_inventory":    {"view_inventory"},
}

func canManageInvites(member *entity.RestaurantMember) bool {
	return memberHasPermission(member, PermissionManageInvites)
}

func canViewTeam(member *entity.RestaurantMember) bool {
	return memberHasAnyPermission(
		member,
		PermissionManageInvites,
		PermissionManageMembers,
		PermissionManageRoles,
		PermissionViewAuditLog,
	)
}

func canManageMemberWithPermission(actor, target *entity.RestaurantMember, permission string) bool {
	if actor == nil || target == nil || actor.Role == nil || target.Role == nil {
		return false
	}
	if actor.UserID == target.UserID {
		return false
	}
	if !memberHasPermission(actor, permission) {
		return false
	}

	if actor.Role.Name == "owner" {
		return target.Role.Name != "owner"
	}
	return target.Role.Name != "owner" && target.Role.Name != "manager"
}

func isOwnerOrManager(member *entity.RestaurantMember) bool {
	return member != nil && member.Role != nil && (member.Role.Name == "owner" || member.Role.Name == "manager")
}

// MemberHasPermission returns the effective permission for a membership. The
// direct member override remains an exact replacement for role permissions.
// Legacy manage_staff is expanded only for the built-in owner/manager roles so
// old tenant overrides remain usable without empowering operational/custom roles.
func MemberHasPermission(member *entity.RestaurantMember, permission string) bool {
	return memberHasPermission(member, permission)
}

func memberHasPermission(member *entity.RestaurantMember, permission string) bool {
	if member == nil || member.Role == nil {
		return false
	}
	raw := member.Role.Permissions
	if member.PermissionsOverride != nil {
		raw = *member.PermissionsOverride
	}
	if raw == "" {
		return false
	}
	if permissionJSONContains(raw, permission) {
		return true
	}
	if isGranularAdministrationPermission(permission) &&
		isOwnerOrManager(member) &&
		permissionJSONContains(raw, "manage_staff") {
		return true
	}
	return false
}

func memberHasAnyPermission(member *entity.RestaurantMember, permissions ...string) bool {
	for _, permission := range permissions {
		if memberHasPermission(member, permission) {
			return true
		}
	}
	return false
}

func isGranularAdministrationPermission(permission string) bool {
	for _, candidate := range granularAdministrationPermissions {
		if candidate == permission {
			return true
		}
	}
	return false
}

func permissionJSONContains(raw string, permission string) bool {
	var permissions []string
	if err := json.Unmarshal([]byte(raw), &permissions); err != nil {
		return false
	}
	for _, item := range permissions {
		if item == "*" || item == permission {
			return true
		}
	}
	return false
}

func permissionsWithinGrantCeiling(actor *entity.RestaurantMember, permissions []string) bool {
	for _, permission := range permissions {
		if !memberHasPermission(actor, permission) {
			return false
		}
	}
	return true
}

func roleWithinGrantCeiling(actor *entity.RestaurantMember, role *entity.Role) bool {
	if role == nil {
		return false
	}
	var permissions []string
	if err := json.Unmarshal([]byte(role.Permissions), &permissions); err != nil {
		return false
	}
	normalized, err := normalizePermissions(permissions)
	if err != nil {
		return false
	}
	return permissionsWithinGrantCeiling(actor, normalized)
}

func canGrantRole(actor *entity.RestaurantMember, role *entity.Role) bool {
	if actor == nil || role == nil || actor.Role == nil {
		return false
	}
	if role.Name == "owner" {
		return false
	}
	if actor.Role.Name != "owner" && role.Name == "manager" {
		return false
	}
	return roleWithinGrantCeiling(actor, role)
}

func canAssignMemberRole(actor *entity.RestaurantMember, role *entity.Role) bool {
	return memberHasPermission(actor, PermissionManageRoles) && canGrantRole(actor, role)
}

func canManageRole(actor *entity.RestaurantMember, role *entity.Role) bool {
	if !memberHasPermission(actor, PermissionManageRoles) || actor.Role == nil || role == nil {
		return false
	}
	if role.Name == "owner" {
		return false
	}
	return actor.Role.Name == "owner" || role.Name != "manager"
}

func assignMemberRole(member *entity.RestaurantMember, role *entity.Role) {
	member.RoleID = role.ID
	member.PermissionsOverride = nil
}

func roleAssignableToRestaurant(role *entity.Role, restaurantID uint) bool {
	return role != nil && (role.RestaurantID == nil || *role.RestaurantID == restaurantID)
}

func roleName(role *entity.Role) string {
	if role == nil {
		return ""
	}
	if strings.TrimSpace(role.DisplayName) != "" {
		return role.DisplayName
	}
	return role.Name
}

func isMembershipStatusAllowed(value string) bool {
	return value == "active" || value == "suspended" || value == "removed"
}

func sanitizeRestaurantFields(
	name string,
	branchName string,
	restaurantType string,
	address string,
	phone string,
	logo string,
	openTime string,
	closeTime string,
	tableCount int,
	serviceChargeEnabled bool,
	serviceChargeRate float64,
	vatEnabled bool,
	vatRate float64,
	promptPayName string,
	promptPayQRImage string,
	coverImage string,
) (*restaurantFields, error) {
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		return nil, errors.New("restaurant name is required")
	}
	if len([]rune(normalizedName)) > 120 {
		return nil, errors.New("restaurant name is too long")
	}

	normalizedBranchName := strings.TrimSpace(branchName)
	if normalizedBranchName == "" {
		return nil, errors.New("branch_name is required")
	}
	if len([]rune(normalizedBranchName)) > 120 {
		return nil, errors.New("branch_name is too long")
	}

	normalizedRestaurantType := strings.TrimSpace(restaurantType)
	if normalizedRestaurantType == "" {
		return nil, errors.New("restaurant_type is required")
	}
	if len([]rune(normalizedRestaurantType)) > 80 {
		return nil, errors.New("restaurant_type is too long")
	}

	normalizedPhone := strings.TrimSpace(phone)
	if normalizedPhone != "" && countDigits(normalizedPhone) < 9 {
		return nil, errors.New("phone must have at least 9 digits")
	}

	openTime = normalizeBusinessTime(openTime, "17:00")
	closeTime = normalizeBusinessTime(closeTime, "00:00")
	if !restaurantTimePattern.MatchString(openTime) || !restaurantTimePattern.MatchString(closeTime) {
		return nil, errors.New("open_time and close_time must use HH:mm")
	}

	if tableCount == 0 {
		tableCount = 12
	}
	if tableCount < 1 || tableCount > 500 {
		return nil, errors.New("table_count must be between 1 and 500")
	}
	if serviceChargeRate <= 0 {
		serviceChargeRate = 10
	}
	if serviceChargeRate > 30 {
		return nil, errors.New("service_charge_rate must be between 0 and 30")
	}
	if vatRate <= 0 {
		vatRate = 7
	}
	if vatRate > 20 {
		return nil, errors.New("vat_rate must be between 0 and 20")
	}

	return &restaurantFields{
		Name:                 normalizedName,
		BranchName:           normalizedBranchName,
		RestaurantType:       normalizedRestaurantType,
		Address:              strings.TrimSpace(address),
		Phone:                normalizedPhone,
		Logo:                 strings.TrimSpace(logo),
		OpenTime:             openTime,
		CloseTime:            closeTime,
		TableCount:           tableCount,
		ServiceChargeEnabled: serviceChargeEnabled,
		ServiceChargeRate:    serviceChargeRate,
		VATEnabled:           vatEnabled,
		VATRate:              vatRate,
		PromptPayName:        strings.TrimSpace(promptPayName),
		PromptPayQRImage:     strings.TrimSpace(promptPayQRImage),
		CoverImage:           strings.TrimSpace(coverImage),
	}, nil
}

func countDigits(value string) int {
	count := 0
	for _, ch := range value {
		if ch >= '0' && ch <= '9' {
			count++
		}
	}
	return count
}

func (s *RestaurantService) loadManagedMemberPair(actorUserID, restaurantID, memberID uint, permission string) (*entity.RestaurantMember, *entity.RestaurantMember, error) {
	actor, err := s.GetMembership(actorUserID, restaurantID)
	if err != nil {
		return nil, nil, err
	}
	if !memberHasPermission(actor, permission) {
		return nil, nil, errors.New("missing " + permission + " permission")
	}

	target, err := s.memberRepo.FindByID(memberID)
	if err != nil {
		return nil, nil, errors.New("member not found")
	}
	if target.RestaurantID != restaurantID {
		return nil, nil, errors.New("member does not belong to this restaurant")
	}

	return actor, target, nil
}
