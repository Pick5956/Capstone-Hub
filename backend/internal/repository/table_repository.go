package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TableRepository struct {
	db *gorm.DB
}

func NewTableRepository(db *gorm.DB) *TableRepository {
	return &TableRepository{db: db}
}

func (r *TableRepository) ListTables(restaurantID uint) ([]entity.RestaurantTable, error) {
	var tables []entity.RestaurantTable
	err := r.db.
		Preload("TableZone").
		Preload("Tags", func(db *gorm.DB) *gorm.DB { return db.Order("display_order asc, id asc") }).
		Joins("LEFT JOIN table_zones ON table_zones.id = restaurant_tables.zone_id").
		Where("restaurant_tables.restaurant_id = ?", restaurantID).
		Order("CASE WHEN restaurant_tables.zone_id IS NULL THEN 0 ELSE 1 END asc, table_zones.display_order asc, restaurant_tables.sequence_number asc, restaurant_tables.id asc").
		Find(&tables).Error
	return tables, err
}

func (r *TableRepository) Transaction(fn func(tx *TableRepository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(NewTableRepository(tx))
	})
}

func (r *TableRepository) CreateTable(table *entity.RestaurantTable) error {
	return r.db.Create(table).Error
}

func (r *TableRepository) FindTable(restaurantID, tableID uint) (*entity.RestaurantTable, error) {
	var table entity.RestaurantTable
	err := r.db.
		Preload("TableZone").
		Preload("Tags", func(db *gorm.DB) *gorm.DB { return db.Order("display_order asc, id asc") }).
		Where("restaurant_id = ? AND id = ?", restaurantID, tableID).
		First(&table).Error
	if err != nil {
		return nil, err
	}
	return &table, nil
}

func (r *TableRepository) HasOpenOrderForTable(restaurantID, tableID uint) (bool, error) {
	var orderID uint
	result := r.db.Model(&entity.Order{}).
		Select("id").
		Where("restaurant_id = ? AND table_id = ? AND status NOT IN ?", restaurantID, tableID, []string{entity.OrderStatusCompleted, entity.OrderStatusCancelled}).
		Limit(1).
		Scan(&orderID)
	return result.RowsAffected > 0, result.Error
}

func (r *TableRepository) UpdateTable(table *entity.RestaurantTable) error {
	return r.db.Omit(clause.Associations).Save(table).Error
}

func (r *TableRepository) DeleteTable(table *entity.RestaurantTable) error {
	return r.db.Delete(table).Error
}

func (r *TableRepository) ReplaceTableTags(table *entity.RestaurantTable, tags []entity.TableTag) error {
	return r.db.Model(table).Association("Tags").Replace(tags)
}

func (r *TableRepository) ListZones(restaurantID uint) ([]entity.TableZone, error) {
	var zones []entity.TableZone
	err := r.db.Where("restaurant_id = ?", restaurantID).Order("display_order asc, id asc").Find(&zones).Error
	return zones, err
}

func (r *TableRepository) FindZone(restaurantID, zoneID uint) (*entity.TableZone, error) {
	var zone entity.TableZone
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, zoneID).First(&zone).Error
	if err != nil {
		return nil, err
	}
	return &zone, nil
}

func (r *TableRepository) CreateZone(zone *entity.TableZone) error {
	return r.db.Create(zone).Error
}

func (r *TableRepository) UpdateZone(zone *entity.TableZone) error {
	return r.db.Omit(clause.Associations).Save(zone).Error
}

func (r *TableRepository) ListTablesInZone(restaurantID, zoneID uint) ([]entity.RestaurantTable, error) {
	var tables []entity.RestaurantTable
	err := r.db.
		Where("restaurant_id = ? AND zone_id = ?", restaurantID, zoneID).
		Order("sequence_number asc, id asc").
		Find(&tables).Error
	return tables, err
}

func (r *TableRepository) DeleteZone(zone *entity.TableZone) error {
	return r.db.Delete(zone).Error
}

func (r *TableRepository) CountTablesInZone(restaurantID, zoneID uint) (int64, error) {
	var count int64
	err := r.db.Model(&entity.RestaurantTable{}).Where("restaurant_id = ? AND zone_id = ?", restaurantID, zoneID).Count(&count).Error
	return count, err
}

func (r *TableRepository) PrefixExists(restaurantID uint, prefix string, exceptID uint) (bool, error) {
	var count int64
	query := r.db.Model(&entity.TableZone{}).Where("restaurant_id = ? AND prefix = ?", restaurantID, prefix)
	if exceptID != 0 {
		query = query.Where("id <> ?", exceptID)
	}
	err := query.Count(&count).Error
	return count > 0, err
}

func (r *TableRepository) ListTags(restaurantID uint) ([]entity.TableTag, error) {
	var tags []entity.TableTag
	err := r.db.Where("restaurant_id = ?", restaurantID).Order("display_order asc, id asc").Find(&tags).Error
	return tags, err
}

func (r *TableRepository) FindTag(restaurantID, tagID uint) (*entity.TableTag, error) {
	var tag entity.TableTag
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, tagID).First(&tag).Error
	if err != nil {
		return nil, err
	}
	return &tag, nil
}

func (r *TableRepository) FindTags(restaurantID uint, tagIDs []uint) ([]entity.TableTag, error) {
	if len(tagIDs) == 0 {
		return []entity.TableTag{}, nil
	}
	var tags []entity.TableTag
	err := r.db.Where("restaurant_id = ? AND id IN ?", restaurantID, tagIDs).Find(&tags).Error
	return tags, err
}

func (r *TableRepository) CreateTag(tag *entity.TableTag) error {
	return r.db.Create(tag).Error
}

func (r *TableRepository) UpdateTag(tag *entity.TableTag) error {
	return r.db.Omit(clause.Associations).Save(tag).Error
}

func (r *TableRepository) DeleteTag(tag *entity.TableTag) error {
	return r.db.Delete(tag).Error
}

func (r *TableRepository) NextSequence(restaurantID uint, zoneID *uint) (int, error) {
	var max int
	query := r.db.Model(&entity.RestaurantTable{}).Where("restaurant_id = ?", restaurantID)
	if zoneID == nil {
		query = query.Where("zone_id IS NULL")
	} else {
		query = query.Where("zone_id = ?", *zoneID)
	}
	err := query.Select("COALESCE(MAX(sequence_number), 0)").Scan(&max).Error
	return max + 1, err
}
