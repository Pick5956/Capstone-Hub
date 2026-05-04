package service

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

const (
	DefaultOwnerRoleName = "owner"
)

var restaurantTimePattern = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

type RestaurantService struct {
	restaurantRepo *repository.RestaurantRepository
	memberRepo     *repository.RestaurantMemberRepository
	roleRepo       *repository.RoleRepository
	auditRepo      *repository.RestaurantAuditLogRepository
}

func ProvideRestaurantService(
	restaurantRepo *repository.RestaurantRepository,
	memberRepo *repository.RestaurantMemberRepository,
	roleRepo *repository.RoleRepository,
	auditRepo *repository.RestaurantAuditLogRepository,
) *RestaurantService {
	return &RestaurantService{
		restaurantRepo: restaurantRepo,
		memberRepo:     memberRepo,
		roleRepo:       roleRepo,
		auditRepo:      auditRepo,
	}
}

type CreateRestaurantRequest struct {
	Name           string `json:"name" binding:"required"`
	BranchName     string `json:"branch_name" binding:"required"`
	RestaurantType string `json:"restaurant_type" binding:"required"`
	Address        string `json:"address"`
	Phone          string `json:"phone"`
	Logo           string `json:"logo"`
	OpenTime       string `json:"open_time"`
	CloseTime      string `json:"close_time"`
	TableCount     int    `json:"table_count"`
}

type UpdateRestaurantRequest struct {
	Name           string `json:"name" binding:"required"`
	BranchName     string `json:"branch_name" binding:"required"`
	RestaurantType string `json:"restaurant_type" binding:"required"`
	Address        string `json:"address"`
	Phone          string `json:"phone"`
	Logo           string `json:"logo"`
	OpenTime       string `json:"open_time"`
	CloseTime      string `json:"close_time"`
	TableCount     int    `json:"table_count"`
}

type restaurantFields struct {
	Name           string
	BranchName     string
	RestaurantType string
	Address        string
	Phone          string
	Logo           string
	OpenTime       string
	CloseTime      string
	TableCount     int
}

// CreateRestaurant creates a restaurant and adds the creator as the owner member.
func (s *RestaurantService) CreateRestaurant(userID uint, req *CreateRestaurantRequest) (*entity.Restaurant, *entity.RestaurantMember, error) {
	fields, err := sanitizeRestaurantFields(
		req.Name,
		req.BranchName,
		req.RestaurantType,
		req.Address,
		req.Phone,
		req.Logo,
		req.OpenTime,
		req.CloseTime,
		req.TableCount,
	)
	if err != nil {
		return nil, nil, err
	}

	ownerRole, err := s.roleRepo.FindByName(DefaultOwnerRoleName)
	if err != nil {
		return nil, nil, errors.New("owner role is not configured")
	}

	restaurant := &entity.Restaurant{
		Name:           fields.Name,
		BranchName:     fields.BranchName,
		RestaurantType: fields.RestaurantType,
		Address:        fields.Address,
		Phone:          fields.Phone,
		Logo:           fields.Logo,
		OpenTime:       fields.OpenTime,
		CloseTime:      fields.CloseTime,
		TableCount:     fields.TableCount,
		OwnerID:        userID,
	}
	if err := s.restaurantRepo.Create(restaurant); err != nil {
		return nil, nil, err
	}

	member := &entity.RestaurantMember{
		UserID:       userID,
		RestaurantID: restaurant.ID,
		RoleID:       ownerRole.ID,
		Status:       "active",
		JoinedAt:     time.Now(),
	}
	if err := s.memberRepo.Create(member); err != nil {
		return nil, nil, err
	}

	// reload with relationships for response
	loaded, err := s.memberRepo.FindByUserAndRestaurant(userID, restaurant.ID)
	if err == nil {
		member = loaded
	}

	return restaurant, member, nil
}

func (s *RestaurantService) ListMyMemberships(userID uint) ([]entity.RestaurantMember, error) {
	members, err := s.memberRepo.FindActiveByUser(userID)
	if err != nil {
		return nil, err
	}
	return members, nil
}

func (s *RestaurantService) GetMembership(userID, restaurantID uint) (*entity.RestaurantMember, error) {
	member, err := s.memberRepo.FindByUserAndRestaurant(userID, restaurantID)
	if err != nil {
		return nil, err
	}
	if member.Status != "active" {
		return nil, errors.New("membership is not active")
	}
	return member, nil
}

func (s *RestaurantService) ListMembers(restaurantID uint) ([]entity.RestaurantMember, error) {
	return s.ListMembersWithStatus(restaurantID, false)
}

func (s *RestaurantService) ListMembersWithStatus(restaurantID uint, includeInactive bool) ([]entity.RestaurantMember, error) {
	var (
		members []entity.RestaurantMember
		err     error
	)

	if includeInactive {
		members, err = s.memberRepo.FindAllByRestaurant(restaurantID)
	} else {
		members, err = s.memberRepo.FindActiveByRestaurant(restaurantID)
	}
	if err != nil {
		return nil, err
	}
	return members, nil
}

func (s *RestaurantService) UpdateMemberStatus(actorUserID, restaurantID, memberID uint, nextStatus string) (*entity.RestaurantMember, error) {
	if !isMembershipStatusAllowed(nextStatus) {
		return nil, errors.New("invalid member status")
	}

	actor, target, err := s.loadManagedMemberPair(actorUserID, restaurantID, memberID)
	if err != nil {
		return nil, err
	}
	if !canManageMember(actor, target) {
		return nil, errors.New("you do not have permission to manage this member")
	}

	if target.Status == nextStatus {
		return target, nil
	}

	previousStatus := target.Status
	target.Status = nextStatus
	if err := s.memberRepo.Update(target); err != nil {
		return nil, err
	}

	updated, err := s.memberRepo.FindByID(target.ID)
	if err != nil {
		return nil, err
	}

	actorID := actor.UserID
	targetUserID := updated.UserID
	writeAuditEvent(
		s.auditRepo,
		restaurantID,
		entity.AuditActionMemberStatusChanged,
		&actorID,
		&targetUserID,
		nil,
		map[string]any{
			"from_status": previousStatus,
			"to_status":   nextStatus,
			"role_name":   roleName(updated.Role),
		},
	)

	return updated, nil
}

func (s *RestaurantService) UpdateMemberRole(actorUserID, restaurantID, memberID, roleID uint) (*entity.RestaurantMember, error) {
	actor, target, err := s.loadManagedMemberPair(actorUserID, restaurantID, memberID)
	if err != nil {
		return nil, err
	}
	if !canManageMember(actor, target) {
		return nil, errors.New("you do not have permission to manage this member")
	}

	role, err := s.roleRepo.FindByID(roleID)
	if err != nil {
		return nil, errors.New("role not found")
	}
	if !canAssignMemberRole(actor, role) {
		return nil, errors.New("you do not have permission to assign this role")
	}
	if target.Role != nil && target.Role.Name == role.Name {
		return target, nil
	}

	previousRole := roleName(target.Role)
	target.RoleID = role.ID
	if err := s.memberRepo.Update(target); err != nil {
		return nil, err
	}

	updated, err := s.memberRepo.FindByID(target.ID)
	if err != nil {
		return nil, err
	}

	actorID := actor.UserID
	targetUserID := updated.UserID
	writeAuditEvent(
		s.auditRepo,
		restaurantID,
		entity.AuditActionMemberRoleChanged,
		&actorID,
		&targetUserID,
		nil,
		map[string]any{
			"from_role": previousRole,
			"to_role":   role.Name,
			"status":    updated.Status,
		},
	)

	return updated, nil
}

func (s *RestaurantService) ListAuditLogs(actorUserID, restaurantID uint, limit int) ([]entity.RestaurantAuditLog, error) {
	actor, err := s.GetMembership(actorUserID, restaurantID)
	if err != nil {
		return nil, err
	}
	if !canManageTeam(actor) {
		return nil, errors.New("only owner or manager can view audit logs")
	}
	return s.auditRepo.ListByRestaurant(restaurantID, limit)
}

func (s *RestaurantService) GetRestaurant(restaurantID uint) (*entity.Restaurant, error) {
	return s.restaurantRepo.FindByID(restaurantID)
}

func (s *RestaurantService) UpdateRestaurant(restaurantID uint, req *UpdateRestaurantRequest) (*entity.Restaurant, error) {
	restaurant, err := s.restaurantRepo.FindByID(restaurantID)
	if err != nil {
		return nil, errors.New("restaurant not found")
	}

	fields, err := sanitizeRestaurantFields(
		req.Name,
		req.BranchName,
		req.RestaurantType,
		req.Address,
		req.Phone,
		req.Logo,
		req.OpenTime,
		req.CloseTime,
		req.TableCount,
	)
	if err != nil {
		return nil, err
	}

	restaurant.Name = fields.Name
	restaurant.BranchName = fields.BranchName
	restaurant.RestaurantType = fields.RestaurantType
	restaurant.Address = fields.Address
	restaurant.Phone = fields.Phone
	restaurant.Logo = fields.Logo
	restaurant.OpenTime = fields.OpenTime
	restaurant.CloseTime = fields.CloseTime
	restaurant.TableCount = fields.TableCount

	if err := s.restaurantRepo.Update(restaurant); err != nil {
		return nil, err
	}
	return s.restaurantRepo.FindByID(restaurantID)
}

func (s *RestaurantService) UpdateRestaurantLogo(restaurantID uint, logo string) (*entity.Restaurant, error) {
	restaurant, err := s.restaurantRepo.FindByID(restaurantID)
	if err != nil {
		return nil, errors.New("restaurant not found")
	}

	restaurant.Logo = strings.TrimSpace(logo)
	if err := s.restaurantRepo.Update(restaurant); err != nil {
		return nil, err
	}
	return s.restaurantRepo.FindByID(restaurantID)
}

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

func canManageInvites(member *entity.RestaurantMember) bool {
	if member == nil || member.Role == nil {
		return false
	}
	return member.Role.Name == "owner" || member.Role.Name == "manager"
}

func canManageTeam(member *entity.RestaurantMember) bool {
	return canManageInvites(member)
}

func canManageMember(actor, target *entity.RestaurantMember) bool {
	if actor == nil || target == nil || actor.Role == nil || target.Role == nil {
		return false
	}
	if actor.UserID == target.UserID {
		return false
	}

	switch actor.Role.Name {
	case "owner":
		return target.Role.Name != "owner"
	case "manager":
		return target.Role.Name != "owner" && target.Role.Name != "manager"
	default:
		return false
	}
}

func canAssignMemberRole(actor *entity.RestaurantMember, role *entity.Role) bool {
	if actor == nil || role == nil || actor.Role == nil {
		return false
	}

	switch actor.Role.Name {
	case "owner":
		return role.Name != "owner"
	case "manager":
		return role.Name != "owner" && role.Name != "manager"
	default:
		return false
	}
}

func roleName(role *entity.Role) string {
	if role == nil {
		return ""
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

	return &restaurantFields{
		Name:           normalizedName,
		BranchName:     normalizedBranchName,
		RestaurantType: normalizedRestaurantType,
		Address:        strings.TrimSpace(address),
		Phone:          normalizedPhone,
		Logo:           strings.TrimSpace(logo),
		OpenTime:       openTime,
		CloseTime:      closeTime,
		TableCount:     tableCount,
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

func (s *RestaurantService) loadManagedMemberPair(actorUserID, restaurantID, memberID uint) (*entity.RestaurantMember, *entity.RestaurantMember, error) {
	actor, err := s.GetMembership(actorUserID, restaurantID)
	if err != nil {
		return nil, nil, err
	}
	if !canManageTeam(actor) {
		return nil, nil, errors.New("only owner or manager can manage members")
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
