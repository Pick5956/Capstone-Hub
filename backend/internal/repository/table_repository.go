package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type TableRepository struct {
	db *gorm.DB
}

func NewTableRepository(db *gorm.DB) *TableRepository {
	return &TableRepository{db: db}
}

func (r *TableRepository) ListTables(restaurantID uint) ([]entity.RestaurantTable, error) {
	var tables []entity.RestaurantTable
	err := r.db.Where("restaurant_id = ?", restaurantID).Order("zone asc, table_number asc, id asc").Find(&tables).Error
	return tables, err
}

func (r *TableRepository) CreateTable(table *entity.RestaurantTable) error {
	return r.db.Create(table).Error
}

func (r *TableRepository) FindTable(restaurantID, tableID uint) (*entity.RestaurantTable, error) {
	var table entity.RestaurantTable
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, tableID).First(&table).Error
	if err != nil {
		return nil, err
	}
	return &table, nil
}

func (r *TableRepository) UpdateTable(table *entity.RestaurantTable) error {
	return r.db.Save(table).Error
}

func (r *TableRepository) DeleteTable(table *entity.RestaurantTable) error {
	return r.db.Delete(table).Error
}
