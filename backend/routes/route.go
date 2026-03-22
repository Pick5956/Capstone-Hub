package routes

import (
	"Project-M/config"
	"Project-M/internal/auth"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine){
	api := r.Group("/api")
	SetupAuthRoutes(api)
	SetupRoleRoutes(api)

	userCtrl := controller.ProvideUserController(config.DB())

	v1 := api.Group("v1")

	v1.Use(auth.Authorizes())
	{
		v1.GET("/users/profile", userCtrl.GetProfile)
	}
}