package service

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"

	"Project-M/internal/auth"
	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"gorm.io/gorm"
)

type AuthService struct {
	userRepo   *repository.UserRepository
	memberRepo *repository.RestaurantMemberRepository
}

var ErrPasswordResetGoogleAccount = errors.New("use google login for this account")

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

type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type UpdateProfileRequest struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Nickname  string `json:"nickname"`
	Phone     string `json:"phone"`
}

type LoginResponse struct {
	Token       string                    `json:"token"`
	User        *entity.User              `json:"user"`
	Memberships []entity.RestaurantMember `json:"memberships"`
}

func (s *AuthService) Register(user *entity.User) (*entity.User, error) {
	user.Email = strings.TrimSpace(strings.ToLower(user.Email))
	user.AuthProvider = "local"
	user.GoogleID = nil
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
	email := strings.TrimSpace(strings.ToLower(req.Email))
	user, err := s.userRepo.FindByEmailProvider(email, "local")
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

	user, err := s.userRepo.FindByGoogleID(googleClaims.Subject)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}

		user, err = s.userRepo.FindGoogleByEmailWithoutGoogleID(strings.TrimSpace(strings.ToLower(googleClaims.Email)))
		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
			user, err = s.createGoogleUser(googleClaims)
			if err != nil {
				return nil, err
			}
		} else {
			user.GoogleID = &googleClaims.Subject
			if err := s.userRepo.UpdateGoogleID(user); err != nil {
				return nil, err
			}
		}
	}

	return s.buildLoginResponse(user)
}

func (s *AuthService) RequestPasswordReset(req *ForgotPasswordRequest) error {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		return nil
	}

	user, err := s.userRepo.FindByEmailProvider(email, "local")
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			googleUser, googleErr := s.userRepo.FindByEmailProvider(email, "google")
			if googleErr == nil && googleUser != nil {
				return ErrPasswordResetGoogleAccount
			}
			return nil
		}
		return err
	}

	token, err := randomPassword()
	if err != nil {
		return err
	}

	expiresAt := time.Now().Add(time.Hour)
	user.PasswordResetTokenHash = hashResetToken(token)
	user.PasswordResetExpiresAt = &expiresAt
	if err := s.userRepo.UpdatePasswordReset(user); err != nil {
		return err
	}

	return sendPasswordResetEmail(user.Email, buildPasswordResetURL(token))
}

func (s *AuthService) ResetPassword(req *ResetPasswordRequest) error {
	token := strings.TrimSpace(req.Token)
	password := strings.TrimSpace(req.Password)
	if token == "" {
		return errors.New("reset token is required")
	}
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}

	user, err := s.userRepo.FindByPasswordResetTokenHash(hashResetToken(token))
	if err != nil {
		return errors.New("reset link is invalid or expired")
	}
	if user.PasswordResetExpiresAt == nil || time.Now().After(*user.PasswordResetExpiresAt) {
		return errors.New("reset link is invalid or expired")
	}

	hashed, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	user.Password = hashed
	user.PasswordResetTokenHash = ""
	user.PasswordResetExpiresAt = nil

	return s.userRepo.UpdatePassword(user)
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
		AuthProvider: "google",
		GoogleID:     &claims.Subject,
		FirstName:    firstName,
		LastName:     lastName,
		Email:        strings.TrimSpace(strings.ToLower(claims.Email)),
		Password:     hashed,
		ProfileImage: claims.Picture,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	return s.userRepo.FindByGoogleID(claims.Subject)
}

func randomPassword() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func buildPasswordResetURL(token string) string {
	baseURL := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	return baseURL + "/reset-password?token=" + url.QueryEscape(token)
}

func sendPasswordResetEmail(to string, resetURL string) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	from := os.Getenv("SMTP_FROM")
	username := os.Getenv("SMTP_USER")
	password := os.Getenv("SMTP_PASSWORD")
	if host == "" || port == "" || from == "" {
		fmt.Printf("[password reset] SMTP is not configured. Reset link for %s: %s\n", to, resetURL)
		return nil
	}

	var message bytes.Buffer
	message.WriteString("From: " + from + "\r\n")
	message.WriteString("To: " + to + "\r\n")
	message.WriteString("Subject: Restaurant Hub password reset\r\n")
	message.WriteString("MIME-Version: 1.0\r\n")
	message.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	message.WriteString("Use this link to reset your Restaurant Hub password. The link expires in 1 hour.\r\n\r\n")
	message.WriteString(resetURL + "\r\n")

	var auth smtp.Auth
	if username != "" || password != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}
	return smtp.SendMail(host+":"+port, auth, from, []string{to}, message.Bytes())
}

func hideUserPassword(user *entity.User) *entity.User {
	user.Password = ""
	return user
}

func (s *AuthService) GetUserById(id uint) (*entity.User, error) {
	return s.userRepo.FindById(id)
}

func (s *AuthService) UpdateProfile(id uint, req *UpdateProfileRequest) (*entity.User, error) {
	user, err := s.userRepo.FindById(id)
	if err != nil {
		return nil, err
	}

	firstName := strings.TrimSpace(req.FirstName)
	lastName := strings.TrimSpace(req.LastName)
	if firstName == "" {
		return nil, errors.New("FirstName is required")
	}
	if lastName == "" {
		lastName = "-"
	}

	user.FirstName = firstName
	user.LastName = lastName
	user.Nickname = strings.TrimSpace(req.Nickname)
	user.Phone = strings.TrimSpace(req.Phone)

	if err := s.userRepo.UpdateProfile(user); err != nil {
		return nil, err
	}

	return hideUserPassword(user), nil
}

func (s *AuthService) UpdateProfileImage(id uint, imageURL string) (*entity.User, error) {
	user, err := s.userRepo.UpdateProfileImage(id, imageURL)
	if err != nil {
		return nil, err
	}
	return hideUserPassword(user), nil
}
