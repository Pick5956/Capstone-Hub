package controller

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type UserController struct {
	authService *service.AuthService
}

func ProvideUserController(db *gorm.DB) *UserController {
	userRepo := repository.NewUserRepository(db)
	memberRepo := repository.NewRestaurantMemberRepository(db)
	authService := service.ProvideAuthService(userRepo, memberRepo)
	return &UserController{
		authService: authService,
	}
}

func (ctrl *UserController) Login(c *gin.Context) {
	var req service.LoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := ctrl.authService.Login(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (ctrl *UserController) GoogleLogin(c *gin.Context) {
	var req service.GoogleLoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := ctrl.authService.GoogleLogin(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid google credentials"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (ctrl *UserController) Register(c *gin.Context) {
	var user entity.User

	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, err := ctrl.authService.Register(&user)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created.Password = ""
	c.JSON(http.StatusCreated, created)
}

func (ctrl *UserController) ForgotPassword(c *gin.Context) {
	var req service.ForgotPasswordRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := ctrl.authService.RequestPasswordReset(&req); err != nil {
		if errors.Is(err, service.ErrPasswordResetGoogleAccount) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "This email uses Google sign-in. Please continue with Google.",
				"code":  "GOOGLE_ACCOUNT_USE_GOOGLE_LOGIN",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to request password reset"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "If this email exists, a password reset link has been sent."})
}

func (ctrl *UserController) ResetPassword(c *gin.Context) {
	var req service.ResetPasswordRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := ctrl.authService.ResetPassword(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password has been reset."})
}

func (ctrl *UserController) GetProfile(c *gin.Context) {
	id, ok := getUserIDFromContext(c)
	if !ok {
		return
	}

	user, err := ctrl.authService.GetUserById(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	user.Password = ""
	c.JSON(http.StatusOK, user)
}

func (ctrl *UserController) UpdateProfile(c *gin.Context) {
	id, ok := getUserIDFromContext(c)
	if !ok {
		return
	}

	var req service.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := ctrl.authService.UpdateProfile(id, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, user)
}

func (ctrl *UserController) UploadProfileImage(c *gin.Context) {
	id, ok := getUserIDFromContext(c)
	if !ok {
		return
	}

	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	if file.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file must be 5MB or smaller"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image must be jpg, png, or webp"})
		return
	}

	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate filename"})
		return
	}

	fileName := hex.EncodeToString(random) + ext
	userIDText := strconv.FormatUint(uint64(id), 10)
	relativeDir := filepath.Join("uploads", "users", userIDText)
	if err := os.MkdirAll(relativeDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare upload folder"})
		return
	}

	destination := filepath.Join(relativeDir, fileName)
	if err := c.SaveUploadedFile(file, destination); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image"})
		return
	}

	publicPath := publicURL(c, "/uploads/users/"+userIDText+"/"+fileName)
	user, err := ctrl.authService.UpdateProfileImage(id, publicPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, user)
}

func getUserIDFromContext(c *gin.Context) (uint, bool) {
	userId, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return 0, false
	}

	switch v := userId.(type) {
	case uint:
		return v, true
	case float64:
		return uint(v), true
	default:
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token payload"})
		return 0, false
	}
}
