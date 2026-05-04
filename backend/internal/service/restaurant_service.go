package service

import (
	"crypto/rand"
	"encoding/base32"
	"errors"
	"regexp"
	"strings"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

const (
	DefaultOwnerRoleName = "owner"
	DefaultStaffRoleName = "waiter"
)

var restaurantTimePattern = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

type RestaurantService struct {
	restaurantRepo *repository.RestaurantRepository
	memberRepo     *repository.RestaurantMemberRepository
	roleRepo       *repository.RoleRepository
}

func ProvideRestaurantService(
	restaurantRepo *repository.RestaurantRepository,
	memberRepo *repository.RestaurantMemberRepository,
	roleRepo *repository.RoleRepository,
) *RestaurantService {
	return &RestaurantService{
		restaurantRepo: restaurantRepo,
		memberRepo:     memberRepo,
		roleRepo:       roleRepo,
	}
}

type CreateRestaurantRequest struct {
	Name       string `json:"name" binding:"required"`
	Address    string `json:"address"`
	Phone      string `json:"phone"`
	Logo       string `json:"logo"`
	OpenTime   string `json:"open_time"`
	CloseTime  string `json:"close_time"`
	TableCount int    `json:"table_count"`
}

type JoinRestaurantRequest struct {
	InviteCode string `json:"invite_code" binding:"required"`
}

// CreateRestaurant creates a restaurant and adds the creator as the owner member.
func (s *RestaurantService) CreateRestaurant(userID uint, req *CreateRestaurantRequest) (*entity.Restaurant, *entity.RestaurantMember, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, nil, errors.New("restaurant name is required")
	}
	if len([]rune(name)) > 120 {
		return nil, nil, errors.New("restaurant name is too long")
	}

	openTime := normalizeBusinessTime(req.OpenTime, "17:00")
	closeTime := normalizeBusinessTime(req.CloseTime, "00:00")
	if !restaurantTimePattern.MatchString(openTime) || !restaurantTimePattern.MatchString(closeTime) {
		return nil, nil, errors.New("open_time and close_time must use HH:mm")
	}

	tableCount := req.TableCount
	if tableCount == 0 {
		tableCount = 12
	}
	if tableCount < 1 || tableCount > 500 {
		return nil, nil, errors.New("table_count must be between 1 and 500")
	}

	ownerRole, err := s.roleRepo.FindByName(DefaultOwnerRoleName)
	if err != nil {
		return nil, nil, errors.New("owner role is not configured")
	}

	inviteCode, err := generateRestaurantInviteCode()
	if err != nil {
		return nil, nil, err
	}

	restaurant := &entity.Restaurant{
		Name:       name,
		Address:    strings.TrimSpace(req.Address),
		Phone:      strings.TrimSpace(req.Phone),
		Logo:       strings.TrimSpace(req.Logo),
		OpenTime:   openTime,
		CloseTime:  closeTime,
		TableCount: tableCount,
		InviteCode: inviteCode,
		OwnerID:    userID,
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
	s.applyInviteCodeVisibility(member)

	return restaurant, member, nil
}

func (s *RestaurantService) JoinByInviteCode(userID uint, req *JoinRestaurantRequest) (*entity.RestaurantMember, error) {
	code := normalizeInviteCode(req.InviteCode)
	if code == "" {
		return nil, errors.New("invite code is required")
	}

	restaurant, err := s.restaurantRepo.FindByInviteCode(code)
	if err != nil {
		return nil, errors.New("invite code not found")
	}

	if existing, err := s.memberRepo.FindByUserAndRestaurant(userID, restaurant.ID); err == nil {
		if existing.Status == "active" {
			s.applyInviteCodeVisibility(existing)
			return existing, nil
		}
		return nil, errors.New("membership exists but is not active")
	}

	staffRole, err := s.roleRepo.FindByName(DefaultStaffRoleName)
	if err != nil {
		return nil, errors.New("staff role is not configured")
	}

	member := &entity.RestaurantMember{
		UserID:       userID,
		RestaurantID: restaurant.ID,
		RoleID:       staffRole.ID,
		Status:       "active",
		JoinedAt:     time.Now(),
	}
	if err := s.memberRepo.Create(member); err != nil {
		return nil, err
	}

	loaded, err := s.memberRepo.FindByUserAndRestaurant(userID, restaurant.ID)
	if err == nil {
		s.applyInviteCodeVisibility(loaded)
		return loaded, nil
	}
	s.applyInviteCodeVisibility(member)
	return member, nil
}

func (s *RestaurantService) ListMyMemberships(userID uint) ([]entity.RestaurantMember, error) {
	members, err := s.memberRepo.FindActiveByUser(userID)
	if err != nil {
		return nil, err
	}
	for i := range members {
		s.applyInviteCodeVisibility(&members[i])
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
	s.applyInviteCodeVisibility(member)
	return member, nil
}

func (s *RestaurantService) ListMembers(restaurantID uint) ([]entity.RestaurantMember, error) {
	return s.memberRepo.FindActiveByRestaurant(restaurantID)
}

func (s *RestaurantService) GetRestaurant(restaurantID uint) (*entity.Restaurant, error) {
	return s.restaurantRepo.FindByID(restaurantID)
}

func normalizeInviteCode(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "-", "")
	value = strings.ReplaceAll(value, " ", "")
	return value
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

func (s *RestaurantService) applyInviteCodeVisibility(member *entity.RestaurantMember) {
	if member == nil || member.Restaurant == nil || canManageInvites(member) {
		return
	}
	member.Restaurant.InviteCode = ""
}

func generateRestaurantInviteCode() (string, error) {
	bytes := make([]byte, 5)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes), nil
}
