package service

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

const (
	DefaultOwnerRoleName = "owner"
)

var restaurantTimePattern = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

type RestaurantService struct {
	restaurantRepo *repository.RestaurantRepository
	memberRepo     *repository.RestaurantMemberRepository
	roleRepo       *repository.RoleRepository
	auditRepo      *repository.RestaurantAuditLogRepository
	setupRepo      *repository.RestaurantSetupRepository
	menuRepo       *repository.MenuRepository
	ingredientRepo *repository.IngredientRepository
}

func ProvideRestaurantService(
	restaurantRepo *repository.RestaurantRepository,
	memberRepo *repository.RestaurantMemberRepository,
	roleRepo *repository.RoleRepository,
	auditRepo *repository.RestaurantAuditLogRepository,
	setupRepo *repository.RestaurantSetupRepository,
	menuRepo *repository.MenuRepository,
	ingredientRepo *repository.IngredientRepository,
) *RestaurantService {
	return &RestaurantService{
		restaurantRepo: restaurantRepo,
		memberRepo:     memberRepo,
		roleRepo:       roleRepo,
		auditRepo:      auditRepo,
		setupRepo:      setupRepo,
		menuRepo:       menuRepo,
		ingredientRepo: ingredientRepo,
	}
}

type starterCategories struct {
	Menu       []string
	Ingredient []string
}

type starterIngredient struct {
	Name         string
	SKU          string
	Unit         string
	Stock        float64
	MinStock     float64
	CostPerUnit  float64
	YieldPercent float64
	StorageType  string
}

type starterMenuItem struct {
	Name         string
	Price        float64
	Description  string
	OptionGroups []starterOptionGroup
}

type starterOptionGroup struct {
	Name      string
	Required  bool
	MinSelect int
	MaxSelect int
	Options   []starterOption
}

type starterOption struct {
	Name       string
	PriceDelta float64
	IsDefault  bool
}

type starterMockupData struct {
	Ingredients map[string][]starterIngredient
	MenuItems   map[string][]starterMenuItem
}

var restaurantTypeStarterCategories = map[string]starterCategories{
	"ร้านอาหาร": {
		Menu:       []string{"อาหารจานเดียว", "กับข้าว", "เส้น", "ของทานเล่น", "เครื่องดื่ม"},
		Ingredient: []string{"เนื้อสัตว์", "ผัก", "เครื่องปรุง", "ของแห้ง", "เครื่องดื่ม"},
	},
	"คาเฟ่": {
		Menu:       []string{"กาแฟ", "ชา", "เครื่องดื่มเย็น", "เบเกอรี่", "ของหวาน"},
		Ingredient: []string{"เมล็ดกาแฟ", "ชาและผงชง", "นมและครีม", "ไซรัป", "เบเกอรี่"},
	},
	"ชาบู/ปิ้งย่าง": {
		Menu:       []string{"ชุดเซ็ต", "เนื้อสัตว์", "ผัก", "น้ำจิ้ม", "เครื่องดื่ม"},
		Ingredient: []string{"เนื้อสัตว์", "ซีฟู้ด", "ผักสด", "น้ำซุปและซอส", "ของแช่แข็ง"},
	},
	"เดลิเวอรี": {
		Menu:       []string{"เมนูขายดี", "อาหารจานเดียว", "ชุดคอมโบ", "ของทานเล่น", "เครื่องดื่ม"},
		Ingredient: []string{"วัตถุดิบหลัก", "เครื่องปรุง", "บรรจุภัณฑ์", "ของแช่เย็น", "เครื่องดื่ม"},
	},
	"ฟู้ดทรัค": {
		Menu:       []string{"เมนูหลัก", "เมนูทานเล่น", "ชุดคอมโบ", "ซอสและท็อปปิ้ง", "เครื่องดื่ม"},
		Ingredient: []string{"วัตถุดิบหลัก", "ของแห้ง", "ซอสและท็อปปิ้ง", "บรรจุภัณฑ์", "เครื่องดื่ม"},
	},
}

var restaurantTypeStarterMockups = map[string]starterMockupData{
	"ร้านอาหาร": {
		Ingredients: map[string][]starterIngredient{
			"เนื้อสัตว์": {
				{Name: "เนื้อหมู", SKU: "ING-PORK", Unit: "กรัม", Stock: 15000, MinStock: 2000, CostPerUnit: 0.16, YieldPercent: 100, StorageType: "chilled"},
				{Name: "เนื้อไก่", SKU: "ING-CHICKEN", Unit: "กรัม", Stock: 12000, MinStock: 2000, CostPerUnit: 0.09, YieldPercent: 95, StorageType: "chilled"},
			},
			"ผัก": {
				{Name: "ใบกะเพรา", SKU: "ING-BASIL", Unit: "กรัม", Stock: 2500, MinStock: 400, CostPerUnit: 0.05, YieldPercent: 85, StorageType: "chilled"},
				{Name: "ผักคะน้า", SKU: "ING-KALE", Unit: "กรัม", Stock: 6000, MinStock: 1000, CostPerUnit: 0.045, YieldPercent: 85, StorageType: "chilled"},
			},
			"เครื่องปรุง": {
				{Name: "น้ำปลา", SKU: "ING-FISH-SAUCE", Unit: "มิลลิลิตร", Stock: 7000, MinStock: 1400, CostPerUnit: 0.04, YieldPercent: 100, StorageType: "room_temp"},
			},
		},
		MenuItems: map[string][]starterMenuItem{
			"อาหารจานเดียว": {
				{Name: "ข้าวกะเพราไก่ไข่ดาว", Price: 79, Description: "ไก่ผัดกะเพรารสจัดเสิร์ฟพร้อมไข่ดาว"},
				{Name: "ผัดซีอิ๊วหมู", Price: 75, Description: "เส้นใหญ่ผัดซีอิ๊วกับหมูและคะน้า"},
			},
			"ของทานเล่น": {
				{Name: "ปีกไก่ทอดน้ำปลา", Price: 99, Description: "ปีกไก่ทอดกรอบเคลือบน้ำปลา"},
			},
		},
	},
	"คาเฟ่": {
		Ingredients: map[string][]starterIngredient{
			"เมล็ดกาแฟ": {
				{Name: "เมล็ดกาแฟคั่วกลาง", SKU: "ING-COFFEE-BEAN", Unit: "กรัม", Stock: 5000, MinStock: 1000, CostPerUnit: 0.55, YieldPercent: 100, StorageType: "room_temp"},
			},
			"นมและครีม": {
				{Name: "นมสด", SKU: "ING-MILK", Unit: "มิลลิลิตร", Stock: 12000, MinStock: 2000, CostPerUnit: 0.055, YieldPercent: 100, StorageType: "chilled"},
			},
			"ไซรัป": {
				{Name: "ไซรัปวานิลลา", SKU: "ING-VANILLA-SYRUP", Unit: "มิลลิลิตร", Stock: 3000, MinStock: 750, CostPerUnit: 0.18, YieldPercent: 100, StorageType: "room_temp"},
			},
		},
		MenuItems: map[string][]starterMenuItem{
			"กาแฟ": {
				{Name: "อเมริกาโน่เย็น", Price: 65, Description: "กาแฟดำเย็นหอมเข้ม"},
				{Name: "ลาเต้เย็น", Price: 75, Description: "เอสเพรสโซ่ผสมนมสดเนียนนุ่ม"},
			},
			"เบเกอรี่": {
				{Name: "ครัวซองต์เนยสด", Price: 85, Description: "ครัวซองต์อบใหม่หอมเนย"},
			},
		},
	},
	"ชาบู/ปิ้งย่าง": {
		Ingredients: map[string][]starterIngredient{
			"เนื้อสัตว์": {
				{Name: "หมูสไลซ์", SKU: "ING-PORK-SLICE", Unit: "กรัม", Stock: 20000, MinStock: 3000, CostPerUnit: 0.22, YieldPercent: 100, StorageType: "frozen"},
				{Name: "เนื้อวัวสไลซ์", SKU: "ING-BEEF-SLICE", Unit: "กรัม", Stock: 12000, MinStock: 2000, CostPerUnit: 0.48, YieldPercent: 100, StorageType: "frozen"},
			},
			"ผักสด": {
				{Name: "ผักกาดขาว", SKU: "ING-NAPA", Unit: "กรัม", Stock: 8000, MinStock: 1500, CostPerUnit: 0.035, YieldPercent: 85, StorageType: "chilled"},
			},
		},
		MenuItems: map[string][]starterMenuItem{
			"ชุดเซ็ต": {
				{Name: "ชุดหมูรวม", Price: 299, Description: "หมูสไลซ์ ลูกชิ้น ผักสด และน้ำจิ้ม"},
				{Name: "ชุดเนื้อพรีเมียม", Price: 459, Description: "เนื้อวัวสไลซ์คัดพิเศษพร้อมผักสด"},
			},
		},
	},
	"เดลิเวอรี": {
		Ingredients: map[string][]starterIngredient{
			"วัตถุดิบหลัก": {
				{Name: "ข้าวหอมมะลิ", SKU: "ING-RICE", Unit: "กรัม", Stock: 45000, MinStock: 10000, CostPerUnit: 0.035, YieldPercent: 100, StorageType: "room_temp"},
				{Name: "เนื้อไก่", SKU: "ING-DELIVERY-CHICKEN", Unit: "กรัม", Stock: 15000, MinStock: 2500, CostPerUnit: 0.09, YieldPercent: 95, StorageType: "chilled"},
			},
			"บรรจุภัณฑ์": {
				{Name: "กล่องอาหาร", SKU: "PACK-BOX", Unit: "ใบ", Stock: 500, MinStock: 100, CostPerUnit: 2.5, YieldPercent: 100, StorageType: "room_temp"},
			},
		},
		MenuItems: map[string][]starterMenuItem{
			"เมนูขายดี": {
				{Name: "ข้าวไก่กระเทียม", Price: 75, Description: "ข้าวกล่องไก่กระเทียมพร้อมน้ำจิ้ม"},
				{Name: "ข้าวกะเพราหมู", Price: 75, Description: "เมนูยอดนิยมสำหรับเดลิเวอรี"},
			},
			"ชุดคอมโบ": {
				{Name: "คอมโบข้าวกะเพรา+ชาเย็น", Price: 109, Description: "เซ็ตขายดีพร้อมเครื่องดื่ม"},
			},
		},
	},
	"ฟู้ดทรัค": {
		Ingredients: map[string][]starterIngredient{
			"วัตถุดิบหลัก": {
				{Name: "ขนมปังเบอร์เกอร์", SKU: "ING-BURGER-BUN", Unit: "ชิ้น", Stock: 120, MinStock: 24, CostPerUnit: 8, YieldPercent: 100, StorageType: "room_temp"},
				{Name: "หมูบด", SKU: "ING-GROUND-PORK", Unit: "กรัม", Stock: 10000, MinStock: 1500, CostPerUnit: 0.16, YieldPercent: 100, StorageType: "chilled"},
			},
			"ซอสและท็อปปิ้ง": {
				{Name: "ชีสแผ่น", SKU: "ING-CHEESE", Unit: "แผ่น", Stock: 100, MinStock: 20, CostPerUnit: 5.5, YieldPercent: 100, StorageType: "chilled"},
			},
		},
		MenuItems: map[string][]starterMenuItem{
			"เมนูหลัก": {
				{Name: "เบอร์เกอร์หมูชีส", Price: 129, Description: "เบอร์เกอร์หมูย่างพร้อมชีสและซอสสูตรพิเศษ"},
				{Name: "ข้าวหมูย่างฟู้ดทรัค", Price: 89, Description: "ข้าวหมูย่างเสิร์ฟเร็วพร้อมน้ำจิ้ม"},
			},
			"เครื่องดื่ม": {
				{Name: "เลมอนโซดา", Price: 55, Description: "เครื่องดื่มซ่าสดชื่น"},
			},
		},
	},
}

type CreateRestaurantRequest struct {
	Name                 string  `json:"name" binding:"required"`
	BranchName           string  `json:"branch_name" binding:"required"`
	RestaurantType       string  `json:"restaurant_type" binding:"required"`
	Address              string  `json:"address"`
	Phone                string  `json:"phone"`
	Logo                 string  `json:"logo"`
	OpenTime             string  `json:"open_time"`
	CloseTime            string  `json:"close_time"`
	TableCount           int     `json:"table_count"`
	SeedMockupData       bool    `json:"seed_mockup_data"`
	ServiceChargeEnabled bool    `json:"service_charge_enabled"`
	ServiceChargeRate    float64 `json:"service_charge_rate"`
	VATEnabled           bool    `json:"vat_enabled"`
	VATRate              float64 `json:"vat_rate"`
	PromptPayName        string  `json:"promptpay_name"`
	PromptPayQRImage     string  `json:"promptpay_qr_image"`
	CoverImage           string  `json:"cover_image"`
}

type UpdateRestaurantRequest struct {
	Name                 string  `json:"name" binding:"required"`
	BranchName           string  `json:"branch_name" binding:"required"`
	RestaurantType       string  `json:"restaurant_type" binding:"required"`
	Address              string  `json:"address"`
	Phone                string  `json:"phone"`
	Logo                 string  `json:"logo"`
	OpenTime             string  `json:"open_time"`
	CloseTime            string  `json:"close_time"`
	TableCount           int     `json:"table_count"`
	ServiceChargeEnabled bool    `json:"service_charge_enabled"`
	ServiceChargeRate    float64 `json:"service_charge_rate"`
	VATEnabled           bool    `json:"vat_enabled"`
	VATRate              float64 `json:"vat_rate"`
	PromptPayName        string  `json:"promptpay_name"`
	PromptPayQRImage     string  `json:"promptpay_qr_image"`
	CoverImage           string  `json:"cover_image"`
}

type restaurantFields struct {
	Name                 string
	BranchName           string
	RestaurantType       string
	Address              string
	Phone                string
	Logo                 string
	OpenTime             string
	CloseTime            string
	TableCount           int
	ServiceChargeEnabled bool
	ServiceChargeRate    float64
	VATEnabled           bool
	VATRate              float64
	PromptPayName        string
	PromptPayQRImage     string
	CoverImage           string
}

// CreateRestaurant creates a restaurant and adds the creator as the owner member.
func (s *RestaurantService) CreateRestaurant(userID uint, req *CreateRestaurantRequest) (*entity.Restaurant, *entity.RestaurantMember, error) {
	fields, err := sanitizeRestaurantFields(
		req.Name,
		req.BranchName,
		req.RestaurantType,
		req.Address,
		req.Phone,
		req.Logo,
		req.OpenTime,
		req.CloseTime,
		req.TableCount,
		req.ServiceChargeEnabled,
		req.ServiceChargeRate,
		req.VATEnabled,
		req.VATRate,
		req.PromptPayName,
		req.PromptPayQRImage,
		req.CoverImage,
	)
	if err != nil {
		return nil, nil, err
	}

	ownerRole, err := s.roleRepo.FindByName(DefaultOwnerRoleName)
	if err != nil {
		return nil, nil, errors.New("owner role is not configured")
	}

	var restaurant *entity.Restaurant
	var member *entity.RestaurantMember
	if err := s.setupRepo.Transaction(func(tx *repository.RestaurantSetupRepository) error {
		restaurant = &entity.Restaurant{
			Name:                 fields.Name,
			BranchName:           fields.BranchName,
			RestaurantType:       fields.RestaurantType,
			Address:              fields.Address,
			Phone:                fields.Phone,
			Logo:                 fields.Logo,
			OpenTime:             fields.OpenTime,
			CloseTime:            fields.CloseTime,
			TableCount:           fields.TableCount,
			ServiceChargeEnabled: fields.ServiceChargeEnabled,
			ServiceChargeRate:    fields.ServiceChargeRate,
			VATEnabled:           fields.VATEnabled,
			VATRate:              fields.VATRate,
			PromptPayName:        fields.PromptPayName,
			PromptPayQRImage:     fields.PromptPayQRImage,
			CoverImage:           fields.CoverImage,
			OwnerID:              userID,
		}
		if err := tx.CreateRestaurant(restaurant); err != nil {
			return err
		}

		member = &entity.RestaurantMember{
			UserID:       userID,
			RestaurantID: restaurant.ID,
			RoleID:       ownerRole.ID,
			Status:       "active",
			JoinedAt:     time.Now(),
		}
		if err := tx.CreateMember(member); err != nil {
			return err
		}

		return seedRestaurantStarterSetup(tx, restaurant.ID, fields.RestaurantType, fields.TableCount)
	}); err != nil {
		return nil, nil, err
	}
	if err := s.createStarterCategories(restaurant.ID, fields.RestaurantType); err != nil {
		return nil, nil, err
	}
	if req.SeedMockupData {
		if err := s.createStarterMockupData(restaurant.ID, fields.RestaurantType); err != nil {
			return nil, nil, err
		}
	}

	// reload with relationships for response
	loaded, err := s.memberRepo.FindByUserAndRestaurant(userID, restaurant.ID)
	if err == nil {
		member = loaded
	}

	return restaurant, member, nil
}

func (s *RestaurantService) createStarterCategories(restaurantID uint, restaurantType string) error {
	starter, ok := restaurantTypeStarterCategories[restaurantType]
	if !ok {
		starter = restaurantTypeStarterCategories["ร้านอาหาร"]
	}
	for i, name := range starter.Menu {
		if err := s.menuRepo.CreateCategory(&entity.Category{
			RestaurantID: restaurantID,
			Name:         name,
			DisplayOrder: i + 1,
			IsActive:     true,
		}); err != nil {
			return err
		}
	}
	for i, name := range starter.Ingredient {
		if err := s.ingredientRepo.CreateCategory(&entity.IngredientCategory{
			RestaurantID: restaurantID,
			Name:         name,
			DisplayOrder: i + 1,
			IsActive:     true,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *RestaurantService) createStarterMockupData(restaurantID uint, restaurantType string) error {
	mockup, ok := restaurantTypeStarterMockups[restaurantType]
	if !ok {
		mockup = restaurantTypeStarterMockups["ร้านอาหาร"]
	}
	ingredientCategoryIDs, err := s.seedStarterIngredients(restaurantID, mockup.Ingredients)
	if err != nil {
		return err
	}
	return s.seedStarterMenuItems(restaurantID, mockup.MenuItems, ingredientCategoryIDs)
}

func (s *RestaurantService) seedStarterIngredients(restaurantID uint, seeds map[string][]starterIngredient) (map[string]uint, error) {
	categoryIDs := map[string]uint{}
	for categoryName, ingredients := range seeds {
		category, err := s.ingredientRepo.FindCategoryByName(restaurantID, categoryName)
		if err != nil {
			return nil, err
		}
		categoryIDs[categoryName] = category.ID
		for _, seed := range ingredients {
			categoryID := category.ID
			if err := s.ingredientRepo.Create(&entity.Ingredient{
				RestaurantID: restaurantID,
				Name:         strings.TrimSpace(seed.Name),
				SKU:          strings.TrimSpace(seed.SKU),
				CategoryID:   &categoryID,
				Unit:         strings.TrimSpace(seed.Unit),
				Stock:        seed.Stock,
				MinStock:     seed.MinStock,
				CostPerUnit:  seed.CostPerUnit,
				YieldPercent: seed.YieldPercent,
				StorageType:  strings.TrimSpace(seed.StorageType),
			}); err != nil {
				return nil, err
			}
		}
	}
	return categoryIDs, nil
}

func (s *RestaurantService) seedStarterMenuItems(restaurantID uint, seeds map[string][]starterMenuItem, ingredientCategoryIDs map[string]uint) error {
	for categoryName, items := range seeds {
		category, err := s.menuRepo.FindCategoryByName(restaurantID, categoryName)
		if err != nil {
			return err
		}
		for i, seed := range items {
			item := &entity.MenuItem{
				RestaurantID: restaurantID,
				CategoryID:   category.ID,
				Name:         strings.TrimSpace(seed.Name),
				Price:        seed.Price,
				Description:  strings.TrimSpace(seed.Description),
				IsAvailable:  true,
				DisplayOrder: i + 1,
			}
			if err := s.menuRepo.CreateMenuItem(item); err != nil {
				return err
			}
			if err := s.menuRepo.ReplaceMenuCategories(item, categoryLinks(restaurantID, item.ID, []uint{category.ID})); err != nil {
				return err
			}
		}
	}
	_ = ingredientCategoryIDs
	return nil
}

func (s *RestaurantService) ListMyMemberships(userID uint) ([]entity.RestaurantMember, error) {
	members, err := s.memberRepo.FindActiveByUser(userID)
	if err != nil {
		return nil, err
	}
	return members, nil
}

func (s *RestaurantService) GetMembership(userID, restaurantID uint) (*entity.RestaurantMember, error) {
	member, err := s.memberRepo.FindByUserAndRestaurant(userID, restaurantID)
	if err != nil {
		return nil, err
	}
	if member.Status != "active" {
		return nil, errors.New("membership is not active")
	}
	return member, nil
}

func (s *RestaurantService) ListMembers(restaurantID uint) ([]entity.RestaurantMember, error) {
	return s.ListMembersWithStatus(restaurantID, false)
}

func (s *RestaurantService) ListMembersWithStatus(restaurantID uint, includeInactive bool) ([]entity.RestaurantMember, error) {
	var (
		members []entity.RestaurantMember
		err     error
	)

	if includeInactive {
		members, err = s.memberRepo.FindAllByRestaurant(restaurantID)
	} else {
		members, err = s.memberRepo.FindActiveByRestaurant(restaurantID)
	}
	if err != nil {
		return nil, err
	}
	return members, nil
}

func (s *RestaurantService) UpdateMemberStatus(actorUserID, restaurantID, memberID uint, nextStatus string) (*entity.RestaurantMember, error) {
	if !isMembershipStatusAllowed(nextStatus) {
		return nil, errors.New("invalid member status")
	}

	actor, target, err := s.loadManagedMemberPair(actorUserID, restaurantID, memberID)
	if err != nil {
		return nil, err
	}
	if !canManageMember(actor, target) {
		return nil, errors.New("you do not have permission to manage this member")
	}

	if target.Status == nextStatus {
		return target, nil
	}

	previousStatus := target.Status
	target.Status = nextStatus
	if err := s.memberRepo.Update(target); err != nil {
		return nil, err
	}

	updated, err := s.memberRepo.FindByID(target.ID)
	if err != nil {
		return nil, err
	}

	actorID := actor.UserID
	targetUserID := updated.UserID
	writeAuditEvent(
		s.auditRepo,
		restaurantID,
		entity.AuditActionMemberStatusChanged,
		&actorID,
		&targetUserID,
		nil,
		map[string]any{
			"from_status": previousStatus,
			"to_status":   nextStatus,
			"role_name":   roleName(updated.Role),
		},
	)

	return updated, nil
}

func (s *RestaurantService) UpdateMemberRole(actorUserID, restaurantID, memberID, roleID uint) (*entity.RestaurantMember, error) {
	actor, target, err := s.loadManagedMemberPair(actorUserID, restaurantID, memberID)
	if err != nil {
		return nil, err
	}
	if !canManageMember(actor, target) {
		return nil, errors.New("you do not have permission to manage this member")
	}

	role, err := s.roleRepo.FindByID(roleID)
	if err != nil {
		return nil, errors.New("role not found")
	}
	if !roleAssignableToRestaurant(role, restaurantID) || !canAssignMemberRole(actor, role) {
		return nil, errors.New("you do not have permission to assign this role")
	}
	if role.RestaurantID == nil {
		hidden, err := s.roleRepo.IsRoleHiddenForRestaurant(restaurantID, role.ID)
		if err != nil {
			return nil, err
		}
		if hidden {
			return nil, errors.New("role is not available for this restaurant")
		}
	}
	if target.Role != nil && target.Role.Name == role.Name {
		return target, nil
	}

	previousRole := roleName(target.Role)
	target.RoleID = role.ID
	if err := s.memberRepo.Update(target); err != nil {
		return nil, err
	}

	updated, err := s.memberRepo.FindByID(target.ID)
	if err != nil {
		return nil, err
	}

	actorID := actor.UserID
	targetUserID := updated.UserID
	writeAuditEvent(
		s.auditRepo,
		restaurantID,
		entity.AuditActionMemberRoleChanged,
		&actorID,
		&targetUserID,
		nil,
		map[string]any{
			"from_role": previousRole,
			"to_role":   roleName(role),
			"status":    updated.Status,
		},
	)

	return updated, nil
}

func (s *RestaurantService) UpdateMemberPermissions(actorUserID, restaurantID, memberID uint, permissionsOverride *([]string)) (*entity.RestaurantMember, error) {
	actor, target, err := s.loadManagedMemberPair(actorUserID, restaurantID, memberID)
	if err != nil {
		return nil, err
	}
	if !canManageMember(actor, target) {
		return nil, errors.New("you do not have permission to manage this member")
	}

	previous := target.PermissionsOverride
	if permissionsOverride == nil {
		target.PermissionsOverride = nil
	} else {
		normalized, err := normalizePermissions(*permissionsOverride)
		if err != nil {
			return nil, err
		}
		raw, err := json.Marshal(normalized)
		if err != nil {
			return nil, err
		}
		next := string(raw)
		target.PermissionsOverride = &next
	}

	if err := s.memberRepo.Update(target); err != nil {
		return nil, err
	}

	updated, err := s.memberRepo.FindByID(target.ID)
	if err != nil {
		return nil, err
	}

	var previousValue any
	if previous != nil {
		previousValue = *previous
	}
	var nextValue any
	if updated.PermissionsOverride != nil {
		nextValue = *updated.PermissionsOverride
	}
	actorID := actor.UserID
	targetUserID := updated.UserID
	writeAuditEvent(
		s.auditRepo,
		restaurantID,
		entity.AuditActionMemberPermissionsChanged,
		&actorID,
		&targetUserID,
		nil,
		map[string]any{
			"from_permissions_override": previousValue,
			"to_permissions_override":   nextValue,
			"role_name":                 roleName(updated.Role),
			"status":                    updated.Status,
		},
	)

	return updated, nil
}

func (s *RestaurantService) ListAuditLogs(actorUserID, restaurantID uint, limit int, offset int) ([]entity.RestaurantAuditLog, error) {
	actor, err := s.GetMembership(actorUserID, restaurantID)
	if err != nil {
		return nil, err
	}
	if !canManageTeam(actor) {
		return nil, errors.New("only owner or manager can view audit logs")
	}
	return s.auditRepo.ListByRestaurant(restaurantID, limit, offset)
}

func (s *RestaurantService) GetRestaurant(restaurantID uint) (*entity.Restaurant, error) {
	return s.restaurantRepo.FindByID(restaurantID)
}

func (s *RestaurantService) UpdateRestaurant(restaurantID uint, req *UpdateRestaurantRequest) (*entity.Restaurant, error) {
	restaurant, err := s.restaurantRepo.FindByID(restaurantID)
	if err != nil {
		return nil, errors.New("restaurant not found")
	}

	fields, err := sanitizeRestaurantFields(
		req.Name,
		req.BranchName,
		req.RestaurantType,
		req.Address,
		req.Phone,
		req.Logo,
		req.OpenTime,
		req.CloseTime,
		req.TableCount,
		req.ServiceChargeEnabled,
		req.ServiceChargeRate,
		req.VATEnabled,
		req.VATRate,
		req.PromptPayName,
		req.PromptPayQRImage,
		req.CoverImage,
	)
	if err != nil {
		return nil, err
	}

	restaurant.Name = fields.Name
	restaurant.BranchName = fields.BranchName
	restaurant.RestaurantType = fields.RestaurantType
	restaurant.Address = fields.Address
	restaurant.Phone = fields.Phone
	restaurant.Logo = fields.Logo
	restaurant.OpenTime = fields.OpenTime
	restaurant.CloseTime = fields.CloseTime
	restaurant.TableCount = fields.TableCount
	restaurant.ServiceChargeEnabled = fields.ServiceChargeEnabled
	restaurant.ServiceChargeRate = fields.ServiceChargeRate
	restaurant.VATEnabled = fields.VATEnabled
	restaurant.VATRate = fields.VATRate
	restaurant.PromptPayName = fields.PromptPayName
	restaurant.PromptPayQRImage = fields.PromptPayQRImage
	restaurant.CoverImage = fields.CoverImage

	if err := s.restaurantRepo.Update(restaurant); err != nil {
		return nil, err
	}
	return s.restaurantRepo.FindByID(restaurantID)
}

func (s *RestaurantService) UpdateRestaurantLogo(restaurantID uint, logo string) (*entity.Restaurant, error) {
	restaurant, err := s.restaurantRepo.FindByID(restaurantID)
	if err != nil {
		return nil, errors.New("restaurant not found")
	}

	restaurant.Logo = strings.TrimSpace(logo)
	if err := s.restaurantRepo.Update(restaurant); err != nil {
		return nil, err
	}
	return s.restaurantRepo.FindByID(restaurantID)
}

func (s *RestaurantService) UpdateRestaurantCover(restaurantID uint, coverImage string) (*entity.Restaurant, error) {
	restaurant, err := s.restaurantRepo.FindByID(restaurantID)
	if err != nil {
		return nil, errors.New("restaurant not found")
	}

	restaurant.CoverImage = strings.TrimSpace(coverImage)
	if err := s.restaurantRepo.Update(restaurant); err != nil {
		return nil, err
	}
	return s.restaurantRepo.FindByID(restaurantID)
}

func (s *RestaurantService) DeleteRestaurant(restaurantID uint) error {
	if err := s.memberRepo.DeleteByRestaurant(restaurantID); err != nil {
		return err
	}
	return s.restaurantRepo.Delete(restaurantID)
}

