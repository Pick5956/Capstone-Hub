package controller

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MenuController struct {
	menuSvc *service.MenuService
}

func ProvideMenuController(db *gorm.DB) *MenuController {
	return &MenuController{
		menuSvc: service.ProvideMenuService(repository.NewMenuRepository(db)),
	}
}

func contextRestaurantID(c *gin.Context) (uint, bool) {
	v, ok := c.Get("restaurant_id")
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

func contextMember(c *gin.Context) (*entity.RestaurantMember, bool) {
	v, ok := c.Get("restaurant_member")
	if !ok {
		return nil, false
	}
	member, ok := v.(*entity.RestaurantMember)
	return member, ok
}

func memberCan(c *gin.Context, permission string) bool {
	member, ok := contextMember(c)
	if !ok || member.Role == nil {
		return false
	}
	if service.MemberHasPermission(member, permission) {
		return true
	}
	if member.PermissionsOverride != nil {
		return false
	}
	if member.Role.Permissions != "" {
		return false
	}
	role := member.Role.Name
	if permission == "view_menu" {
		return role == "owner" || role == "manager" || role == "waiter" || role == "chef"
	}
	if permission == "manage_menu" {
		return role == "owner" || role == "manager"
	}
	if permission == "view_tables" {
		return role == "owner" || role == "manager" || role == "cashier" || role == "waiter"
	}
	if permission == "manage_table" {
		return role == "owner" || role == "manager"
	}
	if permission == "take_order" {
		return role == "owner" || role == "manager" || role == "waiter"
	}
	if permission == "view_orders" {
		return role == "owner" || role == "manager" || role == "cashier" || role == "waiter"
	}
	if permission == "view_kitchen" {
		return role == "owner" || role == "manager" || role == "chef"
	}
	if permission == "update_order_status" {
		return role == "owner" || role == "manager" || role == "chef"
	}
	if permission == "take_payment" {
		return role == "owner" || role == "manager" || role == "cashier" || role == "waiter"
	}
	if permission == "manage_inventory" {
		return role == "owner" || role == "manager"
	}
	if permission == "manage_expenses" {
		return role == "owner" || role == "manager"
	}
	if permission == "view_inventory" {
		return role == "owner" || role == "manager" || role == "chef"
	}
	if permission == "view_reports" {
		return role == "owner" || role == "manager"
	}
	return false
}

func memberCanAny(c *gin.Context, permissions ...string) bool {
	for _, permission := range permissions {
		if memberCan(c, permission) {
			return true
		}
	}
	return false
}

func requireRestaurant(c *gin.Context) (uint, bool) {
	restaurantID, ok := contextRestaurantID(c)
	if !ok || restaurantID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "restaurant context is required"})
		return 0, false
	}
	return restaurantID, true
}

func parseUintParam(c *gin.Context, key string) (uint, bool) {
	raw := c.Param(key)
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return 0, false
	}
	return uint(id), true
}

func (ctrl *MenuController) ListCategories(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing menu permission", "view_menu", "manage_menu", "take_order")
	if !ok {
		return
	}
	categories, err := ctrl.menuSvc.ListCategories(restaurantID, memberCan(c, "manage_menu"))
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"categories": categories})
}

func (ctrl *MenuController) CreateCategory(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
		return
	}
	var req service.CategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	category, err := ctrl.menuSvc.CreateCategory(restaurantID, &req)
	if err != nil {
		// Keep the explicit payload: the menu page matches on this exact code.
		if errors.Is(err, service.ErrCategoryNameExists) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "CATEGORY_NAME_EXISTS"})
			return
		}
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, category)
}

func (ctrl *MenuController) UpdateCategory(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
		return
	}
	categoryID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.CategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	category, err := ctrl.menuSvc.UpdateCategory(restaurantID, categoryID, &req)
	if err != nil {
		// Keep the explicit payload: the menu page matches on this exact code.
		if errors.Is(err, service.ErrCategoryNameExists) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "CATEGORY_NAME_EXISTS"})
			return
		}
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, category)
}

func (ctrl *MenuController) DeleteCategory(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
		return
	}
	categoryID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := ctrl.menuSvc.DeleteCategory(restaurantID, categoryID); err != nil {
		respondAPIError(c, http.StatusConflict, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (ctrl *MenuController) ListMenuItems(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing menu permission", "view_menu", "manage_menu", "take_order")
	if !ok {
		return
	}
	categoryID, ok := optionalUintQuery(c, "category_id", "invalid category_id")
	if !ok {
		return
	}
	items, err := ctrl.menuSvc.ListMenuItems(restaurantID, memberCan(c, "manage_menu"), categoryID)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"menu_items": items})
}

func (ctrl *MenuController) CreateMenuItem(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
		return
	}
	var req service.MenuItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	item, err := ctrl.menuSvc.CreateMenuItem(restaurantID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (ctrl *MenuController) UpdateMenuItem(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
		return
	}
	itemID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.MenuItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	item, err := ctrl.menuSvc.UpdateMenuItem(restaurantID, itemID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (ctrl *MenuController) UpdateMenuItemAvailability(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
		return
	}
	itemID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req service.MenuItemAvailabilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondInvalidRequest(c)
		return
	}
	item, err := ctrl.menuSvc.UpdateMenuItemAvailability(restaurantID, itemID, &req)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (ctrl *MenuController) DeleteMenuItem(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
		return
	}
	itemID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := ctrl.menuSvc.DeleteMenuItem(restaurantID, itemID); err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (ctrl *MenuController) UploadMenuImage(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "manage_menu", "missing manage_menu permission")
	if !ok {
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
	relativeDir := filepath.Join("uploads", "menu", strconv.FormatUint(uint64(restaurantID), 10))
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

	publicPath := "/uploads/menu/" + strconv.FormatUint(uint64(restaurantID), 10) + "/" + fileName
	c.JSON(http.StatusCreated, gin.H{
		"image_url": publicURL(c, publicPath),
		"path":      publicPath,
	})
}
