package seed

import (
	"Project-M/internal/entity"
	"fmt"

	"gorm.io/gorm"
)

// SeedRoles ใช้สร้างข้อมูล Role เริ่มต้นเมื่อตารางยังว่างอยู่
func SeedRoles(db *gorm.DB) {
	var count int64
	db.Model(&entity.Role{}).Count(&count)
	if count == 0 {
		db.Create(&entity.Role{Role: "Admin"})
		db.Create(&entity.Role{Role: "Teacher"})
		db.Create(&entity.Role{Role: "Student"})
		fmt.Println("Seeded default roles: Admin, Teacher, Student")
	}
}
