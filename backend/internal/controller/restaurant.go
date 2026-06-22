package controller

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RestaurantController struct {
	restaurantSvc *service.RestaurantService
	invitationSvc *service.InvitationService
}

func ProvideRestaurantController(db *gorm.DB) *RestaurantController {
	restaurantRepo := repository.NewRestaurantRepository(db)
	memberRepo := repository.NewRestaurantMemberRepository(db)
	roleRepo := repository.NewRoleRepository(db)
	invRepo := repository.NewInvitationRepository(db)
	userRepo := repository.NewUserRepository(db)
	auditRepo := repository.NewRestaurantAuditLogRepository(db)
	setupRepo := repository.NewRestaurantSetupRepository(db)
	menuRepo := repository.NewMenuRepository(db)
	ingredientRepo := repository.NewIngredientRepository(db)

	return &RestaurantController{
		restaurantSvc: service.ProvideRestaurantService(restaurantRepo, memberRepo, roleRepo, auditRepo, setupRepo, menuRepo, ingredientRepo),
		invitationSvc: service.ProvideInvitationService(invRepo, memberRepo, roleRepo, userRepo, auditRepo),
	}
}

type updateMemberStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type updateMemberRoleRequest struct {
	RoleID uint `json:"role_id" binding:"required"`
}

type updateMemberPermissionsRequest struct {
	UseRolePermissions bool     `json:"use_role_permissions"`
	Permissions        []string `json:"permissions"`
}

func canManageRestaurantProfile(memberRoleName string) bool {
	return memberRoleName == "owner" || memberRoleName == "manager"
}

func canManageStaff(c *gin.Context) bool {
	member, ok := contextMember(c)
	if !ok || member.Role == nil {
		return false
	}
	return canManageRestaurantProfile(member.Role.Name) && memberCan(c, "manage_staff")
}

func contextUserID(c *gin.Context) (uint, bool) {
	v, ok := c.Get("user_id")
	if !ok {
		return 0, false
	}
	switch n := v.(type) {
	case uint:
		return n, true
	case float64:
		return uint(n), true
	default:
		return 0, false
	}
}

func parseIDParam(c *gin.Context, key string) (uint, error) {
	raw := c.Param(key)
	v, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, errors.New("invalid id")
	}
	return uint(v), nil
}

// POST /api/v1/restaurants
func (ctrl *RestaurantController) Create(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req service.CreateRestaurantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	restaurant, member, err := ctrl.restaurantSvc.CreateRestaurant(userID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"restaurant": restaurant,
		"membership": member,
	})
}

// GET /api/v1/restaurants/me
func (ctrl *RestaurantController) ListMyMemberships(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	memberships, err := ctrl.restaurantSvc.ListMyMemberships(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"memberships": memberships})
}

// GET /api/v1/restaurants/:id
func (ctrl *RestaurantController) Get(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}

	restaurant, err := ctrl.restaurantSvc.GetRestaurant(restaurantID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "restaurant not found"})
		return
	}
	c.JSON(http.StatusOK, restaurant)
}

// PATCH /api/v1/restaurants/:id
func (ctrl *RestaurantController) Update(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if member.Role == nil || !canManageRestaurantProfile(member.Role.Name) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or manager can update restaurant settings"})
		return
	}

	var req service.UpdateRestaurantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	restaurant, err := ctrl.restaurantSvc.UpdateRestaurant(restaurantID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"restaurant": restaurant})
}

// POST /api/v1/restaurants/:id/upload-logo
func (ctrl *RestaurantController) UploadLogo(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if member.Role == nil || !canManageRestaurantProfile(member.Role.Name) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or manager can update restaurant settings"})
		return
	}

	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	ext, err := validateImageUpload(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate filename"})
		return
	}
	fileName := hex.EncodeToString(random) + ext
	relativeDir := filepath.Join("uploads", "restaurants", strconv.FormatUint(uint64(restaurantID), 10))
	if err := os.MkdirAll(relativeDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare upload folder"})
		return
	}
	destination := filepath.Join(relativeDir, fileName)
	if err := c.SaveUploadedFile(file, destination); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image"})
		return
	}

	publicPath := publicURL(c, "/uploads/restaurants/"+strconv.FormatUint(uint64(restaurantID), 10)+"/"+fileName)
	restaurant, err := ctrl.restaurantSvc.UpdateRestaurantLogo(restaurantID, publicPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"restaurant": restaurant})
}

// POST /api/v1/restaurants/:id/upload-cover
func (ctrl *RestaurantController) UploadCover(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if member.Role == nil || !canManageRestaurantProfile(member.Role.Name) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or manager can update restaurant settings"})
		return
	}

	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	ext, err := validateImageUpload(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate filename"})
		return
	}
	fileName := hex.EncodeToString(random) + ext
	relativeDir := filepath.Join("uploads", "restaurants", strconv.FormatUint(uint64(restaurantID), 10))
	if err := os.MkdirAll(relativeDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare upload folder"})
		return
	}
	destination := filepath.Join(relativeDir, fileName)
	if err := c.SaveUploadedFile(file, destination); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image"})
		return
	}

	publicPath := publicURL(c, "/uploads/restaurants/"+strconv.FormatUint(uint64(restaurantID), 10)+"/"+fileName)
	restaurant, err := ctrl.restaurantSvc.UpdateRestaurantCover(restaurantID, publicPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"restaurant": restaurant})
}

// GET /api/v1/restaurants/:id/members
func (ctrl *RestaurantController) ListMembers(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err = ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}

	includeInactive := canManageStaff(c)
	members, err := ctrl.restaurantSvc.ListMembersWithStatus(restaurantID, includeInactive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"members": members})
}

// PATCH /api/v1/restaurants/:id/members/:memberId/status
func (ctrl *RestaurantController) UpdateMemberStatus(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	memberID, err := parseIDParam(c, "memberId")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var req updateMemberStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := ctrl.restaurantSvc.UpdateMemberStatus(userID, restaurantID, memberID, req.Status)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"member": member})
}

// PATCH /api/v1/restaurants/:id/members/:memberId/role
func (ctrl *RestaurantController) UpdateMemberRole(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	memberID, err := parseIDParam(c, "memberId")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var req updateMemberRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := ctrl.restaurantSvc.UpdateMemberRole(userID, restaurantID, memberID, req.RoleID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"member": member})
}

// PATCH /api/v1/restaurants/:id/members/:memberId/permissions
func (ctrl *RestaurantController) UpdateMemberPermissions(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	memberID, err := parseIDParam(c, "memberId")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var req updateMemberPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var permissionsOverride *([]string)
	if !req.UseRolePermissions {
		permissionsOverride = &req.Permissions
	}
	member, err := ctrl.restaurantSvc.UpdateMemberPermissions(userID, restaurantID, memberID, permissionsOverride)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"member": member})
}

// GET /api/v1/restaurants/:id/audit-logs
func (ctrl *RestaurantController) ListAuditLogs(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	limit := 20
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}
	offset := 0
	if raw := c.Query("offset"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			offset = parsed
		}
	}

	logs, err := ctrl.restaurantSvc.ListAuditLogs(userID, restaurantID, limit+1, offset)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hasMore := len(logs) > limit
	if hasMore {
		logs = logs[:limit]
	}
	c.JSON(http.StatusOK, gin.H{
		"logs":        logs,
		"has_more":    hasMore,
		"next_offset": offset + len(logs),
	})
}

// POST /api/v1/restaurants/:id/invitations
func (ctrl *RestaurantController) CreateInvitation(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err = ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if !canManageStaff(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or manager can invite"})
		return
	}

	var req service.CreateInvitationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	inv, err := ctrl.invitationSvc.CreateInvitation(restaurantID, userID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, inv)
}

// GET /api/v1/restaurants/:id/invitations
func (ctrl *RestaurantController) ListPendingInvitations(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err = ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if !canManageStaff(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or manager can list invitations"})
		return
	}

	invs, err := ctrl.invitationSvc.ListPending(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"invitations": invs})
}

// DELETE /api/v1/restaurants/:id/invitations/:invitationId
func (ctrl *RestaurantController) RevokeInvitation(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	invitationID, err := parseIDParam(c, "invitationId")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err = ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if !canManageStaff(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or manager can revoke"})
		return
	}

	if err := ctrl.invitationSvc.RevokeInvitation(userID, restaurantID, invitationID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "revoked"})
}

// GET /api/invitations/:token  (public — show invitation preview)
func (ctrl *RestaurantController) GetInvitationByToken(c *gin.Context) {
	token := c.Param("token")
	inv, err := ctrl.invitationSvc.GetByToken(token)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invitation not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"invitation": inv,
		"usable":     inv.IsUsable(),
	})
}

// POST /api/v1/invitations/:token/accept
func (ctrl *RestaurantController) AcceptInvitation(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	token := c.Param("token")
	member, err := ctrl.invitationSvc.AcceptInvitation(userID, token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"membership": member})
}

// DELETE /api/v1/restaurants/:id
func (ctrl *RestaurantController) Delete(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, err := parseIDParam(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if member.Role == nil || member.Role.Name != "owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner can delete the restaurant"})
		return
	}

	if err := ctrl.restaurantSvc.DeleteRestaurant(restaurantID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

