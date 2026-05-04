package service

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"os"
	"strings"

	"Project-M/internal/auth"
	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"gorm.io/gorm"
)

type AuthService struct {
	userRepo    *repository.UserRepository
	memberRepo  *repository.RestaurantMemberRepository
}

func ProvideAuthService(userRepo *repository.UserRepository, memberRepo *repository.RestaurantMemberRepository) *AuthService {
	return &AuthService{
		userRepo:   userRepo,
		memberRepo: memberRepo,
	}
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type GoogleLoginRequest struct {
	IDToken string `json:"id_token" binding:"required"`
}

type LoginResponse struct {
	Token       string                      `json:"token"`
	User        *entity.User                `json:"user"`
	Memberships []entity.RestaurantMember   `json:"memberships"`
}

func (s *AuthService) Register(user *entity.User) (*entity.User, error) {
	if err := user.Validation(); err != nil {
		return nil, err
	}
	if user.Password == "" {
		return nil, errors.New("Password is required")
	}

	hashed, err := auth.HashPassword(user.Password)
	if err != nil {
		return nil, err
	}
	user.Password = hashed

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *AuthService) Login(req *LoginRequest) (*LoginResponse, error) {
	user, err := s.userRepo.FindByEmail(req.Email)
	if err != nil {
		return nil, err
	}

	if err := auth.VerifyPassword(user.Password, req.Password); err != nil {
		return nil, err
	}

	return s.buildLoginResponse(user)
}

func (s *AuthService) GoogleLogin(req *GoogleLoginRequest) (*LoginResponse, error) {
	googleClaims, err := auth.VerifyGoogleIDToken(req.IDToken, os.Getenv("GOOGLE_CLIENT_ID"))
	if err != nil {
		return nil, err
	}

	user, err := s.userRepo.FindByEmail(googleClaims.Email)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		user, err = s.createGoogleUser(googleClaims)
		if err != nil {
			return nil, err
		}
	}

	return s.buildLoginResponse(user)
}

func (s *AuthService) buildLoginResponse(user *entity.User) (*LoginResponse, error) {
	jwtWrapper := &auth.JwtWrapper{
		SecretKey: os.Getenv("JWT_SECRET"),
		Issuer:    "project-management",
	}

	token, err := jwtWrapper.GenerateToken(user.ID, "user")
	if err != nil {
		return nil, err
	}

	memberships, err := s.memberRepo.FindActiveByUser(user.ID)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{
		Token:       token,
		User:        hideUserPassword(user),
		Memberships: memberships,
	}, nil
}

func (s *AuthService) createGoogleUser(claims *auth.GoogleIDTokenClaims) (*entity.User, error) {
	password, err := randomPassword()
	if err != nil {
		return nil, err
	}

	hashed, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}

	firstName := strings.TrimSpace(claims.GivenName)
	lastName := strings.TrimSpace(claims.FamilyName)
	if firstName == "" {
		firstName = strings.TrimSpace(claims.Name)
	}
	if firstName == "" {
		firstName = claims.Email
	}
	if lastName == "" {
		lastName = "-"
	}

	user := &entity.User{
		FirstName:    firstName,
		LastName:     lastName,
		Email:        claims.Email,
		Password:     hashed,
		ProfileImage: claims.Picture,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return s.userRepo.FindByEmail(user.Email)
}

func randomPassword() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func hideUserPassword(user *entity.User) *entity.User {
	user.Password = ""
	return user
}

func (s *AuthService) GetUserById(id uint) (*entity.User, error) {
	return s.userRepo.FindById(id)
}
