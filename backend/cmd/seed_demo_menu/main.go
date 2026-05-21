package main

import (
	"flag"
	"fmt"
	"log"
	"net/url"
	"strings"

	"Project-M/config"
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type demoCategory struct {
	Name  string
	Items []demoMenuItem
}

type demoMenuItem struct {
	Name        string
	Price       float64
	Description string
	ImageURL    string
}

func commonsFile(fileName string) string {
	return "https://commons.wikimedia.org/wiki/Special:FilePath/" + url.PathEscape(fileName) + "?width=800"
}

var demoMenu = []demoCategory{
	{
		Name: "อาหารจานเดียว",
		Items: []demoMenuItem{
			{Name: "ผัดไทยกุ้งสด", Price: 89, Description: "เส้นจันท์ผัดซอสมะขาม กุ้ง ไข่ เต้าหู้ และถั่วลิสง", ImageURL: commonsFile("Phat Thai kung Chang Khien street stall.jpg")},
			{Name: "ผัดซีอิ๊วหมู", Price: 75, Description: "เส้นใหญ่ผัดซีอิ๊วกับหมู ไข่ และคะน้ากรอบ", ImageURL: commonsFile("Pad See Ew - Bangkok.jpg")},
			{Name: "ผัดขี้เมาทะเล", Price: 95, Description: "เส้นผัดพริกสด ใบกะเพรา และทะเลรวมรสจัด", ImageURL: commonsFile("Guaytiew Pad Kee Mao (Drunken Noodles) with Veg & Tofu - Rosa's Thai 2025-07-22.jpg")},
			{Name: "ข้าวผัดปู", Price: 95, Description: "ข้าวหอมผัดไข่ เนื้อปู ต้นหอม และมะนาว", ImageURL: commonsFile("Khao phat nam phrik narok.jpg")},
			{Name: "ข้าวกะเพราไก่ไข่ดาว", Price: 79, Description: "ไก่สับผัดกะเพราโปะไข่ดาว เสิร์ฟพร้อมข้าว", ImageURL: commonsFile("Kao Rad Pad Kra-pao - Unithai 2023-07-08.jpg")},
			{Name: "ข้าวไก่ผัดพริกเผา", Price: 79, Description: "ไก่ผัดน้ำพริกเผา หอมใหญ่ พริกสด และใบโหระพา", ImageURL: commonsFile("Thai Green Curry,JasminRice,Chilli Basil Chicken , HomeMade.jpg")},
			{Name: "ข้าวหมูกระเทียม", Price: 75, Description: "หมูหมักผัดกระเทียมพริกไทย เสิร์ฟพร้อมข้าว", ImageURL: commonsFile("Moo sadoong - ‘startled pig’ หมูสะดุ้ง- grilled pork, basil, lemongrass, garlic, fish sauce, lime, chile, onions, cilantro.jpg")},
			{Name: "ข้าวไข่เจียวหมูสับ", Price: 59, Description: "ไข่เจียวฟูใส่หมูสับ เสิร์ฟพร้อมซอสพริก", ImageURL: commonsFile("Thai-Pad-Thai 2023-06-04.jpg")},
			{Name: "สุกี้แห้งไก่", Price: 79, Description: "วุ้นเส้น ผัก ไก่ และน้ำจิ้มสุกี้ผัดแห้ง", ImageURL: commonsFile("Sukiyaki.JPG")},
			{Name: "ก๋วยเตี๋ยวเรือหมู", Price: 69, Description: "น้ำซุปเข้มข้น หมูนุ่ม ลูกชิ้น และผักบุ้ง", ImageURL: commonsFile("Boat noodles.jpg")},
		},
	},
	{
		Name: "แกงและซุป",
		Items: []demoMenuItem{
			{Name: "ต้มยำกุ้งน้ำข้น", Price: 139, Description: "กุ้งสด เห็ด และสมุนไพรต้มยำรสเปรี้ยวเผ็ด", ImageURL: commonsFile("Tom Yum Goong Noodle Soup - Nok Nok Kitchen at The Cow 2024-03-28.jpg")},
			{Name: "ต้มข่าไก่", Price: 119, Description: "ไก่ต้มกะทิ ข่า ตะไคร้ ใบมะกรูด และเห็ด", ImageURL: commonsFile("Making Thai dinner - Tom Yum with salmon (20393492736).jpg")},
			{Name: "แกงเขียวหวานไก่", Price: 129, Description: "แกงกะทิพริกแกงเขียวหวาน ไก่ มะเขือ และโหระพา", ImageURL: commonsFile("Thai Green Curry,JasminRice,Chilli Basil Chicken , HomeMade.jpg")},
			{Name: "แกงเผ็ดเป็ดย่าง", Price: 159, Description: "เป็ดย่างในแกงเผ็ดกะทิ สับปะรด และมะเขือเทศ", ImageURL: commonsFile("Making Thai dinner - duck green curry (20233097519).jpg")},
			{Name: "พะแนงหมู", Price: 129, Description: "หมูเคี่ยวพริกแกงพะแนง กะทิ และใบมะกรูด", ImageURL: commonsFile("Thai Green Curry,JasminRice,Chilli Basil Chicken , HomeMade.jpg")},
			{Name: "มัสมั่นไก่", Price: 139, Description: "ไก่ตุ๋นมันฝรั่ง หอมใหญ่ ถั่วลิสง และเครื่องเทศ", ImageURL: commonsFile("Making Thai dinner - duck green curry (20233097519).jpg")},
			{Name: "แกงเหลืองปลากะพง", Price: 149, Description: "แกงส้มใต้รสจัด ปลากะพง และยอดมะพร้าว", ImageURL: commonsFile("Tom yum goong on a plate at Thai Orchid Villa Kamppi.jpg")},
			{Name: "แกงจืดเต้าหู้หมูสับ", Price: 89, Description: "ซุปใสเต้าหู้ไข่ หมูสับ สาหร่าย และผักกาดขาว", ImageURL: commonsFile("Tom Yum (Hot & Sour Soup) with Tofu - Thai Pad Thai 2025-12-03.jpg")},
			{Name: "ต้มแซ่บกระดูกอ่อน", Price: 129, Description: "กระดูกอ่อนหมูต้มสมุนไพร รสเปรี้ยวเผ็ด", ImageURL: commonsFile("Tom yum goong on a plate at Thai Orchid Villa Kamppi.jpg")},
			{Name: "ข้าวต้มปลา", Price: 85, Description: "ข้าวต้มปลานุ่ม น้ำซุปใส ขิง และขึ้นฉ่าย", ImageURL: commonsFile("Tom Yum Goong Noodle Soup - Nok Nok Kitchen at The Cow 2024-03-28.jpg")},
		},
	},
	{
		Name: "ยำและส้มตำ",
		Items: []demoMenuItem{
			{Name: "ส้มตำไทย", Price: 69, Description: "มะละกอ ถั่วฝักยาว มะเขือเทศ ถั่วลิสง รสเปรี้ยวหวาน", ImageURL: commonsFile("Som tam thai.JPG")},
			{Name: "ส้มตำปูปลาร้า", Price: 75, Description: "ส้มตำอีสานรสนัว ใส่ปูดองและปลาร้า", ImageURL: commonsFile("Som tam pu pla ra.JPG")},
			{Name: "ยำวุ้นเส้นทะเล", Price: 119, Description: "วุ้นเส้น กุ้ง หมึก หมูสับ และน้ำยำมะนาว", ImageURL: commonsFile("Yam woon sen.jpg")},
			{Name: "ลาบหมู", Price: 95, Description: "หมูสับคลุกข้าวคั่ว พริกป่น มะนาว และสมุนไพร", ImageURL: commonsFile("Larb moo.jpg")},
			{Name: "น้ำตกคอหมูย่าง", Price: 119, Description: "คอหมูย่างคลุกข้าวคั่ว พริกป่น และผักสด", ImageURL: commonsFile("Nam tok mu.jpg")},
			{Name: "ยำเนื้อย่าง", Price: 139, Description: "เนื้อย่างหั่นบาง คลุกน้ำยำและสมุนไพร", ImageURL: commonsFile("Thai beef salad.jpg")},
			{Name: "ยำถั่วพู", Price: 105, Description: "ถั่วพู กุ้ง ไข่ต้ม และน้ำยำกะทิพริกเผา", ImageURL: commonsFile("Thai wing bean salad.jpg")},
			{Name: "ยำมะม่วงปลากรอบ", Price: 95, Description: "มะม่วงเปรี้ยว ปลากรอบ หอมแดง และเม็ดมะม่วง", ImageURL: commonsFile("Thai mango salad.jpg")},
			{Name: "ยำคอหมูย่าง", Price: 119, Description: "คอหมูย่างคลุกน้ำยำมะนาว พริก และหอมแดง", ImageURL: commonsFile("Moo sadoong - ‘startled pig’ หมูสะดุ้ง- grilled pork, basil, lemongrass, garlic, fish sauce, lime, chile, onions, cilantro.jpg")},
			{Name: "ยำทะเลรวม", Price: 149, Description: "กุ้ง หมึก หอย คลุกน้ำยำรสจัด", ImageURL: commonsFile("Tom yum goong on a plate at Thai Orchid Villa Kamppi.jpg")},
		},
	},
	{
		Name: "ทานเล่น",
		Items: []demoMenuItem{
			{Name: "ไก่สะเต๊ะ", Price: 89, Description: "ไก่หมักเครื่องเทศย่าง เสิร์ฟน้ำจิ้มถั่วและอาจาด", ImageURL: commonsFile("Satay chicken.JPG")},
			{Name: "ทอดมันปลา", Price: 89, Description: "ทอดมันปลากราย พริกแกง และถั่วฝักยาว", ImageURL: commonsFile("Thai fish cakes.jpg")},
			{Name: "ปอเปี๊ยะทอด", Price: 79, Description: "แป้งปอเปี๊ยะไส้ผักวุ้นเส้นทอดกรอบ", ImageURL: commonsFile("Thai spring rolls.jpg")},
			{Name: "ปีกไก่ทอดน้ำปลา", Price: 99, Description: "ปีกไก่ทอดกรอบเคลือบน้ำปลา", ImageURL: commonsFile("Thai fried chicken.jpg")},
			{Name: "หมูปิ้งนมสด", Price: 75, Description: "หมูหมักนมสดเสียบไม้ย่าง เสิร์ฟข้าวเหนียว", ImageURL: commonsFile("Moo ping.jpg")},
			{Name: "คอหมูย่าง", Price: 119, Description: "คอหมูหมักย่างหอม เสิร์ฟน้ำจิ้มแจ่ว", ImageURL: commonsFile("Moo sadoong - ‘startled pig’ หมูสะดุ้ง- grilled pork, basil, lemongrass, garlic, fish sauce, lime, chile, onions, cilantro.jpg")},
			{Name: "หมูกรอบจิ้มแจ่ว", Price: 129, Description: "หมูกรอบหั่นชิ้น เสิร์ฟน้ำจิ้มแจ่วและผักสด", ImageURL: commonsFile("Crispy pork belly.jpg")},
			{Name: "เต้าหู้ทอด", Price: 69, Description: "เต้าหู้ทอดกรอบ เสิร์ฟน้ำจิ้มถั่ว", ImageURL: commonsFile("Fried tofu.jpg")},
			{Name: "กุ้งชุบแป้งทอด", Price: 119, Description: "กุ้งทอดกรอบ เสิร์ฟซอสบ๊วย", ImageURL: commonsFile("Deep fried shrimp.jpg")},
			{Name: "ไข่ลูกเขย", Price: 85, Description: "ไข่ต้มทอด ราดซอสมะขามและหอมเจียว", ImageURL: commonsFile("Khai luk khoei.jpg")},
		},
	},
	{
		Name: "ของหวานและเครื่องดื่ม",
		Items: []demoMenuItem{
			{Name: "ข้าวเหนียวมะม่วง", Price: 99, Description: "ข้าวเหนียวมูนกะทิ เสิร์ฟมะม่วงสุก", ImageURL: commonsFile("Mango sticky rice with mango pudding and mango ice cream.jpg")},
			{Name: "ชาไทยเย็น", Price: 49, Description: "ชาไทยเข้มข้นใส่นม เสิร์ฟเย็น", ImageURL: commonsFile("Thai iced tea.jpg")},
			{Name: "ไอศกรีมกะทิ", Price: 59, Description: "ไอศกรีมกะทิหอมมัน เสิร์ฟเครื่องไทย", ImageURL: commonsFile("Coconut ice cream.jpg")},
			{Name: "ทับทิมกรอบ", Price: 59, Description: "แห้วเคลือบแป้งสีแดง น้ำกะทิ และน้ำแข็ง", ImageURL: commonsFile("Tub tim krob.jpg")},
			{Name: "โรตีกล้วย", Price: 69, Description: "โรตีกรอบใส่กล้วย ราดนมข้น", ImageURL: commonsFile("Thai roti.jpg")},
			{Name: "กล้วยทอด", Price: 55, Description: "กล้วยชุบแป้งทอดกรอบงา", ImageURL: commonsFile("Thai banana fritters.jpg")},
			{Name: "สังขยาใบเตย", Price: 55, Description: "สังขยาใบเตยหอม เสิร์ฟกับขนมปังนึ่ง", ImageURL: commonsFile("Pandan custard.jpg")},
			{Name: "วุ้นกะทิ", Price: 49, Description: "วุ้นกะทิชั้นใบเตย หวานมัน", ImageURL: commonsFile("Thai coconut jelly.jpg")},
			{Name: "ข้าวเหนียวดำเปียก", Price: 59, Description: "ข้าวเหนียวดำต้มหวาน ราดกะทิ", ImageURL: commonsFile("Black sticky rice pudding.jpg")},
			{Name: "เฉาก๊วยนมสด", Price: 49, Description: "เฉาก๊วยนุ่มกับนมสดและน้ำแข็ง", ImageURL: commonsFile("Grass jelly.jpg")},
		},
	},
}

func main() {
	restaurantID := flag.Uint("restaurant-id", 0, "restaurant ID to seed demo menu into")
	flag.Parse()

	if *restaurantID == 0 {
		log.Fatal("missing -restaurant-id, example: go run ./cmd/seed_demo_menu -restaurant-id 1")
	}

	config.ConnectionDB()
	db := config.SetupDatabase()

	var restaurant entity.Restaurant
	if err := db.First(&restaurant, *restaurantID).Error; err != nil {
		log.Fatalf("restaurant %d not found: %v", *restaurantID, err)
	}

	if err := seedDemoMenu(db, uint(*restaurantID)); err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Seeded demo menu for restaurant %d: %d categories, %d menu items\n", *restaurantID, len(demoMenu), countDemoItems())
}

func seedDemoMenu(db *gorm.DB, restaurantID uint) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for categoryIndex, categorySeed := range demoMenu {
			category, err := findOrCreateCategory(tx, restaurantID, categorySeed.Name, categoryIndex+1)
			if err != nil {
				return err
			}

			for itemIndex, itemSeed := range categorySeed.Items {
				if err := upsertMenuItem(tx, restaurantID, category.ID, itemSeed, itemIndex+1); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func findOrCreateCategory(tx *gorm.DB, restaurantID uint, name string, displayOrder int) (*entity.Category, error) {
	var category entity.Category
	result := tx.Where("restaurant_id = ? AND name = ?", restaurantID, name).First(&category)
	if result.Error == nil {
		category.DisplayOrder = displayOrder
		category.IsActive = true
		return &category, tx.Save(&category).Error
	}
	if result.Error != gorm.ErrRecordNotFound {
		return nil, result.Error
	}

	category = entity.Category{
		RestaurantID: restaurantID,
		Name:         name,
		DisplayOrder: displayOrder,
		IsActive:     true,
	}
	if err := tx.Create(&category).Error; err != nil {
		return nil, err
	}
	return &category, nil
}

func upsertMenuItem(tx *gorm.DB, restaurantID, categoryID uint, itemSeed demoMenuItem, displayOrder int) error {
	var item entity.MenuItem
	result := tx.Where("restaurant_id = ? AND name = ?", restaurantID, itemSeed.Name).First(&item)
	if result.Error != nil && result.Error != gorm.ErrRecordNotFound {
		return result.Error
	}

	item.RestaurantID = restaurantID
	item.CategoryID = categoryID
	item.Name = strings.TrimSpace(itemSeed.Name)
	item.Price = itemSeed.Price
	item.ImageURL = strings.TrimSpace(itemSeed.ImageURL)
	item.Description = strings.TrimSpace(itemSeed.Description)
	item.IsAvailable = true
	item.DisplayOrder = displayOrder

	if result.Error == gorm.ErrRecordNotFound {
		if err := tx.Create(&item).Error; err != nil {
			return err
		}
	} else if err := tx.Save(&item).Error; err != nil {
		return err
	}

	return ensureMenuCategoryLink(tx, restaurantID, item.ID, categoryID)
}

func ensureMenuCategoryLink(tx *gorm.DB, restaurantID, menuItemID, categoryID uint) error {
	var link entity.MenuItemCategory
	result := tx.Where("restaurant_id = ? AND menu_item_id = ? AND category_id = ?", restaurantID, menuItemID, categoryID).First(&link)
	if result.Error == nil {
		return nil
	}
	if result.Error != gorm.ErrRecordNotFound {
		return result.Error
	}
	return tx.Create(&entity.MenuItemCategory{
		RestaurantID: restaurantID,
		MenuItemID:   menuItemID,
		CategoryID:   categoryID,
	}).Error
}

func countDemoItems() int {
	total := 0
	for _, category := range demoMenu {
		total += len(category.Items)
	}
	return total
}
