package service

import (
	"encoding/json"
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
	setupRepo      *repository.RestaurantSetupRepository
}

func ProvideRestaurantService(
	restaurantRepo *repository.RestaurantRepository,
	memberRepo *repository.RestaurantMemberRepository,
	roleRepo *repository.RoleRepository,
	auditRepo *repository.RestaurantAuditLogRepository,
	setupRepo *repository.RestaurantSetupRepository,
) *RestaurantService {
	return &RestaurantService{
		restaurantRepo: restaurantRepo,
		memberRepo:     memberRepo,
		roleRepo:       roleRepo,
		auditRepo:      auditRepo,
		setupRepo:      setupRepo,
	}
}

type CreateRestaurantRequest struct {
	Name                 string  `json:"name" binding:"required"`
	BranchName           string  `json:"branch_name" binding:"required"`
	RestaurantType       string  `json:"restaurant_type" binding:"required"`
	Address              string  `json:"address"`
	Phone                string  `json:"phone"`
	Logo                 string  `json:"logo"`
	OpenTime             string  `json:"open_time"`
	CloseTime            string  `json:"close_time"`
	TableCount           int     `json:"table_count"`
	ServiceChargeEnabled bool    `json:"service_charge_enabled"`
	ServiceChargeRate    float64 `json:"service_charge_rate"`
	VATEnabled           bool    `json:"vat_enabled"`
	VATRate              float64 `json:"vat_rate"`
	PromptPayName        string  `json:"promptpay_name"`
	PromptPayQRImage     string  `json:"promptpay_qr_image"`
}

type UpdateRestaurantRequest struct {
	Name                 string  `json:"name" binding:"required"`
	BranchName           string  `json:"branch_name" binding:"required"`
	RestaurantType       string  `json:"restaurant_type" binding:"required"`
	Address              string  `json:"address"`
	Phone                string  `json:"phone"`
	Logo                 string  `json:"logo"`
	OpenTime             string  `json:"open_time"`
	CloseTime            string  `json:"close_time"`
	TableCount           int     `json:"table_count"`
	ServiceChargeEnabled bool    `json:"service_charge_enabled"`
	ServiceChargeRate    float64 `json:"service_charge_rate"`
	VATEnabled           bool    `json:"vat_enabled"`
	VATRate              float64 `json:"vat_rate"`
	PromptPayName        string  `json:"promptpay_name"`
	PromptPayQRImage     string  `json:"promptpay_qr_image"`
}

type restaurantFields struct {
	Name                 string
	BranchName           string
	RestaurantType       string
	Address              string
	Phone                string
	Logo                 string
	OpenTime             string
	CloseTime            string
	TableCount           int
	ServiceChargeEnabled bool
	ServiceChargeRate    float64
	VATEnabled           bool
	VATRate              float64
	PromptPayName        string
	PromptPayQRImage     string
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
		req.ServiceChargeEnabled,
		req.ServiceChargeRate,
		req.VATEnabled,
		req.VATRate,
		req.PromptPayName,
		req.PromptPayQRImage,
	)
	if err != nil {
		return nil, nil, err
	}

	ownerRole, err := s.roleRepo.FindByName(DefaultOwnerRoleName)
	if err != nil {
		return nil, nil, errors.New("owner role is not configured")
	}

	var restaurant *entity.Restaurant
	var member *entity.RestaurantMember
	if err := s.setupRepo.Transaction(func(tx *repository.RestaurantSetupRepository) error {
		restaurant = &entity.Restaurant{
			Name:                 fields.Name,
			BranchName:           fields.BranchName,
			RestaurantType:       fields.RestaurantType,
			Address:              fields.Address,
			Phone:                fields.Phone,
			Logo:                 fields.Logo,
			OpenTime:             fields.OpenTime,
			CloseTime:            fields.CloseTime,
			TableCount:           fields.TableCount,
			ServiceChargeEnabled: fields.ServiceChargeEnabled,
			ServiceChargeRate:    fields.ServiceChargeRate,
			VATEnabled:           fields.VATEnabled,
			VATRate:              fields.VATRate,
			PromptPayName:        fields.PromptPayName,
			PromptPayQRImage:     fields.PromptPayQRImage,
			OwnerID:              userID,
		}
		if err := tx.CreateRestaurant(restaurant); err != nil {
			return err
		}

		member = &entity.RestaurantMember{
			UserID:       userID,
			RestaurantID: restaurant.ID,
			RoleID:       ownerRole.ID,
			Status:       "active",
			JoinedAt:     time.Now(),
		}
		if err := tx.CreateMember(member); err != nil {
			return err
		}

		return seedRestaurantStarterSetup(tx, restaurant.ID, fields.RestaurantType, fields.TableCount)
	}); err != nil {
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
	if !roleAssignableToRestaurant(role, restaurantID) || !canAssignMemberRole(actor, role) {
		return nil, errors.New("you do not have permission to assign this role")
	}
	if role.RestaurantID == nil {
		hidden, err := s.roleRepo.IsRoleHiddenForRestaurant(restaurantID, role.ID)
		if err != nil {
			return nil, err
		}
		if hidden {
			return nil, errors.New("role is not available for this restaurant")
		}
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
			"to_role":   roleName(role),
			"status":    updated.Status,
		},
	)

	return updated, nil
}

func (s *RestaurantService) UpdateMemberPermissions(actorUserID, restaurantID, memberID uint, permissionsOverride *([]string)) (*entity.RestaurantMember, error) {
	actor, target, err := s.loadManagedMemberPair(actorUserID, restaurantID, memberID)
	if err != nil {
		return nil, err
	}
	if !canManageMember(actor, target) {
		return nil, errors.New("you do not have permission to manage this member")
	}

	previous := target.PermissionsOverride
	if permissionsOverride == nil {
		target.PermissionsOverride = nil
	} else {
		normalized, err := normalizePermissions(*permissionsOverride)
		if err != nil {
			return nil, err
		}
		raw, err := json.Marshal(normalized)
		if err != nil {
			return nil, err
		}
		next := string(raw)
		target.PermissionsOverride = &next
	}

	if err := s.memberRepo.Update(target); err != nil {
		return nil, err
	}

	updated, err := s.memberRepo.FindByID(target.ID)
	if err != nil {
		return nil, err
	}

	var previousValue any
	if previous != nil {
		previousValue = *previous
	}
	var nextValue any
	if updated.PermissionsOverride != nil {
		nextValue = *updated.PermissionsOverride
	}
	actorID := actor.UserID
	targetUserID := updated.UserID
	writeAuditEvent(
		s.auditRepo,
		restaurantID,
		entity.AuditActionMemberPermissionsChanged,
		&actorID,
		&targetUserID,
		nil,
		map[string]any{
			"from_permissions_override": previousValue,
			"to_permissions_override":   nextValue,
			"role_name":                 roleName(updated.Role),
			"status":                    updated.Status,
		},
	)

	return updated, nil
}

func (s *RestaurantService) ListAuditLogs(actorUserID, restaurantID uint, limit int, offset int) ([]entity.RestaurantAuditLog, error) {
	actor, err := s.GetMembership(actorUserID, restaurantID)
	if err != nil {
		return nil, err
	}
	if !canManageTeam(actor) {
		return nil, errors.New("only owner or manager can view audit logs")
	}
	return s.auditRepo.ListByRestaurant(restaurantID, limit, offset)
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
		req.ServiceChargeEnabled,
		req.ServiceChargeRate,
		req.VATEnabled,
		req.VATRate,
		req.PromptPayName,
		req.PromptPayQRImage,
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
	restaurant.ServiceChargeEnabled = fields.ServiceChargeEnabled
	restaurant.ServiceChargeRate = fields.ServiceChargeRate
	restaurant.VATEnabled = fields.VATEnabled
	restaurant.VATRate = fields.VATRate
	restaurant.PromptPayName = fields.PromptPayName
	restaurant.PromptPayQRImage = fields.PromptPayQRImage

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
