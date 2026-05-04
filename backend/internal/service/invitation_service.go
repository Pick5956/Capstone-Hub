package service

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/mail"
	"strings"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"gorm.io/gorm"
)

type InvitationService struct {
	invRepo    *repository.InvitationRepository
	memberRepo *repository.RestaurantMemberRepository
	roleRepo   *repository.RoleRepository
	userRepo   *repository.UserRepository
}

func ProvideInvitationService(
	invRepo *repository.InvitationRepository,
	memberRepo *repository.RestaurantMemberRepository,
	roleRepo *repository.RoleRepository,
	userRepo *repository.UserRepository,
) *InvitationService {
	return &InvitationService{
		invRepo:    invRepo,
		memberRepo: memberRepo,
		roleRepo:   roleRepo,
		userRepo:   userRepo,
	}
}

type CreateInvitationRequest struct {
	RoleID        uint   `json:"role_id" binding:"required"`
	Email         string `json:"email"`
	ExpiresInDays int    `json:"expires_in_days"` // 0 = no expiry
}

func (s *InvitationService) CreateInvitation(restaurantID, invitedByUserID uint, req *CreateInvitationRequest) (*entity.Invitation, error) {
	role, err := s.roleRepo.FindByID(req.RoleID)
	if err != nil {
		return nil, errors.New("role not found")
	}
	if role.Name == "owner" {
		return nil, errors.New("owner role cannot be invited")
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email != "" {
		if _, err := mail.ParseAddress(email); err != nil {
			return nil, errors.New("invalid invitation email")
		}
	}
	if req.ExpiresInDays < 0 || req.ExpiresInDays > 90 {
		return nil, errors.New("expires_in_days must be between 0 and 90")
	}

	token, err := generateInviteToken()
	if err != nil {
		return nil, err
	}

	var expiresAt *time.Time
	if req.ExpiresInDays > 0 {
		t := time.Now().AddDate(0, 0, req.ExpiresInDays)
		expiresAt = &t
	}

	inv := &entity.Invitation{
		RestaurantID:    restaurantID,
		RoleID:          req.RoleID,
		Email:           email,
		Token:           token,
		ExpiresAt:       expiresAt,
		Status:          entity.InvitationStatusPending,
		InvitedByUserID: invitedByUserID,
	}
	if err := s.invRepo.Create(inv); err != nil {
		return nil, err
	}

	loaded, err := s.invRepo.FindByID(inv.ID)
	if err == nil {
		return loaded, nil
	}
	return inv, nil
}

// GetByToken returns an invitation by its token plus a derived "usable" status.
// Marks the invitation expired if its expiry has passed and status was pending.
func (s *InvitationService) GetByToken(token string) (*entity.Invitation, error) {
	inv, err := s.invRepo.FindByToken(token)
	if err != nil {
		return nil, err
	}

	// auto-flip to expired if past expiry
	if inv.Status == entity.InvitationStatusPending && inv.ExpiresAt != nil && inv.ExpiresAt.Before(time.Now()) {
		inv.Status = entity.InvitationStatusExpired
		_ = s.invRepo.Update(inv)
	}
	return inv, nil
}

// AcceptInvitation creates a RestaurantMember from a usable invitation for the given user.
// Validates token, status, expiry, email match (if scoped), and existing membership.
func (s *InvitationService) AcceptInvitation(userID uint, token string) (*entity.RestaurantMember, error) {
	inv, err := s.GetByToken(token)
	if err != nil {
		return nil, err
	}

	// already a member?
	if existing, err := s.memberRepo.FindByUserAndRestaurant(userID, inv.RestaurantID); err == nil {
		if existing.Status == "active" {
			if inv.Status == entity.InvitationStatusPending {
				now := time.Now()
				uid := userID
				inv.Status = entity.InvitationStatusAccepted
				inv.AcceptedAt = &now
				inv.AcceptedByUserID = &uid
				_ = s.invRepo.Update(inv)
			}
			s.applyInviteCodeVisibility(existing)
			return existing, nil
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if !inv.IsUsable() {
		return nil, errors.New("invitation is no longer usable")
	}

	// scoped invitation: only the matching email may accept
	if inv.Email != "" {
		user, err := s.userRepo.FindById(userID)
		if err != nil {
			return nil, err
		}
		if !strings.EqualFold(user.Email, inv.Email) {
			return nil, errors.New("invitation is for a different email")
		}
	}

	now := time.Now()
	invitedBy := inv.InvitedByUserID
	member := &entity.RestaurantMember{
		UserID:          userID,
		RestaurantID:    inv.RestaurantID,
		RoleID:          inv.RoleID,
		Status:          "active",
		JoinedAt:        now,
		InvitedByUserID: &invitedBy,
	}
	if err := s.memberRepo.Create(member); err != nil {
		return nil, err
	}

	inv.Status = entity.InvitationStatusAccepted
	inv.AcceptedAt = &now
	uid := userID
	inv.AcceptedByUserID = &uid
	if err := s.invRepo.Update(inv); err != nil {
		return nil, err
	}

	loaded, err := s.memberRepo.FindByUserAndRestaurant(userID, inv.RestaurantID)
	if err == nil {
		s.applyInviteCodeVisibility(loaded)
		return loaded, nil
	}
	s.applyInviteCodeVisibility(member)
	return member, nil
}

func (s *InvitationService) applyInviteCodeVisibility(member *entity.RestaurantMember) {
	if member == nil || member.Restaurant == nil || member.Role == nil {
		return
	}
	if member.Role.Name != "owner" && member.Role.Name != "manager" {
		member.Restaurant.InviteCode = ""
	}
}

func (s *InvitationService) RevokeInvitation(restaurantID, invitationID uint) error {
	inv, err := s.invRepo.FindByID(invitationID)
	if err != nil {
		return err
	}
	if inv.RestaurantID != restaurantID {
		return errors.New("invitation does not belong to this restaurant")
	}
	if inv.Status != entity.InvitationStatusPending {
		return errors.New("only pending invitations can be revoked")
	}
	inv.Status = entity.InvitationStatusRevoked
	return s.invRepo.Update(inv)
}

func (s *InvitationService) ListPending(restaurantID uint) ([]entity.Invitation, error) {
	return s.invRepo.ListPendingByRestaurant(restaurantID)
}

func generateInviteToken() (string, error) {
	bytes := make([]byte, 24) // 24 bytes -> 32 base64url chars
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
