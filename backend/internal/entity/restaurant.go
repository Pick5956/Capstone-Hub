package entity

import "gorm.io/gorm"

type Restaurant struct {
	gorm.Model
	Name                 string  `json:"name" gorm:"not null" binding:"required"`
	BranchName           string  `json:"branch_name" gorm:"size:120;default:'สาขาหลัก'"`
	RestaurantType       string  `json:"restaurant_type" gorm:"size:80;default:'ร้านอาหาร'"`
	Address              string  `json:"address"`
	Phone                string  `json:"phone"`
	Logo                 string  `json:"logo"`
	OpenTime             string  `json:"open_time" gorm:"size:5;default:'17:00'"`
	CloseTime            string  `json:"close_time" gorm:"size:5;default:'00:00'"`
	TableCount           int     `json:"table_count" gorm:"not null;default:12;check:restaurant_table_count_nonnegative,table_count >= 0"`
	ServiceChargeEnabled bool    `json:"service_charge_enabled" gorm:"not null;default:false"`
	ServiceChargeRate    float64 `json:"service_charge_rate" gorm:"type:numeric(7,4);not null;default:10;check:restaurant_service_charge_rate_range,service_charge_rate >= 0 AND service_charge_rate <= 100"`
	VATEnabled           bool    `json:"vat_enabled" gorm:"not null;default:false"`
	VATRate              float64 `json:"vat_rate" gorm:"type:numeric(7,4);not null;default:7;check:restaurant_vat_rate_range,vat_rate >= 0 AND vat_rate <= 100"`
	PromptPayName        string  `json:"promptpay_name"`
	PromptPayQRImage     string  `json:"promptpay_qr_image"`
	CoverImage           string  `json:"cover_image"`

	// Geofence for QR table ordering. A customer must be physically near the
	// restaurant to send an order straight to the kitchen. OrderRadiusMeters = 0
	// (or missing coordinates) disables the check entirely.
	Latitude          *float64 `json:"latitude" gorm:"type:double precision"`
	Longitude         *float64 `json:"longitude" gorm:"type:double precision"`
	OrderRadiusMeters int      `json:"order_radius_meters" gorm:"not null;default:0"`

	OwnerID uint  `json:"owner_id" gorm:"not null"`
	Owner   *User `json:"owner,omitempty" gorm:"foreignKey:OwnerID"`
}
