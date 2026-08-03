package service

import (
	"errors"
	"math"
	"strings"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type ExpenseService struct {
	repo *repository.ExpenseRepository
}

func ProvideExpenseService(repo *repository.ExpenseRepository) *ExpenseService {
	return &ExpenseService{repo: repo}
}

const (
	maxExpenseAmount = 100_000_000.0
	maxExpenseNote   = 500
	expenseListLimit = 500
)

type ExpenseRequest struct {
	Category string  `json:"category"`
	Amount   float64 `json:"amount"`
	SpentAt  string  `json:"spent_at"` // YYYY-MM-DD, Bangkok
	Note     string  `json:"note"`
}

type ExpenseListResponse struct {
	Expenses   []entity.Expense                  `json:"expenses"`
	Categories []repository.ExpenseCategoryTotal `json:"categories"`
	Daily      []repository.ExpenseDayTotal      `json:"daily"`
	Total      float64                           `json:"total"`
	Entries    int64                             `json:"entries"`
	HasMore    bool                              `json:"has_more"`
}

// parseExpenseDate keeps the ledger on Bangkok calendar days so an entry made
// late at night lands on the day the owner thinks they spent it.
func parseExpenseDate(value string) (time.Time, error) {
	loc := repository.BangkokNow().Location()
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		now := repository.BangkokNow()
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc), nil
	}
	return time.ParseInLocation("2006-01-02", trimmed, loc)
}

func (s *ExpenseService) validate(req *ExpenseRequest) (string, float64, time.Time, string, error) {
	category := strings.TrimSpace(req.Category)
	if !entity.IsValidExpenseCategory(category) {
		return "", 0, time.Time{}, "", errors.New("invalid expense category")
	}
	// Reject NaN/Inf before rounding: they pass a plain `<= 0` check and would
	// poison every SUM over the ledger.
	if math.IsNaN(req.Amount) || math.IsInf(req.Amount, 0) {
		return "", 0, time.Time{}, "", errors.New("amount is not a valid number")
	}
	amount := roundMoney(req.Amount)
	if amount <= 0 {
		return "", 0, time.Time{}, "", errors.New("amount must be greater than zero")
	}
	if amount > maxExpenseAmount {
		return "", 0, time.Time{}, "", errors.New("amount is too large")
	}
	spentAt, err := parseExpenseDate(req.SpentAt)
	if err != nil {
		return "", 0, time.Time{}, "", errors.New("spent_at must be YYYY-MM-DD")
	}
	note := strings.TrimSpace(req.Note)
	if len([]rune(note)) > maxExpenseNote {
		return "", 0, time.Time{}, "", errors.New("note is too long")
	}
	return category, amount, spentAt, note, nil
}

func (s *ExpenseService) List(restaurantID uint, from, until, category string) (*ExpenseListResponse, error) {
	filter := repository.ExpenseFilter{Category: strings.TrimSpace(category)}
	if filter.Category != "" && !entity.IsValidExpenseCategory(filter.Category) {
		return nil, errors.New("invalid expense category")
	}
	if strings.TrimSpace(from) != "" {
		parsed, err := parseExpenseDate(from)
		if err != nil {
			return nil, errors.New("from must be YYYY-MM-DD")
		}
		filter.From = parsed
	}
	if strings.TrimSpace(until) != "" {
		parsed, err := parseExpenseDate(until)
		if err != nil {
			return nil, errors.New("until must be YYYY-MM-DD")
		}
		// `until` is inclusive to the caller, exclusive to the query.
		filter.Until = parsed.AddDate(0, 0, 1)
	}

	expenses, err := s.repo.List(restaurantID, filter, expenseListLimit)
	if err != nil {
		return nil, err
	}
	totals, err := s.repo.TotalsByCategory(restaurantID, filter)
	if err != nil {
		return nil, err
	}
	daily, err := s.repo.TotalsByDay(restaurantID, filter)
	if err != nil {
		return nil, err
	}
	if expenses == nil {
		expenses = []entity.Expense{}
	}
	if totals == nil {
		totals = []repository.ExpenseCategoryTotal{}
	}
	if daily == nil {
		daily = []repository.ExpenseDayTotal{}
	}

	return buildExpenseListResponse(expenses, totals, daily), nil
}

func buildExpenseListResponse(
	expenses []entity.Expense,
	totals []repository.ExpenseCategoryTotal,
	daily []repository.ExpenseDayTotal,
) *ExpenseListResponse {
	response := &ExpenseListResponse{Expenses: expenses, Categories: totals, Daily: daily}
	for i := range totals {
		totals[i].Amount = roundMoney(totals[i].Amount)
		response.Total += totals[i].Amount
		response.Entries += totals[i].Entries
	}
	for i := range daily {
		daily[i].Amount = roundMoney(daily[i].Amount)
	}
	response.Total = roundMoney(response.Total)
	response.HasMore = response.Entries > int64(len(expenses))
	return response
}

func (s *ExpenseService) Create(restaurantID, userID uint, req *ExpenseRequest) (*entity.Expense, error) {
	category, amount, spentAt, note, err := s.validate(req)
	if err != nil {
		return nil, err
	}
	expense := &entity.Expense{
		RestaurantID: restaurantID,
		Category:     category,
		Amount:       amount,
		SpentAt:      spentAt,
		Note:         note,
		CreatedByID:  userID,
	}
	if err := s.repo.Create(expense); err != nil {
		return nil, err
	}
	return expense, nil
}

func (s *ExpenseService) Update(restaurantID, expenseID uint, req *ExpenseRequest) (*entity.Expense, error) {
	category, amount, spentAt, note, err := s.validate(req)
	if err != nil {
		return nil, err
	}
	expense, err := s.repo.FindByID(restaurantID, expenseID)
	if err != nil {
		return nil, errors.New("expense not found")
	}
	if err := ensureExpenseEditable(expense); err != nil {
		return nil, err
	}
	expense.Category = category
	expense.Amount = amount
	expense.SpentAt = spentAt
	expense.Note = note
	if err := s.repo.Save(expense); err != nil {
		return nil, err
	}
	return expense, nil
}

func (s *ExpenseService) Delete(restaurantID, expenseID uint) error {
	expense, err := s.repo.FindByID(restaurantID, expenseID)
	if err != nil {
		return errors.New("expense not found")
	}
	if err := ensureExpenseEditable(expense); err != nil {
		return err
	}
	return s.repo.Delete(restaurantID, expenseID)
}

func ensureExpenseEditable(expense *entity.Expense) error {
	if expense != nil && expense.IngredientTransactionID != nil {
		return errors.New("stock-in expenses cannot be edited or deleted")
	}
	return nil
}
