package service

import (
	"fmt"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

// starterFlatTableCapacity is the default seat count for tables seeded without a
// zone, matching the tables page default for manually added tables.
const starterFlatTableCapacity = 2

type starterProfile struct {
	TableZones           []starterTableZone
	Categories           []starterMenuCategory
	IngredientCategories []starterIngredientCategory
}

type starterTableZone struct {
	Name     string
	Prefix   string
	Capacity int
}

type starterMenuCategory struct {
	Name  string
	Items []starterMenuItem
}

// starterIngredientCategory groups starter ingredients the same way starterMenuCategory
// groups starter menu items, so the ingredient catalog seeds alongside the menu.
type starterIngredientCategory struct {
	Name  string
	Items []starterIngredient
}

func seedRestaurantStarterSetup(repo repository.RestaurantSetupWriter, restaurantID uint, restaurantType string, tableCount int, splitZones bool) error {
	profile := starterProfileFor(restaurantType)
	ingredientIDs, err := seedStarterIngredientCatalog(repo, restaurantID, profile.IngredientCategories)
	if err != nil {
		return err
	}
	if err := seedStarterMenu(repo, restaurantID, profile.Categories, ingredientIDs); err != nil {
		return err
	}
	if !splitZones {
		return seedStarterTablesFlat(repo, restaurantID, tableCount)
	}
	return seedStarterTables(repo, restaurantID, tableCount, profile.TableZones)
}

func starterProfileFor(restaurantType string) starterProfile {
	switch strings.TrimSpace(strings.ToLower(restaurantType)) {
	case "คาเฟ่", "cafe":
		return cafeStarterProfile()
	case "ชาบู/ปิ้งย่าง", "shabu / grill", "shabu", "grill":
		return shabuGrillStarterProfile()
	case "เดลิเวอรี", "delivery":
		return deliveryStarterProfile()
	case "ฟู้ดทรัค", "food truck":
		return foodTruckStarterProfile()
	default:
		return restaurantStarterProfile()
	}
}

// seedStarterIngredientCatalog creates the ingredient categories + ingredients for a
// starter profile and returns a map of ingredient name -> created ingredient ID, so
// seedStarterMenu can resolve each menu item's recipe lines to real ingredient IDs.
func seedStarterIngredientCatalog(repo repository.RestaurantSetupWriter, restaurantID uint, categories []starterIngredientCategory) (map[string]uint, error) {
	ingredientIDs := make(map[string]uint)
	for categoryIndex, categorySeed := range categories {
		category := &entity.IngredientCategory{
			RestaurantID: restaurantID,
			Name:         categorySeed.Name,
			DisplayOrder: categoryIndex + 1,
			IsActive:     true,
		}
		if err := repo.CreateIngredientCategory(category); err != nil {
			return nil, err
		}
		for _, itemSeed := range categorySeed.Items {
			categoryID := category.ID
			ingredient := &entity.Ingredient{
				RestaurantID:            restaurantID,
				Name:                    itemSeed.Name,
				SKU:                     itemSeed.SKU,
				CategoryID:              &categoryID,
				Unit:                    itemSeed.Unit,
				BaseUnit:                itemSeed.BaseUnit,
				PurchaseUnitDefault:     itemSeed.PurchaseUnitDefault,
				ConversionFactorDefault: itemSeed.ConversionFactorDefault,
				Stock:                   itemSeed.Stock,
				MinStock:                itemSeed.MinStock,
				CostPerUnit:             itemSeed.CostPerUnit,
				YieldPercent:            itemSeed.YieldPercent,
				StorageType:             itemSeed.StorageType,
			}
			if err := repo.CreateIngredient(ingredient); err != nil {
				return nil, err
			}
			ingredientIDs[itemSeed.Name] = ingredient.ID
		}
	}
	return ingredientIDs, nil
}

func seedStarterMenu(repo repository.RestaurantSetupWriter, restaurantID uint, categories []starterMenuCategory, ingredientIDs map[string]uint) error {
	for categoryIndex, categorySeed := range categories {
		category := &entity.Category{
			RestaurantID: restaurantID,
			Name:         categorySeed.Name,
			DisplayOrder: categoryIndex + 1,
			IsActive:     true,
		}
		if err := repo.CreateCategory(category); err != nil {
			return err
		}
		for itemIndex, itemSeed := range categorySeed.Items {
			item := &entity.MenuItem{
				RestaurantID: restaurantID,
				CategoryID:   category.ID,
				Name:         itemSeed.Name,
				Price:        itemSeed.Price,
				Description:  itemSeed.Description,
				IsAvailable:  true,
				DisplayOrder: itemIndex + 1,
			}
			if err := repo.CreateMenuItem(item); err != nil {
				return err
			}
			if err := repo.CreateMenuItemCategory(&entity.MenuItemCategory{
				RestaurantID: restaurantID,
				MenuItemID:   item.ID,
				CategoryID:   category.ID,
			}); err != nil {
				return err
			}
			if err := seedStarterMenuOptions(repo, restaurantID, item.ID, itemSeed.OptionGroups); err != nil {
				return err
			}
			if err := seedStarterMenuRecipe(repo, restaurantID, item.ID, itemSeed.Recipe, ingredientIDs); err != nil {
				return err
			}
		}
	}
	return nil
}

// seedStarterMenuRecipe links a menu item to its starter ingredients so stock gets
// deducted automatically once the kitchen marks an order item completed. Recipe lines that reference an
// ingredient name not present in the seeded catalog are skipped rather than failing
// the whole setup, since option-level variants aren't modeled at the recipe level.
func seedStarterMenuRecipe(repo repository.RestaurantSetupWriter, restaurantID, menuItemID uint, lines []starterRecipeLine, ingredientIDs map[string]uint) error {
	for _, line := range lines {
		ingredientID, ok := ingredientIDs[line.IngredientName]
		if !ok {
			continue
		}
		if err := repo.CreateMenuItemIngredient(&entity.MenuItemIngredient{
			RestaurantID: restaurantID,
			MenuItemID:   menuItemID,
			IngredientID: ingredientID,
			Quantity:     line.Quantity,
			Unit:         line.Unit,
		}); err != nil {
			return err
		}
	}
	return nil
}

func seedStarterMenuOptions(repo repository.RestaurantSetupWriter, restaurantID, menuItemID uint, groups []starterOptionGroup) error {
	for groupIndex, groupSeed := range groups {
		group := &entity.MenuOptionGroup{
			RestaurantID: restaurantID,
			MenuItemID:   menuItemID,
			Name:         groupSeed.Name,
			Required:     groupSeed.Required,
			MinSelect:    groupSeed.MinSelect,
			MaxSelect:    groupSeed.MaxSelect,
			DisplayOrder: groupIndex + 1,
			IsActive:     true,
		}
		if err := repo.CreateMenuOptionGroup(group); err != nil {
			return err
		}
		for optionIndex, optionSeed := range groupSeed.Options {
			option := &entity.MenuOption{
				RestaurantID:  restaurantID,
				MenuItemID:    menuItemID,
				OptionGroupID: group.ID,
				Name:          optionSeed.Name,
				PriceDelta:    optionSeed.PriceDelta,
				IsDefault:     optionSeed.IsDefault,
				DisplayOrder:  optionIndex + 1,
				IsActive:      true,
			}
			if err := repo.CreateMenuOption(option); err != nil {
				return err
			}
		}
	}
	return nil
}

func seedStarterTables(repo repository.RestaurantSetupWriter, restaurantID uint, tableCount int, zones []starterTableZone) error {
	counts := starterZoneCounts(tableCount, len(zones))
	for zoneIndex, zoneSeed := range zones {
		zoneTableCount := counts[zoneIndex]
		if zoneTableCount <= 0 {
			continue
		}
		zone := &entity.TableZone{
			RestaurantID: restaurantID,
			Name:         zoneSeed.Name,
			Prefix:       zoneSeed.Prefix,
			DisplayOrder: zoneIndex + 1,
			IsActive:     true,
		}
		if err := repo.CreateTableZone(zone); err != nil {
			return err
		}
		for sequence := 1; sequence <= zoneTableCount; sequence++ {
			label := fmt.Sprintf("%s%02d", zoneSeed.Prefix, sequence)
			customerToken, err := GenerateCustomerTableToken()
			if err != nil {
				return err
			}
			table := &entity.RestaurantTable{
				RestaurantID:   restaurantID,
				ZoneID:         &zone.ID,
				TableNumber:    label,
				DisplayLabel:   label,
				SequenceNumber: sequence,
				Capacity:       zoneSeed.Capacity,
				Zone:           zoneSeed.Name,
				Status:         entity.TableStatusFree,
				CustomerToken:  customerToken,
			}
			if err := repo.CreateTable(table); err != nil {
				return err
			}
		}
	}
	return nil
}

// seedStarterTablesFlat creates a single, un-zoned run of tables numbered in the
// order the owner asked for (T1..Tn). It mirrors the label convention the tables
// page uses when adding tables without a zone, so manual additions continue the
// same sequence.
func seedStarterTablesFlat(repo repository.RestaurantSetupWriter, restaurantID uint, tableCount int) error {
	if tableCount < 1 {
		tableCount = 1
	}
	for sequence := 1; sequence <= tableCount; sequence++ {
		label := fmt.Sprintf("T%d", sequence)
		customerToken, err := GenerateCustomerTableToken()
		if err != nil {
			return err
		}
		table := &entity.RestaurantTable{
			RestaurantID:   restaurantID,
			ZoneID:         nil,
			TableNumber:    label,
			DisplayLabel:   label,
			SequenceNumber: sequence,
			Capacity:       starterFlatTableCapacity,
			Status:         entity.TableStatusFree,
			CustomerToken:  customerToken,
		}
		if err := repo.CreateTable(table); err != nil {
			return err
		}
	}
	return nil
}

func starterZoneCounts(tableCount, zoneCount int) []int {
	if tableCount < 1 {
		tableCount = 1
	}
	if zoneCount < 1 {
		return nil
	}
	counts := make([]int, zoneCount)
	base := tableCount / zoneCount
	remainder := tableCount % zoneCount
	for i := range counts {
		counts[i] = base
		if i < remainder {
			counts[i]++
		}
	}
	return counts
}

func restaurantStarterProfile() starterProfile {
	return starterProfile{
		TableZones: []starterTableZone{
			{Name: "โซนหน้าร้าน", Prefix: "F", Capacity: 2},
			{Name: "โซนครอบครัว", Prefix: "A", Capacity: 4},
			{Name: "ห้องส่วนตัว", Prefix: "P", Capacity: 6},
		},
		IngredientCategories: []starterIngredientCategory{
			{
				Name: "เนื้อสัตว์",
				Items: []starterIngredient{
					{Name: "ไก่สับ", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 6000, MinStock: 1500, CostPerUnit: 0.12, YieldPercent: 100, StorageType: "chilled"},
					{Name: "กุ้งสด", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 4000, MinStock: 1000, CostPerUnit: 0.35, YieldPercent: 100, StorageType: "chilled"},
					{Name: "เนื้อปู", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 2000, MinStock: 500, CostPerUnit: 0.6, YieldPercent: 100, StorageType: "chilled"},
					{Name: "หมูสับ", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 5000, MinStock: 1200, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ไข่ไก่", Unit: "ฟอง", BaseUnit: "ฟอง", PurchaseUnitDefault: "แผง (30 ฟอง)", ConversionFactorDefault: 30, Stock: 90, MinStock: 30, CostPerUnit: 5, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ปีกไก่", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.13, YieldPercent: 100, StorageType: "chilled"},
				},
			},
			{
				Name: "ผักและสมุนไพร",
				Items: []starterIngredient{
					{Name: "กะเพรา", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 1200, MinStock: 300, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "chilled"},
					{Name: "คะน้า", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 1200, MinStock: 300, CostPerUnit: 0.1, YieldPercent: 100, StorageType: "chilled"},
					{Name: "มะเขือ", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 800, MinStock: 200, CostPerUnit: 0.08, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ต้นหอม", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 500, MinStock: 150, CostPerUnit: 0.1, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ถั่วลิสง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 500, MinStock: 150, CostPerUnit: 0.2, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "มะนาว", Unit: "ลูก", BaseUnit: "ลูก", PurchaseUnitDefault: "ถุง (10 ลูก)", ConversionFactorDefault: 10, Stock: 60, MinStock: 15, CostPerUnit: 5, YieldPercent: 100, StorageType: "chilled"},
					{Name: "พริกป่น", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 500, MinStock: 100, CostPerUnit: 0.3, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "เห็ด", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 800, MinStock: 200, CostPerUnit: 0.12, YieldPercent: 100, StorageType: "chilled"},
				},
			},
			{
				Name: "ของแห้งและเครื่องปรุง",
				Items: []starterIngredient{
					{Name: "ข้าวสาร", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กระสอบ (15 กก.)", ConversionFactorDefault: 15000, Stock: 30000, MinStock: 5000, CostPerUnit: 0.03, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "เส้นจันท์", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.06, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "เส้นใหญ่", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.05, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำปลา", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (700 มล.)", ConversionFactorDefault: 700, Stock: 2800, MinStock: 700, CostPerUnit: 0.05, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ซอสมะขาม", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (700 มล.)", ConversionFactorDefault: 700, Stock: 1400, MinStock: 700, CostPerUnit: 0.08, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ซีอิ๊วขาว", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (700 มล.)", ConversionFactorDefault: 700, Stock: 2100, MinStock: 700, CostPerUnit: 0.04, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "กะทิ", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "กล่อง (500 มล.)", ConversionFactorDefault: 500, Stock: 2000, MinStock: 500, CostPerUnit: 0.06, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "พริกแกงเขียวหวาน", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 800, MinStock: 200, CostPerUnit: 0.4, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ข้าวคั่ว", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 400, MinStock: 100, CostPerUnit: 0.3, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterIngredient{
					{Name: "ใบชาไทย", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 600, MinStock: 150, CostPerUnit: 0.5, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "นมข้นหวาน", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "กระป๋อง (385 มล.)", ConversionFactorDefault: 385, Stock: 1540, MinStock: 385, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "โซดา", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (325 มล.)", ConversionFactorDefault: 325, Stock: 1950, MinStock: 325, CostPerUnit: 0.03, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำเปล่าขวด", Unit: "ขวด", BaseUnit: "ขวด", PurchaseUnitDefault: "แพ็ค (12 ขวด)", ConversionFactorDefault: 12, Stock: 48, MinStock: 12, CostPerUnit: 6, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
		},
		Categories: []starterMenuCategory{
			{
				Name: "อาหารจานเดียว",
				Items: []starterMenuItem{
					{
						Name: "ข้าวกะเพราไก่ไข่ดาว", Price: 79, Description: "ไก่สับผัดกะเพราราดข้าว พร้อมไข่ดาว",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "ไก่สับ", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กะเพรา", Quantity: 30, Unit: "กรัม"},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
						},
					},
					{
						Name: "ผัดไทยกุ้งสด", Price: 89, Description: "เส้นจันท์ผัดซอสมะขาม กุ้งสด เต้าหู้ และถั่วลิสง",
						Recipe: []starterRecipeLine{
							{IngredientName: "เส้นจันท์", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กุ้งสด", Quantity: 80, Unit: "กรัม"},
							{IngredientName: "ถั่วลิสง", Quantity: 20, Unit: "กรัม"},
							{IngredientName: "ซอสมะขาม", Quantity: 40, Unit: "มล."},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
						},
					},
					{
						Name: "ข้าวผัดปู", Price: 95, Description: "ข้าวหอมผัดไข่กับเนื้อปู ต้นหอม และมะนาว",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "เนื้อปู", Quantity: 80, Unit: "กรัม"},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
							{IngredientName: "ต้นหอม", Quantity: 10, Unit: "กรัม"},
						},
					},
					{
						Name: "ผัดซีอิ๊วหมู", Price: 75, Description: "เส้นใหญ่ผัดซีอิ๊วกับหมู ไข่ และคะน้า",
						Recipe: []starterRecipeLine{
							{IngredientName: "เส้นใหญ่", Quantity: 200, Unit: "กรัม"},
							{IngredientName: "หมูสับ", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "คะน้า", Quantity: 60, Unit: "กรัม"},
							{IngredientName: "ซีอิ๊วขาว", Quantity: 20, Unit: "มล."},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
						},
					},
				},
			},
			{
				Name: "กับข้าว",
				Items: []starterMenuItem{
					{
						Name: "ต้มยำกุ้งน้ำข้น", Price: 139, Description: "กุ้งสด เห็ด และสมุนไพรต้มยำรสจัด",
						Recipe: []starterRecipeLine{
							{IngredientName: "กุ้งสด", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "เห็ด", Quantity: 50, Unit: "กรัม"},
							{IngredientName: "น้ำปลา", Quantity: 20, Unit: "มล."},
							{IngredientName: "มะนาว", Quantity: 1, Unit: "ลูก"},
						},
					},
					{
						Name: "แกงเขียวหวานไก่", Price: 129, Description: "แกงกะทิพริกแกงเขียวหวาน ไก่ และมะเขือ",
						Recipe: []starterRecipeLine{
							{IngredientName: "ไก่สับ", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กะทิ", Quantity: 200, Unit: "มล."},
							{IngredientName: "พริกแกงเขียวหวาน", Quantity: 40, Unit: "กรัม"},
							{IngredientName: "มะเขือ", Quantity: 50, Unit: "กรัม"},
						},
					},
					{
						Name: "ลาบหมู", Price: 95, Description: "หมูสับคลุกข้าวคั่ว พริกป่น มะนาว และสมุนไพร",
						Recipe: []starterRecipeLine{
							{IngredientName: "หมูสับ", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "ข้าวคั่ว", Quantity: 20, Unit: "กรัม"},
							{IngredientName: "พริกป่น", Quantity: 5, Unit: "กรัม"},
							{IngredientName: "มะนาว", Quantity: 1, Unit: "ลูก"},
						},
					},
					{
						Name: "ปีกไก่ทอดน้ำปลา", Price: 99, Description: "ปีกไก่ทอดกรอบเคลือบน้ำปลา",
						Recipe: []starterRecipeLine{
							{IngredientName: "ปีกไก่", Quantity: 200, Unit: "กรัม"},
							{IngredientName: "น้ำปลา", Quantity: 20, Unit: "มล."},
						},
					},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{
						Name: "ชาไทยเย็น", Price: 49, Description: "ชาไทยเข้มข้นใส่นม เสิร์ฟเย็น",
						Recipe: []starterRecipeLine{
							{IngredientName: "ใบชาไทย", Quantity: 15, Unit: "กรัม"},
							{IngredientName: "นมข้นหวาน", Quantity: 30, Unit: "มล."},
						},
					},
					{
						Name: "น้ำมะนาวโซดา", Price: 45, Description: "มะนาวสดผสมโซดา",
						Recipe: []starterRecipeLine{
							{IngredientName: "มะนาว", Quantity: 1, Unit: "ลูก"},
							{IngredientName: "โซดา", Quantity: 200, Unit: "มล."},
						},
					},
					{
						Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด",
						Recipe: []starterRecipeLine{
							{IngredientName: "น้ำเปล่าขวด", Quantity: 1, Unit: "ขวด"},
						},
					},
				},
			},
		},
	}
}

func cafeStarterProfile() starterProfile {
	sizeGroup := starterOptionGroup{
		Name:      "ขนาด",
		Required:  true,
		MinSelect: 1,
		MaxSelect: 1,
		Options: []starterOption{
			{Name: "ปกติ", IsDefault: true},
			{Name: "ใหญ่", PriceDelta: 15},
		},
	}
	sweetnessGroup := starterOptionGroup{
		Name:      "ความหวาน",
		Required:  true,
		MinSelect: 1,
		MaxSelect: 1,
		Options: []starterOption{
			{Name: "หวานปกติ", IsDefault: true},
			{Name: "หวานน้อย"},
			{Name: "ไม่หวาน"},
		},
	}
	return starterProfile{
		TableZones: []starterTableZone{
			{Name: "Indoor", Prefix: "I", Capacity: 2},
			{Name: "Outdoor", Prefix: "O", Capacity: 2},
		},
		IngredientCategories: []starterIngredientCategory{
			{
				Name: "กาแฟและชา",
				Items: []starterIngredient{
					{Name: "เมล็ดกาแฟคั่ว", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 4000, MinStock: 800, CostPerUnit: 0.6, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "นมสด", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ลิตร", ConversionFactorDefault: 1000, Stock: 12000, MinStock: 2000, CostPerUnit: 0.05, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ผงมัทฉะ", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กระป๋อง (100 กรัม)", ConversionFactorDefault: 100, Stock: 300, MinStock: 100, CostPerUnit: 2, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ผงโกโก้", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (500 กรัม)", ConversionFactorDefault: 500, Stock: 1500, MinStock: 300, CostPerUnit: 0.5, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ชาผลไม้กลิ่นพีช", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 600, MinStock: 150, CostPerUnit: 1, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำเชื่อม", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (750 มล.)", ConversionFactorDefault: 750, Stock: 2250, MinStock: 750, CostPerUnit: 0.05, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำแข็ง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (5 กก.)", ConversionFactorDefault: 5000, Stock: 20000, MinStock: 5000, CostPerUnit: 0.01, YieldPercent: 100, StorageType: "frozen"},
				},
			},
			{
				Name: "เบเกอรี่",
				Items: []starterIngredient{
					{Name: "ครัวซองต์เนยสด (ชิ้นสำเร็จ)", Unit: "ชิ้น", BaseUnit: "ชิ้น", PurchaseUnitDefault: "แพ็ค (20 ชิ้น)", ConversionFactorDefault: 20, Stock: 40, MinStock: 20, CostPerUnit: 25, YieldPercent: 100, StorageType: "frozen"},
					{Name: "เค้กช็อกโกแลต (ชิ้นสำเร็จ)", Unit: "ชิ้น", BaseUnit: "ชิ้น", PurchaseUnitDefault: "กล่อง (8 ชิ้น)", ConversionFactorDefault: 8, Stock: 16, MinStock: 8, CostPerUnit: 45, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ชีสเค้กหน้าไหม้ (ชิ้นสำเร็จ)", Unit: "ชิ้น", BaseUnit: "ชิ้น", PurchaseUnitDefault: "กล่อง (8 ชิ้น)", ConversionFactorDefault: 8, Stock: 16, MinStock: 8, CostPerUnit: 50, YieldPercent: 100, StorageType: "chilled"},
				},
			},
		},
		Categories: []starterMenuCategory{
			{
				Name: "กาแฟ",
				Items: []starterMenuItem{
					{
						Name: "อเมริกาโน่เย็น", Price: 65, Description: "กาแฟดำเย็นสกัดสด", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "เมล็ดกาแฟคั่ว", Quantity: 18, Unit: "กรัม"},
							{IngredientName: "น้ำแข็ง", Quantity: 150, Unit: "กรัม"},
						},
					},
					{
						Name: "ลาเต้เย็น", Price: 75, Description: "เอสเปรสโซกับนมสด", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "เมล็ดกาแฟคั่ว", Quantity: 18, Unit: "กรัม"},
							{IngredientName: "นมสด", Quantity: 150, Unit: "มล."},
							{IngredientName: "น้ำแข็ง", Quantity: 100, Unit: "กรัม"},
						},
					},
					{
						Name: "คาปูชิโน่เย็น", Price: 75, Description: "กาแฟนมพร้อมฟองนมนุ่ม", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "เมล็ดกาแฟคั่ว", Quantity: 18, Unit: "กรัม"},
							{IngredientName: "นมสด", Quantity: 120, Unit: "มล."},
							{IngredientName: "น้ำแข็ง", Quantity: 100, Unit: "กรัม"},
						},
					},
				},
			},
			{
				Name: "ชาและนม",
				Items: []starterMenuItem{
					{
						Name: "มัทฉะลาเต้", Price: 85, Description: "มัทฉะญี่ปุ่นกับนมสด", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "ผงมัทฉะ", Quantity: 8, Unit: "กรัม"},
							{IngredientName: "นมสด", Quantity: 150, Unit: "มล."},
							{IngredientName: "น้ำเชื่อม", Quantity: 15, Unit: "มล."},
							{IngredientName: "น้ำแข็ง", Quantity: 100, Unit: "กรัม"},
						},
					},
					{
						Name: "โกโก้เย็น", Price: 70, Description: "โกโก้เข้มข้นใส่นม", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "ผงโกโก้", Quantity: 20, Unit: "กรัม"},
							{IngredientName: "นมสด", Quantity: 150, Unit: "มล."},
							{IngredientName: "น้ำแข็ง", Quantity: 100, Unit: "กรัม"},
						},
					},
					{
						Name: "ชาพีช", Price: 65, Description: "ชาผลไม้กลิ่นพีช เสิร์ฟเย็น", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "ชาผลไม้กลิ่นพีช", Quantity: 10, Unit: "กรัม"},
							{IngredientName: "น้ำเชื่อม", Quantity: 20, Unit: "มล."},
							{IngredientName: "น้ำแข็ง", Quantity: 150, Unit: "กรัม"},
						},
					},
				},
			},
			{
				Name: "เบเกอรี่",
				Items: []starterMenuItem{
					{
						Name: "ครัวซองต์เนยสด", Price: 85, Description: "ครัวซองต์อบใหม่ หอมเนย",
						Recipe: []starterRecipeLine{{IngredientName: "ครัวซองต์เนยสด (ชิ้นสำเร็จ)", Quantity: 1, Unit: "ชิ้น"}},
					},
					{
						Name: "เค้กช็อกโกแลต", Price: 95, Description: "เค้กช็อกโกแลตเข้มข้น",
						Recipe: []starterRecipeLine{{IngredientName: "เค้กช็อกโกแลต (ชิ้นสำเร็จ)", Quantity: 1, Unit: "ชิ้น"}},
					},
					{
						Name: "ชีสเค้กหน้าไหม้", Price: 105, Description: "ชีสเค้กเนื้อเนียนหน้าคาราเมล",
						Recipe: []starterRecipeLine{{IngredientName: "ชีสเค้กหน้าไหม้ (ชิ้นสำเร็จ)", Quantity: 1, Unit: "ชิ้น"}},
					},
				},
			},
		},
	}
}

func shabuGrillStarterProfile() starterProfile {
	brothGroup := starterOptionGroup{
		Name:      "น้ำซุป",
		Required:  true,
		MinSelect: 1,
		MaxSelect: 2,
		Options: []starterOption{
			{Name: "ซุปใส", IsDefault: true},
			{Name: "ซุปดำ"},
			{Name: "ซุปต้มยำ", PriceDelta: 39},
			{Name: "ซุปหม่าล่า", PriceDelta: 49},
		},
	}
	return starterProfile{
		TableZones: []starterTableZone{
			{Name: "โซนชาบู", Prefix: "S", Capacity: 4},
			{Name: "โซนปิ้งย่าง", Prefix: "G", Capacity: 4},
			{Name: "โซนกลุ่มใหญ่", Prefix: "V", Capacity: 8},
		},
		IngredientCategories: []starterIngredientCategory{
			{
				Name: "เนื้อสัตว์และอาหารทะเล",
				Items: []starterIngredient{
					{Name: "หมูสไลซ์", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 8000, MinStock: 2000, CostPerUnit: 0.22, YieldPercent: 100, StorageType: "frozen"},
					{Name: "เนื้อสไลซ์", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 6000, MinStock: 1500, CostPerUnit: 0.45, YieldPercent: 100, StorageType: "frozen"},
					{Name: "ลูกชิ้นรวม", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 4000, MinStock: 1000, CostPerUnit: 0.18, YieldPercent: 100, StorageType: "frozen"},
					{Name: "กุ้ง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 4000, MinStock: 1000, CostPerUnit: 0.35, YieldPercent: 100, StorageType: "frozen"},
					{Name: "หมึก", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.3, YieldPercent: 100, StorageType: "frozen"},
					{Name: "ปลา", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.28, YieldPercent: 100, StorageType: "frozen"},
					{Name: "หมูสามชั้นสไลซ์", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.2, YieldPercent: 100, StorageType: "frozen"},
					{Name: "เนื้อริบอายสไลซ์", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 2000, MinStock: 500, CostPerUnit: 0.55, YieldPercent: 100, StorageType: "frozen"},
				},
			},
			{
				Name: "ผักและเครื่องจิ้ม",
				Items: []starterIngredient{
					{Name: "ผักรวมชาบู", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.08, YieldPercent: 100, StorageType: "chilled"},
					{Name: "น้ำจิ้มสุกี้", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (700 มล.)", ConversionFactorDefault: 700, Stock: 2100, MinStock: 700, CostPerUnit: 0.06, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
			{
				Name: "น้ำซุปและเครื่องดื่ม",
				Items: []starterIngredient{
					{Name: "ผงซุปใส", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (500 กรัม)", ConversionFactorDefault: 500, Stock: 1500, MinStock: 300, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ซุปดำสำเร็จรูป", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (500 กรัม)", ConversionFactorDefault: 500, Stock: 1000, MinStock: 300, CostPerUnit: 0.2, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "พริกแกงต้มยำ", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 600, MinStock: 150, CostPerUnit: 0.35, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "พริกหม่าล่า", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 600, MinStock: 150, CostPerUnit: 0.45, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ใบชาอู่หลง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 400, MinStock: 100, CostPerUnit: 0.6, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ดอกเก๊กฮวยแห้ง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (100 กรัม)", ConversionFactorDefault: 100, Stock: 300, MinStock: 100, CostPerUnit: 0.5, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำตาลกรวด", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (1 กก.)", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 500, CostPerUnit: 0.05, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำเปล่าขวด", Unit: "ขวด", BaseUnit: "ขวด", PurchaseUnitDefault: "แพ็ค (12 ขวด)", ConversionFactorDefault: 12, Stock: 48, MinStock: 12, CostPerUnit: 6, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
		},
		Categories: []starterMenuCategory{
			{
				Name: "ชุดเริ่มต้น",
				Items: []starterMenuItem{
					{
						Name: "ชุดหมูรวม", Price: 299, Description: "หมูสไลซ์ ลูกชิ้น ผัก และน้ำจิ้ม", OptionGroups: []starterOptionGroup{brothGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "หมูสไลซ์", Quantity: 200, Unit: "กรัม"},
							{IngredientName: "ลูกชิ้นรวม", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "ผักรวมชาบู", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "น้ำจิ้มสุกี้", Quantity: 50, Unit: "มล."},
							{IngredientName: "ผงซุปใส", Quantity: 10, Unit: "กรัม"},
						},
					},
					{
						Name: "ชุดเนื้อรวม", Price: 399, Description: "เนื้อสไลซ์รวม ผัก และน้ำจิ้ม", OptionGroups: []starterOptionGroup{brothGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "เนื้อสไลซ์", Quantity: 200, Unit: "กรัม"},
							{IngredientName: "ลูกชิ้นรวม", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "ผักรวมชาบู", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "น้ำจิ้มสุกี้", Quantity: 50, Unit: "มล."},
							{IngredientName: "ผงซุปใส", Quantity: 10, Unit: "กรัม"},
						},
					},
					{
						Name: "ชุดทะเลรวม", Price: 459, Description: "กุ้ง หมึก ปลา และผักรวม", OptionGroups: []starterOptionGroup{brothGroup},
						Recipe: []starterRecipeLine{
							{IngredientName: "กุ้ง", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "หมึก", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "ปลา", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "ผักรวมชาบู", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "น้ำจิ้มสุกี้", Quantity: 50, Unit: "มล."},
							{IngredientName: "ผงซุปใส", Quantity: 10, Unit: "กรัม"},
						},
					},
				},
			},
			{
				Name: "เพิ่มพิเศษ",
				Items: []starterMenuItem{
					{
						Name: "หมูสามชั้นสไลซ์", Price: 89, Description: "หมูสามชั้นสไลซ์สำหรับชาบูหรือปิ้งย่าง",
						Recipe: []starterRecipeLine{{IngredientName: "หมูสามชั้นสไลซ์", Quantity: 150, Unit: "กรัม"}},
					},
					{
						Name: "เนื้อริบอายสไลซ์", Price: 129, Description: "เนื้อริบอายสไลซ์นุ่ม",
						Recipe: []starterRecipeLine{{IngredientName: "เนื้อริบอายสไลซ์", Quantity: 150, Unit: "กรัม"}},
					},
					{
						Name: "ผักรวม", Price: 59, Description: "ชุดผักสดรวม",
						Recipe: []starterRecipeLine{{IngredientName: "ผักรวมชาบู", Quantity: 200, Unit: "กรัม"}},
					},
					{
						Name: "น้ำจิ้มสุกี้", Price: 25, Description: "น้ำจิ้มสุกี้สูตรร้าน",
						Recipe: []starterRecipeLine{{IngredientName: "น้ำจิ้มสุกี้", Quantity: 100, Unit: "มล."}},
					},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{
						Name: "ชาอู่หลงเย็น", Price: 39, Description: "ชาอู่หลงเย็น",
						Recipe: []starterRecipeLine{{IngredientName: "ใบชาอู่หลง", Quantity: 10, Unit: "กรัม"}},
					},
					{
						Name: "น้ำเก๊กฮวย", Price: 35, Description: "เก๊กฮวยหวานหอม",
						Recipe: []starterRecipeLine{
							{IngredientName: "ดอกเก๊กฮวยแห้ง", Quantity: 8, Unit: "กรัม"},
							{IngredientName: "น้ำตาลกรวด", Quantity: 15, Unit: "กรัม"},
						},
					},
					{
						Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด",
						Recipe: []starterRecipeLine{{IngredientName: "น้ำเปล่าขวด", Quantity: 1, Unit: "ขวด"}},
					},
				},
			},
		},
	}
}

func deliveryStarterProfile() starterProfile {
	return starterProfile{
		TableZones: []starterTableZone{
			{Name: "รับออเดอร์", Prefix: "D", Capacity: 1},
			{Name: "รอไรเดอร์", Prefix: "R", Capacity: 1},
		},
		IngredientCategories: []starterIngredientCategory{
			{
				Name: "เนื้อสัตว์และของสด",
				Items: []starterIngredient{
					{Name: "ไก่สับ", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 5000, MinStock: 1200, CostPerUnit: 0.12, YieldPercent: 100, StorageType: "chilled"},
					{Name: "หมูสับ", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 4000, MinStock: 1000, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "chilled"},
					{Name: "กุ้งสด", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.35, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ไข่ไก่", Unit: "ฟอง", BaseUnit: "ฟอง", PurchaseUnitDefault: "แผง (30 ฟอง)", ConversionFactorDefault: 30, Stock: 90, MinStock: 30, CostPerUnit: 5, YieldPercent: 100, StorageType: "chilled"},
				},
			},
			{
				Name: "ผักและเครื่องปรุง",
				Items: []starterIngredient{
					{Name: "กะเพรา", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 1000, MinStock: 300, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "chilled"},
					{Name: "กระเทียม", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 1000, MinStock: 300, CostPerUnit: 0.1, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ต้นหอม", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 500, MinStock: 150, CostPerUnit: 0.1, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ถั่วลิสง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 500, MinStock: 150, CostPerUnit: 0.2, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "พริกไทย", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 400, MinStock: 100, CostPerUnit: 0.4, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำปลา", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (700 มล.)", ConversionFactorDefault: 700, Stock: 2100, MinStock: 700, CostPerUnit: 0.05, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ซอสมะขาม", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (700 มล.)", ConversionFactorDefault: 700, Stock: 1400, MinStock: 700, CostPerUnit: 0.08, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "มะนาว", Unit: "ลูก", BaseUnit: "ลูก", PurchaseUnitDefault: "ถุง (10 ลูก)", ConversionFactorDefault: 10, Stock: 60, MinStock: 15, CostPerUnit: 5, YieldPercent: 100, StorageType: "chilled"},
				},
			},
			{
				Name: "ข้าวและเส้น",
				Items: []starterIngredient{
					{Name: "ข้าวสาร", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กระสอบ (15 กก.)", ConversionFactorDefault: 15000, Stock: 30000, MinStock: 5000, CostPerUnit: 0.03, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "เส้นจันท์", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.06, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
			{
				Name: "เครื่องดื่มและบรรจุภัณฑ์",
				Items: []starterIngredient{
					{Name: "ใบชาไทย", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (200 กรัม)", ConversionFactorDefault: 200, Stock: 600, MinStock: 150, CostPerUnit: 0.5, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "นมข้นหวาน", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "กระป๋อง (385 มล.)", ConversionFactorDefault: 385, Stock: 1540, MinStock: 385, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "กล่องอาหารเดลิเวอรี", Unit: "ชิ้น", BaseUnit: "ชิ้น", PurchaseUnitDefault: "แพ็ค (50 ชิ้น)", ConversionFactorDefault: 50, Stock: 300, MinStock: 100, CostPerUnit: 2.5, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ถุงพลาสติกหูหิ้ว", Unit: "ชิ้น", BaseUnit: "ชิ้น", PurchaseUnitDefault: "แพ็ค (100 ชิ้น)", ConversionFactorDefault: 100, Stock: 400, MinStock: 100, CostPerUnit: 0.8, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำเปล่าขวด", Unit: "ขวด", BaseUnit: "ขวด", PurchaseUnitDefault: "แพ็ค (12 ขวด)", ConversionFactorDefault: 12, Stock: 48, MinStock: 12, CostPerUnit: 6, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
		},
		Categories: []starterMenuCategory{
			{
				Name: "เมนูขายดี",
				Items: []starterMenuItem{
					{
						Name: "ข้าวกะเพราไก่ไข่ดาว", Price: 79, Description: "เมนูขายดีสำหรับเดลิเวอรี",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "ไก่สับ", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กะเพรา", Quantity: 30, Unit: "กรัม"},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
							{IngredientName: "กล่องอาหารเดลิเวอรี", Quantity: 1, Unit: "ชิ้น"},
						},
					},
					{
						Name: "ข้าวหมูกระเทียม", Price: 75, Description: "หมูผัดกระเทียมพริกไทยราดข้าว",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "หมูสับ", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กระเทียม", Quantity: 20, Unit: "กรัม"},
							{IngredientName: "พริกไทย", Quantity: 3, Unit: "กรัม"},
							{IngredientName: "กล่องอาหารเดลิเวอรี", Quantity: 1, Unit: "ชิ้น"},
						},
					},
					{
						Name: "ข้าวผัดกุ้ง", Price: 89, Description: "ข้าวผัดกุ้งพร้อมผัก",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กุ้งสด", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
							{IngredientName: "ต้นหอม", Quantity: 10, Unit: "กรัม"},
							{IngredientName: "กล่องอาหารเดลิเวอรี", Quantity: 1, Unit: "ชิ้น"},
						},
					},
					{
						Name: "ผัดไทยกุ้งสด", Price: 89, Description: "ผัดไทยพร้อมกุ้งสด แยกเครื่องเคียง",
						Recipe: []starterRecipeLine{
							{IngredientName: "เส้นจันท์", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กุ้งสด", Quantity: 80, Unit: "กรัม"},
							{IngredientName: "ถั่วลิสง", Quantity: 20, Unit: "กรัม"},
							{IngredientName: "ซอสมะขาม", Quantity: 40, Unit: "มล."},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
							{IngredientName: "กล่องอาหารเดลิเวอรี", Quantity: 1, Unit: "ชิ้น"},
						},
					},
				},
			},
			{
				Name: "เซ็ตคุ้มค่า",
				Items: []starterMenuItem{
					{
						Name: "เซ็ตข้าวกะเพรา + ชาไทย", Price: 119, Description: "อาหารจานเดียวพร้อมเครื่องดื่ม",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "ไก่สับ", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กะเพรา", Quantity: 30, Unit: "กรัม"},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
							{IngredientName: "ใบชาไทย", Quantity: 15, Unit: "กรัม"},
							{IngredientName: "นมข้นหวาน", Quantity: 30, Unit: "มล."},
							{IngredientName: "กล่องอาหารเดลิเวอรี", Quantity: 1, Unit: "ชิ้น"},
							{IngredientName: "ถุงพลาสติกหูหิ้ว", Quantity: 1, Unit: "ชิ้น"},
						},
					},
					{
						Name: "เซ็ตข้าวผัด + น้ำมะนาว", Price: 125, Description: "ข้าวผัดพร้อมเครื่องดื่มสดชื่น",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กุ้งสด", Quantity: 100, Unit: "กรัม"},
							{IngredientName: "ไข่ไก่", Quantity: 1, Unit: "ฟอง"},
							{IngredientName: "มะนาว", Quantity: 1, Unit: "ลูก"},
							{IngredientName: "กล่องอาหารเดลิเวอรี", Quantity: 1, Unit: "ชิ้น"},
							{IngredientName: "ถุงพลาสติกหูหิ้ว", Quantity: 1, Unit: "ชิ้น"},
						},
					},
					{
						Name: "เซ็ตครอบครัว 3 กล่อง", Price: 239, Description: "เลือกเมนูขายดี 3 กล่องสำหรับครอบครัว",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 450, Unit: "กรัม"},
							{IngredientName: "ไก่สับ", Quantity: 300, Unit: "กรัม"},
							{IngredientName: "หมูสับ", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "กะเพรา", Quantity: 60, Unit: "กรัม"},
							{IngredientName: "ไข่ไก่", Quantity: 3, Unit: "ฟอง"},
							{IngredientName: "กล่องอาหารเดลิเวอรี", Quantity: 3, Unit: "ชิ้น"},
							{IngredientName: "ถุงพลาสติกหูหิ้ว", Quantity: 1, Unit: "ชิ้น"},
						},
					},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{
						Name: "ชาไทยเย็น", Price: 49, Description: "บรรจุขวดพร้อมส่ง",
						Recipe: []starterRecipeLine{
							{IngredientName: "ใบชาไทย", Quantity: 15, Unit: "กรัม"},
							{IngredientName: "นมข้นหวาน", Quantity: 30, Unit: "มล."},
						},
					},
					{
						Name: "น้ำมะนาว", Price: 45, Description: "น้ำมะนาวสด",
						Recipe: []starterRecipeLine{{IngredientName: "มะนาว", Quantity: 2, Unit: "ลูก"}},
					},
					{
						Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด",
						Recipe: []starterRecipeLine{{IngredientName: "น้ำเปล่าขวด", Quantity: 1, Unit: "ขวด"}},
					},
				},
			},
		},
	}
}

func foodTruckStarterProfile() starterProfile {
	return starterProfile{
		TableZones: []starterTableZone{
			{Name: "คิวหน้ารถ", Prefix: "Q", Capacity: 1},
			{Name: "จุดรับอาหาร", Prefix: "P", Capacity: 1},
		},
		IngredientCategories: []starterIngredientCategory{
			{
				Name: "เนื้อสัตว์และวัตถุดิบหลัก",
				Items: []starterIngredient{
					{Name: "เนื้อหมูเบอร์เกอร์ (แพตตี้)", Unit: "ชิ้น", BaseUnit: "ชิ้น", PurchaseUnitDefault: "ถุง (20 ชิ้น)", ConversionFactorDefault: 20, Stock: 60, MinStock: 20, CostPerUnit: 15, YieldPercent: 100, StorageType: "frozen"},
					{Name: "ขนมปังเบอร์เกอร์", Unit: "ชิ้น", BaseUnit: "ชิ้น", PurchaseUnitDefault: "ถุง (10 ชิ้น)", ConversionFactorDefault: 10, Stock: 40, MinStock: 10, CostPerUnit: 8, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ไก่กรอบชิ้น", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 3000, MinStock: 800, CostPerUnit: 0.18, YieldPercent: 100, StorageType: "frozen"},
					{Name: "ซอสเผ็ด", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (700 มล.)", ConversionFactorDefault: 700, Stock: 1400, MinStock: 700, CostPerUnit: 0.05, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "แป้งทาโก้", Unit: "แผ่น", BaseUnit: "แผ่น", PurchaseUnitDefault: "แพ็ค (12 แผ่น)", ConversionFactorDefault: 12, Stock: 36, MinStock: 12, CostPerUnit: 4, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "ไก่ฉีก", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กิโลกรัม", ConversionFactorDefault: 1000, Stock: 2000, MinStock: 500, CostPerUnit: 0.14, YieldPercent: 100, StorageType: "chilled"},
					{Name: "ข้าวสาร", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "กระสอบ (15 กก.)", ConversionFactorDefault: 15000, Stock: 15000, MinStock: 5000, CostPerUnit: 0.03, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
			{
				Name: "ของทานเล่นแช่แข็ง",
				Items: []starterIngredient{
					{Name: "มันฝรั่งแช่แข็ง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (2.5 กก.)", ConversionFactorDefault: 2500, Stock: 10000, MinStock: 2500, CostPerUnit: 0.06, YieldPercent: 100, StorageType: "frozen"},
					{Name: "นักเก็ตไก่แช่แข็ง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (1 กก.)", ConversionFactorDefault: 1000, Stock: 4000, MinStock: 1000, CostPerUnit: 0.15, YieldPercent: 100, StorageType: "frozen"},
					{Name: "ไก่ป๊อปแช่แข็ง", Unit: "กรัม", BaseUnit: "กรัม", PurchaseUnitDefault: "ถุง (1 กก.)", ConversionFactorDefault: 1000, Stock: 4000, MinStock: 1000, CostPerUnit: 0.16, YieldPercent: 100, StorageType: "frozen"},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterIngredient{
					{Name: "น้ำอัดลมโค้ก", Unit: "กระป๋อง", BaseUnit: "กระป๋อง", PurchaseUnitDefault: "แพ็ค (24 กระป๋อง)", ConversionFactorDefault: 24, Stock: 96, MinStock: 24, CostPerUnit: 10, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "มะนาว", Unit: "ลูก", BaseUnit: "ลูก", PurchaseUnitDefault: "ถุง (10 ลูก)", ConversionFactorDefault: 10, Stock: 40, MinStock: 10, CostPerUnit: 5, YieldPercent: 100, StorageType: "chilled"},
					{Name: "โซดา", Unit: "มล.", BaseUnit: "มล.", PurchaseUnitDefault: "ขวด (325 มล.)", ConversionFactorDefault: 325, Stock: 1950, MinStock: 325, CostPerUnit: 0.03, YieldPercent: 100, StorageType: "room_temp"},
					{Name: "น้ำเปล่าขวด", Unit: "ขวด", BaseUnit: "ขวด", PurchaseUnitDefault: "แพ็ค (12 ขวด)", ConversionFactorDefault: 12, Stock: 48, MinStock: 12, CostPerUnit: 6, YieldPercent: 100, StorageType: "room_temp"},
				},
			},
		},
		Categories: []starterMenuCategory{
			{
				Name: "เมนูหลัก",
				Items: []starterMenuItem{
					{
						Name: "เบอร์เกอร์หมู", Price: 89, Description: "เบอร์เกอร์หมูซอสสูตรร้าน",
						Recipe: []starterRecipeLine{
							{IngredientName: "เนื้อหมูเบอร์เกอร์ (แพตตี้)", Quantity: 1, Unit: "ชิ้น"},
							{IngredientName: "ขนมปังเบอร์เกอร์", Quantity: 1, Unit: "ชิ้น"},
						},
					},
					{
						Name: "ข้าวไก่กรอบซอสเผ็ด", Price: 79, Description: "ข้าวหน้าไก่กรอบพร้อมซอสเผ็ด",
						Recipe: []starterRecipeLine{
							{IngredientName: "ข้าวสาร", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "ไก่กรอบชิ้น", Quantity: 150, Unit: "กรัม"},
							{IngredientName: "ซอสเผ็ด", Quantity: 30, Unit: "มล."},
						},
					},
					{
						Name: "ทาโก้ไก่", Price: 85, Description: "แป้งทาโก้ไส้ไก่และผักสด",
						Recipe: []starterRecipeLine{
							{IngredientName: "แป้งทาโก้", Quantity: 2, Unit: "แผ่น"},
							{IngredientName: "ไก่ฉีก", Quantity: 100, Unit: "กรัม"},
						},
					},
				},
			},
			{
				Name: "ทานเล่น",
				Items: []starterMenuItem{
					{
						Name: "เฟรนช์ฟรายส์", Price: 59, Description: "มันฝรั่งทอดกรอบ",
						Recipe: []starterRecipeLine{{IngredientName: "มันฝรั่งแช่แข็ง", Quantity: 150, Unit: "กรัม"}},
					},
					{
						Name: "นักเก็ตไก่", Price: 69, Description: "นักเก็ตไก่ 6 ชิ้น",
						Recipe: []starterRecipeLine{{IngredientName: "นักเก็ตไก่แช่แข็ง", Quantity: 120, Unit: "กรัม"}},
					},
					{
						Name: "ไก่ป๊อป", Price: 69, Description: "ไก่ป๊อปทอดกรอบ",
						Recipe: []starterRecipeLine{{IngredientName: "ไก่ป๊อปแช่แข็ง", Quantity: 120, Unit: "กรัม"}},
					},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{
						Name: "โค้ก", Price: 25, Description: "เครื่องดื่มกระป๋อง",
						Recipe: []starterRecipeLine{{IngredientName: "น้ำอัดลมโค้ก", Quantity: 1, Unit: "กระป๋อง"}},
					},
					{
						Name: "เลมอนโซดา", Price: 45, Description: "โซดามะนาวสด",
						Recipe: []starterRecipeLine{
							{IngredientName: "มะนาว", Quantity: 1, Unit: "ลูก"},
							{IngredientName: "โซดา", Quantity: 200, Unit: "มล."},
						},
					},
					{
						Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด",
						Recipe: []starterRecipeLine{{IngredientName: "น้ำเปล่าขวด", Quantity: 1, Unit: "ขวด"}},
					},
				},
			},
		},
	}
}
