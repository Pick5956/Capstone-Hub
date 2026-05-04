package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

// SetupRestaurantRoutes registers the multi-restaurant feature routes.
//   - public  : GET /api/invitations/:token (preview)
//   - private : everything under /api/v1/restaurants and /api/v1/invitations
func SetupRestaurantRoutes(api *gin.RouterGroup, v1 *gin.RouterGroup) {
	ctrl := controller.ProvideRestaurantController(config.DB())

	// public preview — invitee can see invitation details before logging in
	api.GET("/invitations/:token", ctrl.GetInvitationByToken)

	// private (require auth)
	v1.POST("/restaurants", ctrl.Create)
	v1.POST("/restaurants/join", ctrl.JoinByInviteCode)
	v1.GET("/restaurants/me", ctrl.ListMyMemberships)
	v1.GET("/restaurants/:id", ctrl.Get)
	v1.GET("/restaurants/:id/members", ctrl.ListMembers)

	v1.POST("/restaurants/:id/invitations", ctrl.CreateInvitation)
	v1.GET("/restaurants/:id/invitations", ctrl.ListPendingInvitations)
	v1.DELETE("/restaurants/:id/invitations/:invitationId", ctrl.RevokeInvitation)

	v1.POST("/invitations/:token/accept", ctrl.AcceptInvitation)
}
