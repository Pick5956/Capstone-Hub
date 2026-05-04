package routes

import (
	"Project-M/config"
	"Project-M/internal/auth"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine) {
	api := r.Group("/api")
	SetupAuthRoutes(api)
	SetupRoleRoutes(api)

	userCtrl := controller.ProvideUserController(config.DB())

	v1 := api.Group("v1")
	v1.Use(auth.Authorizes())
	v1.Use(auth.RestaurantScope(config.DB()))
	{
		v1.GET("/users/profile", userCtrl.GetProfile)
		v1.PATCH("/users/profile", userCtrl.UpdateProfile)
		v1.POST("/users/profile/upload-image", userCtrl.UploadProfileImage)
	}

	// Restaurants + invitations.
	// `api` carries the public invitation preview route, `v1` carries everything that requires auth.
	SetupRestaurantRoutes(api, v1)
	SetupMenuTableRoutes(v1)
}
