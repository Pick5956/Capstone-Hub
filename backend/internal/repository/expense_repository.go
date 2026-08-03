package repository

import (
	"time"

	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type ExpenseRepository struct {
	db *gorm.DB
}

func NewExpenseRepository(db *gorm.DB) *ExpenseRepository {
	return &ExpenseRepository{db: db}
}

type ExpenseFilter struct {
	From     time.Time
	Until    time.Time // exclusive
	Category string
}

func (r *ExpenseRepository) scope(restaurantID uint, filter ExpenseFilter) *gorm.DB {
	query := r.db.Model(&entity.Expense{}).Where("restaurant_id = ?", restaurantID)
	if !filter.From.IsZero() {
		query = query.Where("spent_at >= ?", filter.From)
	}
	if !filter.Until.IsZero() {
		query = query.Where("spent_at < ?", filter.Until)
	}
	if filter.Category != "" {
		query = query.Where("category = ?", filter.Category)
	}
	return query
}

func (r *ExpenseRepository) List(restaurantID uint, filter ExpenseFilter, limit int) ([]entity.Expense, error) {
	var expenses []entity.Expense
	err := r.scope(restaurantID, filter).
		Preload("CreatedBy", func(db *gorm.DB) *gorm.DB { return db.Select("id", "first_name", "last_name") }).
		Order("spent_at desc, id desc").
		Limit(limit).
		Find(&expenses).Error
	return expenses, err
}

type ExpenseCategoryTotal struct {
	Category string  `json:"category"`
	Amount   float64 `json:"amount"`
	Entries  int64   `json:"entries"`
}

type ExpenseDayTotal struct {
	Date    string  `json:"date"`
	Amount  float64 `json:"amount"`
	Entries int64   `json:"entries"`
}

func (r *ExpenseRepository) TotalsByCategory(restaurantID uint, filter ExpenseFilter) ([]ExpenseCategoryTotal, error) {
	var totals []ExpenseCategoryTotal
	err := r.scope(restaurantID, filter).
		Select("category, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS entries").
		Group("category").
		Order("amount desc").
		Scan(&totals).Error
	return totals, err
}

func (r *ExpenseRepository) TotalsByDay(restaurantID uint, filter ExpenseFilter) ([]ExpenseDayTotal, error) {
	var totals []ExpenseDayTotal
	bucket := bucketExpr("spent_at", bucketByDate)
	err := r.scope(restaurantID, filter).
		Select(bucket + " AS date, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS entries").
		Group(bucket).
		Order(bucket + " asc").
		Scan(&totals).Error
	return totals, err
}

func (r *ExpenseRepository) Create(expense *entity.Expense) error {
	return r.db.Create(expense).Error
}

func (r *ExpenseRepository) FindByID(restaurantID, expenseID uint) (*entity.Expense, error) {
	var expense entity.Expense
	err := r.db.Where("restaurant_id = ? AND id = ?", restaurantID, expenseID).First(&expense).Error
	if err != nil {
		return nil, err
	}
	return &expense, nil
}

func (r *ExpenseRepository) Save(expense *entity.Expense) error {
	return r.db.Save(expense).Error
}

// Delete is a soft delete (gorm.Model) — a mistaken entry disappears from the
// ledger without the row leaving the audit trail.
func (r *ExpenseRepository) Delete(restaurantID, expenseID uint) error {
	return r.db.Where("restaurant_id = ? AND id = ?", restaurantID, expenseID).Delete(&entity.Expense{}).Error
}
