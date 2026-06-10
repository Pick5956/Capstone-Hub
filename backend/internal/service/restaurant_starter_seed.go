package service

import (
	"fmt"
	"strings"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type starterProfile struct {
	TableZones []starterTableZone
	Categories []starterMenuCategory
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

func seedRestaurantStarterSetup(repo *repository.RestaurantSetupRepository, restaurantID uint, restaurantType string, tableCount int) error {
	profile := starterProfileFor(restaurantType)
	if err := seedStarterMenu(repo, restaurantID, profile.Categories); err != nil {
		return err
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

func seedStarterMenu(repo *repository.RestaurantSetupRepository, restaurantID uint, categories []starterMenuCategory) error {
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
		}
	}
	return nil
}

func seedStarterMenuOptions(repo *repository.RestaurantSetupRepository, restaurantID, menuItemID uint, groups []starterOptionGroup) error {
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

func seedStarterTables(repo *repository.RestaurantSetupRepository, restaurantID uint, tableCount int, zones []starterTableZone) error {
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
			table := &entity.RestaurantTable{
				RestaurantID:   restaurantID,
				ZoneID:         &zone.ID,
				TableNumber:    label,
				DisplayLabel:   label,
				SequenceNumber: sequence,
				Capacity:       zoneSeed.Capacity,
				Zone:           zoneSeed.Name,
				Status:         entity.TableStatusFree,
				CustomerToken:  GenerateCustomerTableToken(),
			}
			if err := repo.CreateTable(table); err != nil {
				return err
			}
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
		Categories: []starterMenuCategory{
			{
				Name: "อาหารจานเดียว",
				Items: []starterMenuItem{
					{Name: "ข้าวกะเพราไก่ไข่ดาว", Price: 79, Description: "ไก่สับผัดกะเพราราดข้าว พร้อมไข่ดาว"},
					{Name: "ผัดไทยกุ้งสด", Price: 89, Description: "เส้นจันท์ผัดซอสมะขาม กุ้งสด เต้าหู้ และถั่วลิสง"},
					{Name: "ข้าวผัดปู", Price: 95, Description: "ข้าวหอมผัดไข่กับเนื้อปู ต้นหอม และมะนาว"},
					{Name: "ผัดซีอิ๊วหมู", Price: 75, Description: "เส้นใหญ่ผัดซีอิ๊วกับหมู ไข่ และคะน้า"},
				},
			},
			{
				Name: "กับข้าว",
				Items: []starterMenuItem{
					{Name: "ต้มยำกุ้งน้ำข้น", Price: 139, Description: "กุ้งสด เห็ด และสมุนไพรต้มยำรสจัด"},
					{Name: "แกงเขียวหวานไก่", Price: 129, Description: "แกงกะทิพริกแกงเขียวหวาน ไก่ และมะเขือ"},
					{Name: "ลาบหมู", Price: 95, Description: "หมูสับคลุกข้าวคั่ว พริกป่น มะนาว และสมุนไพร"},
					{Name: "ปีกไก่ทอดน้ำปลา", Price: 99, Description: "ปีกไก่ทอดกรอบเคลือบน้ำปลา"},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{Name: "ชาไทยเย็น", Price: 49, Description: "ชาไทยเข้มข้นใส่นม เสิร์ฟเย็น"},
					{Name: "น้ำมะนาวโซดา", Price: 45, Description: "มะนาวสดผสมโซดา"},
					{Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด"},
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
		Categories: []starterMenuCategory{
			{
				Name: "กาแฟ",
				Items: []starterMenuItem{
					{Name: "อเมริกาโน่เย็น", Price: 65, Description: "กาแฟดำเย็นสกัดสด", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup}},
					{Name: "ลาเต้เย็น", Price: 75, Description: "เอสเปรสโซกับนมสด", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup}},
					{Name: "คาปูชิโน่เย็น", Price: 75, Description: "กาแฟนมพร้อมฟองนมนุ่ม", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup}},
				},
			},
			{
				Name: "ชาและนม",
				Items: []starterMenuItem{
					{Name: "มัทฉะลาเต้", Price: 85, Description: "มัทฉะญี่ปุ่นกับนมสด", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup}},
					{Name: "โกโก้เย็น", Price: 70, Description: "โกโก้เข้มข้นใส่นม", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup}},
					{Name: "ชาพีช", Price: 65, Description: "ชาผลไม้กลิ่นพีช เสิร์ฟเย็น", OptionGroups: []starterOptionGroup{sizeGroup, sweetnessGroup}},
				},
			},
			{
				Name: "เบเกอรี่",
				Items: []starterMenuItem{
					{Name: "ครัวซองต์เนยสด", Price: 85, Description: "ครัวซองต์อบใหม่ หอมเนย"},
					{Name: "เค้กช็อกโกแลต", Price: 95, Description: "เค้กช็อกโกแลตเข้มข้น"},
					{Name: "ชีสเค้กหน้าไหม้", Price: 105, Description: "ชีสเค้กเนื้อเนียนหน้าคาราเมล"},
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
		Categories: []starterMenuCategory{
			{
				Name: "ชุดเริ่มต้น",
				Items: []starterMenuItem{
					{Name: "ชุดหมูรวม", Price: 299, Description: "หมูสไลซ์ ลูกชิ้น ผัก และน้ำจิ้ม", OptionGroups: []starterOptionGroup{brothGroup}},
					{Name: "ชุดเนื้อรวม", Price: 399, Description: "เนื้อสไลซ์รวม ผัก และน้ำจิ้ม", OptionGroups: []starterOptionGroup{brothGroup}},
					{Name: "ชุดทะเลรวม", Price: 459, Description: "กุ้ง หมึก ปลา และผักรวม", OptionGroups: []starterOptionGroup{brothGroup}},
				},
			},
			{
				Name: "เพิ่มพิเศษ",
				Items: []starterMenuItem{
					{Name: "หมูสามชั้นสไลซ์", Price: 89, Description: "หมูสามชั้นสไลซ์สำหรับชาบูหรือปิ้งย่าง"},
					{Name: "เนื้อริบอายสไลซ์", Price: 129, Description: "เนื้อริบอายสไลซ์นุ่ม"},
					{Name: "ผักรวม", Price: 59, Description: "ชุดผักสดรวม"},
					{Name: "น้ำจิ้มสุกี้", Price: 25, Description: "น้ำจิ้มสุกี้สูตรร้าน"},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{Name: "ชาอู่หลงเย็น", Price: 39, Description: "ชาอู่หลงเย็น"},
					{Name: "น้ำเก๊กฮวย", Price: 35, Description: "เก๊กฮวยหวานหอม"},
					{Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด"},
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
		Categories: []starterMenuCategory{
			{
				Name: "เมนูขายดี",
				Items: []starterMenuItem{
					{Name: "ข้าวกะเพราไก่ไข่ดาว", Price: 79, Description: "เมนูขายดีสำหรับเดลิเวอรี"},
					{Name: "ข้าวหมูกระเทียม", Price: 75, Description: "หมูผัดกระเทียมพริกไทยราดข้าว"},
					{Name: "ข้าวผัดกุ้ง", Price: 89, Description: "ข้าวผัดกุ้งพร้อมผัก"},
					{Name: "ผัดไทยกุ้งสด", Price: 89, Description: "ผัดไทยพร้อมกุ้งสด แยกเครื่องเคียง"},
				},
			},
			{
				Name: "เซ็ตคุ้มค่า",
				Items: []starterMenuItem{
					{Name: "เซ็ตข้าวกะเพรา + ชาไทย", Price: 119, Description: "อาหารจานเดียวพร้อมเครื่องดื่ม"},
					{Name: "เซ็ตข้าวผัด + น้ำมะนาว", Price: 125, Description: "ข้าวผัดพร้อมเครื่องดื่มสดชื่น"},
					{Name: "เซ็ตครอบครัว 3 กล่อง", Price: 239, Description: "เลือกเมนูขายดี 3 กล่องสำหรับครอบครัว"},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{Name: "ชาไทยเย็น", Price: 49, Description: "บรรจุขวดพร้อมส่ง"},
					{Name: "น้ำมะนาว", Price: 45, Description: "น้ำมะนาวสด"},
					{Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด"},
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
		Categories: []starterMenuCategory{
			{
				Name: "เมนูหลัก",
				Items: []starterMenuItem{
					{Name: "เบอร์เกอร์หมู", Price: 89, Description: "เบอร์เกอร์หมูซอสสูตรร้าน"},
					{Name: "ข้าวไก่กรอบซอสเผ็ด", Price: 79, Description: "ข้าวหน้าไก่กรอบพร้อมซอสเผ็ด"},
					{Name: "ทาโก้ไก่", Price: 85, Description: "แป้งทาโก้ไส้ไก่และผักสด"},
				},
			},
			{
				Name: "ทานเล่น",
				Items: []starterMenuItem{
					{Name: "เฟรนช์ฟรายส์", Price: 59, Description: "มันฝรั่งทอดกรอบ"},
					{Name: "นักเก็ตไก่", Price: 69, Description: "นักเก็ตไก่ 6 ชิ้น"},
					{Name: "ไก่ป๊อป", Price: 69, Description: "ไก่ป๊อปทอดกรอบ"},
				},
			},
			{
				Name: "เครื่องดื่ม",
				Items: []starterMenuItem{
					{Name: "โค้ก", Price: 25, Description: "เครื่องดื่มกระป๋อง"},
					{Name: "เลมอนโซดา", Price: 45, Description: "โซดามะนาวสด"},
					{Name: "น้ำเปล่า", Price: 15, Description: "น้ำดื่มขวด"},
				},
			},
		},
	}
}
