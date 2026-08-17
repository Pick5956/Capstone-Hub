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

	return &RestaurantController{
		restaurantSvc: service.ProvideRestaurantService(restaurantRepo, memberRepo, roleRepo, auditRepo, setupRepo),
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

func requireScopedRestaurantParam(c *gin.Context, key string) (uint, bool) {
	scopedRestaurantID, ok := requireRestaurant(c)
	if !ok {
		return 0, false
	}
	pathRestaurantID, err := parseIDParam(c, key)
	if err != nil || pathRestaurantID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid restaurant id"})
		return 0, false
	}
	if pathRestaurantID != scopedRestaurantID {
		c.JSON(http.StatusForbidden, gin.H{"error": "restaurant path does not match restaurant context"})
		return 0, false
	}
	return scopedRestaurantID, true
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
		respondInvalidRequest(c)
		return
	}

	restaurant, member, err := ctrl.restaurantSvc.CreateRestaurant(userID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"restaurant": restaurant,
		"membership": service.NewMembershipResponse(member),
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
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"memberships": service.NewMembershipResponses(memberships)})
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
		respondAPIError(c, http.StatusBadRequest, err)
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
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if !service.MemberHasPermission(member, service.PermissionManageRestaurantSettings) {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_restaurant_settings permission"})
		return
	}

	var req service.UpdateRestaurantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}

	restaurant, err := ctrl.restaurantSvc.UpdateRestaurant(restaurantID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
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
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if !service.MemberHasPermission(member, service.PermissionManageRestaurantSettings) {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_restaurant_settings permission"})
		return
	}
	existingRestaurant, err := ctrl.restaurantSvc.GetRestaurant(restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusNotFound, err)
		return
	}

	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	ext, err := validateImageUpload(file)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate filename"})
		return
	}
	fileName := hex.EncodeToString(random) + ext
	relativeDir := filepath.Join("uploads", "restaurants", strconv.FormatUint(uint64(restaurantID), 10))
	if err := ensureUploadQuota(relativeDir, file.Size, maxTenantImageFiles, maxTenantImageBytes); err != nil {
		respondAPIError(c, http.StatusInsufficientStorage, err)
		return
	}
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
		removeSavedUpload(destination)
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	removeReplacedUpload(
		existingRestaurant.Logo,
		"/uploads/restaurants/"+strconv.FormatUint(uint64(restaurantID), 10)+"/",
		destination,
	)

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
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if !service.MemberHasPermission(member, service.PermissionManageRestaurantSettings) {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_restaurant_settings permission"})
		return
	}
	existingRestaurant, err := ctrl.restaurantSvc.GetRestaurant(restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusNotFound, err)
		return
	}

	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	ext, err := validateImageUpload(file)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate filename"})
		return
	}
	fileName := hex.EncodeToString(random) + ext
	relativeDir := filepath.Join("uploads", "restaurants", strconv.FormatUint(uint64(restaurantID), 10))
	if err := ensureUploadQuota(relativeDir, file.Size, maxTenantImageFiles, maxTenantImageBytes); err != nil {
		respondAPIError(c, http.StatusInsufficientStorage, err)
		return
	}
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
		removeSavedUpload(destination)
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	removeReplacedUpload(
		existingRestaurant.CoverImage,
		"/uploads/restaurants/"+strconv.FormatUint(uint64(restaurantID), 10)+"/",
		destination,
	)

	c.JSON(http.StatusCreated, gin.H{"restaurant": restaurant})
}

// POST /api/v1/restaurants/:id/upload-promptpay-qr
func (ctrl *RestaurantController) UploadPromptPayQR(c *gin.Context) {
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
	if !service.MemberHasPermission(member, service.PermissionManageRestaurantSettings) {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing manage_restaurant_settings permission"})
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
	restaurant, err := ctrl.restaurantSvc.UpdateRestaurantPromptPayQR(restaurantID, publicPath)
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
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requireAnyPermission(
		c,
		"missing team management permission",
		service.PermissionManageInvites,
		service.PermissionManageMembers,
		service.PermissionManageRoles,
		service.PermissionViewAuditLog,
	) {
		return
	}
	members, err := ctrl.restaurantSvc.ListMembersForActor(userID, restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"members": service.NewMembershipResponses(members)})
}

// PATCH /api/v1/restaurants/:id/members/:memberId/status
func (ctrl *RestaurantController) UpdateMemberStatus(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requirePermission(c, service.PermissionManageMembers, "missing manage_members permission") {
		return
	}
	memberID, err := parseIDParam(c, "memberId")
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	var req updateMemberStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}

	member, err := ctrl.restaurantSvc.UpdateMemberStatus(userID, restaurantID, memberID, req.Status)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"member": service.NewMembershipResponse(member)})
}

// PATCH /api/v1/restaurants/:id/members/:memberId/role
func (ctrl *RestaurantController) UpdateMemberRole(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requirePermission(c, service.PermissionManageRoles, "missing manage_roles permission") {
		return
	}
	memberID, err := parseIDParam(c, "memberId")
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	var req updateMemberRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}

	member, err := ctrl.restaurantSvc.UpdateMemberRole(userID, restaurantID, memberID, req.RoleID)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"member": service.NewMembershipResponse(member)})
}

// PATCH /api/v1/restaurants/:id/members/:memberId/permissions
func (ctrl *RestaurantController) UpdateMemberPermissions(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requirePermission(c, service.PermissionManageRoles, "missing manage_roles permission") {
		return
	}
	memberID, err := parseIDParam(c, "memberId")
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	var req updateMemberPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}

	var permissionsOverride *([]string)
	if !req.UseRolePermissions {
		permissionsOverride = &req.Permissions
	}
	member, err := ctrl.restaurantSvc.UpdateMemberPermissions(userID, restaurantID, memberID, permissionsOverride)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"member": service.NewMembershipResponse(member)})
}

// GET /api/v1/restaurants/:id/audit-logs
func (ctrl *RestaurantController) ListAuditLogs(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requirePermission(c, service.PermissionViewAuditLog, "missing view_audit_log permission") {
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
		respondAPIError(c, http.StatusBadRequest, err)
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
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requirePermission(c, service.PermissionManageInvites, "missing manage_invites permission") {
		return
	}

	var req service.CreateInvitationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}

	inv, err := ctrl.invitationSvc.CreateInvitation(restaurantID, userID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, service.NewAdminInvitationResponse(inv))
}

// GET /api/v1/restaurants/:id/invitations
func (ctrl *RestaurantController) ListPendingInvitations(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requirePermission(c, service.PermissionManageInvites, "missing manage_invites permission") {
		return
	}

	invs, err := ctrl.invitationSvc.ListPending(userID, restaurantID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"invitations": service.NewAdminInvitationResponses(invs)})
}

// DELETE /api/v1/restaurants/:id/invitations/:invitationId
func (ctrl *RestaurantController) RevokeInvitation(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	restaurantID, ok := requireScopedRestaurantParam(c, "id")
	if !ok {
		return
	}
	if !requirePermission(c, service.PermissionManageInvites, "missing manage_invites permission") {
		return
	}
	invitationID, err := parseIDParam(c, "invitationId")
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}

	if err := ctrl.invitationSvc.RevokeInvitation(userID, restaurantID, invitationID); err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
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
		"invitation": service.NewPublicInvitationResponse(inv),
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
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"membership": service.NewMembershipResponse(member)})
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
		respondAPIError(c, http.StatusBadRequest, err)
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
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
