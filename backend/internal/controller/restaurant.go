package controller

import (
	"errors"
	"net/http"
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

	return &RestaurantController{
		restaurantSvc: service.ProvideRestaurantService(restaurantRepo, memberRepo, roleRepo),
		invitationSvc: service.ProvideInvitationService(invRepo, memberRepo, roleRepo, userRepo),
	}
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

// POST /api/v1/restaurants/join
func (ctrl *RestaurantController) JoinByInviteCode(c *gin.Context) {
	userID, ok := contextUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req service.JoinRestaurantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := ctrl.restaurantSvc.JoinByInviteCode(userID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"membership": member})
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

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}

	restaurant, err := ctrl.restaurantSvc.GetRestaurant(restaurantID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "restaurant not found"})
		return
	}
	if member.Role == nil || (member.Role.Name != "owner" && member.Role.Name != "manager") {
		restaurant.InviteCode = ""
	}
	c.JSON(http.StatusOK, restaurant)
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
	if _, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}

	members, err := ctrl.restaurantSvc.ListMembers(restaurantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"members": members})
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

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if member.Role == nil || (member.Role.Name != "owner" && member.Role.Name != "manager") {
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

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if member.Role == nil || (member.Role.Name != "owner" && member.Role.Name != "manager") {
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

	member, err := ctrl.restaurantSvc.GetMembership(userID, restaurantID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this restaurant"})
		return
	}
	if member.Role == nil || (member.Role.Name != "owner" && member.Role.Name != "manager") {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owner or manager can revoke"})
		return
	}

	if err := ctrl.invitationSvc.RevokeInvitation(restaurantID, invitationID); err != nil {
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
