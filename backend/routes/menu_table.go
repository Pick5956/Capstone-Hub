package routes

import (
	"Project-M/config"
	"Project-M/internal/controller"

	"github.com/gin-gonic/gin"
)

func SetupMenuTableRoutes(v1 *gin.RouterGroup) {
	menuCtrl := controller.ProvideMenuController(config.DB())
	tableCtrl := controller.ProvideTableController(config.DB())

	v1.GET("/categories", menuCtrl.ListCategories)
	v1.POST("/categories", menuCtrl.CreateCategory)
	v1.PUT("/categories/:id", menuCtrl.UpdateCategory)
	v1.DELETE("/categories/:id", menuCtrl.DeleteCategory)

	v1.GET("/menu-items", menuCtrl.ListMenuItems)
	v1.POST("/menu-items", menuCtrl.CreateMenuItem)
	v1.POST("/menu-items/upload-image", menuCtrl.UploadMenuImage)
	v1.PUT("/menu-items/:id", menuCtrl.UpdateMenuItem)
	v1.DELETE("/menu-items/:id", menuCtrl.DeleteMenuItem)

	v1.GET("/tables", tableCtrl.ListTables)
	v1.POST("/tables", tableCtrl.CreateTable)
	v1.PUT("/tables/:id", tableCtrl.UpdateTable)
	v1.DELETE("/tables/:id", tableCtrl.DeleteTable)
}
