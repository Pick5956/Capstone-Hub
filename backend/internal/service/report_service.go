package service

import (
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

type ReportService struct {
	repo *repository.ReportRepository
}

func ProvideReportService(repo *repository.ReportRepository) *ReportService {
	return &ReportService{repo: repo}
}

type ManagerReportResponse struct {
	GeneratedAt string                        `json:"generated_at"`
	Days        int                           `json:"days"`
	SalesDays   []repository.ReportSalesDay   `json:"sales_days"`
	MenuMargins []repository.ReportMenuMargin `json:"menu_margins"`
	StockRisks  []ManagerReportStockRisk      `json:"stock_risks"`
	Summary     ManagerReportSummary          `json:"summary"`
}

type ManagerReportSummary struct {
	Orders  int64   `json:"orders"`
	Revenue float64 `json:"revenue"`
	Cost    float64 `json:"cost"`
	Profit  float64 `json:"profit"`
	Margin  float64 `json:"margin"`
}

type ManagerReportStockRisk struct {
	ID              uint    `json:"id"`
	Name            string  `json:"name"`
	Category        string  `json:"category"`
	Stock           float64 `json:"stock"`
	MinStock        float64 `json:"min_stock"`
	Unit            string  `json:"unit"`
	RestockEstimate float64 `json:"restock_estimate"`
	Status          string  `json:"status"`
}

func (s *ReportService) ManagerReport(restaurantID uint, days int) (*ManagerReportResponse, error) {
	if days < 1 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	since := repository.BangkokNow().AddDate(0, 0, -days)
	sales, err := s.repo.SalesByDay(restaurantID, since)
	if err != nil {
		return nil, err
	}
	margins, err := s.repo.MenuMargins(restaurantID, since)
	if err != nil {
		return nil, err
	}
	ingredients, err := s.repo.StockRisks(restaurantID)
	if err != nil {
		return nil, err
	}
	totalFoodCost, err := s.repo.TotalFoodCost(restaurantID, since)
	if err != nil {
		return nil, err
	}
	if sales == nil {
		sales = []repository.ReportSalesDay{}
	}
	if margins == nil {
		margins = []repository.ReportMenuMargin{}
	}

	for i := range sales {
		sales[i].Cost = roundMoney(sales[i].Cost)
		sales[i].Profit = roundMoney(sales[i].Profit)
	}

	summary := ManagerReportSummary{}
	for _, day := range sales {
		summary.Orders += day.Orders
		summary.Revenue += day.Revenue
	}
	summary.Cost = roundMoney(totalFoodCost)
	summary.Profit = roundMoney(summary.Revenue - summary.Cost)
	if summary.Revenue > 0 {
		summary.Margin = roundMoney(summary.Profit / summary.Revenue * 100)
	}

	risks := make([]ManagerReportStockRisk, 0, len(ingredients))
	for _, ingredient := range ingredients {
		risks = append(risks, stockRiskFromIngredient(ingredient))
	}

	return &ManagerReportResponse{
		GeneratedAt: repository.BangkokNow().Format(time.RFC3339),
		Days:        days,
		SalesDays:   sales,
		MenuMargins: margins,
		StockRisks:  risks,
		Summary:     summary,
	}, nil
}

type TopMenuItemsResponse struct {
	Year  int                            `json:"year"`
	Month int                            `json:"month"`
	Items []repository.ReportTopMenuItem `json:"items"`
}

func (s *ReportService) TopMenuItemsByMonth(restaurantID uint, year, month int) (*TopMenuItemsResponse, error) {
	loc := repository.BangkokNow().Location()
	monthStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
	monthEnd := monthStart.AddDate(0, 1, 0)

	items, err := s.repo.TopMenuItemsByMonth(restaurantID, monthStart, monthEnd)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []repository.ReportTopMenuItem{}
	}

	return &TopMenuItemsResponse{
		Year:  year,
		Month: month,
		Items: items,
	}, nil
}

func stockRiskFromIngredient(ingredient entity.Ingredient) ManagerReportStockRisk {
	status := "low"
	if ingredient.Stock <= 0 {
		status = "out"
	}
	category := ""
	if ingredient.Category != nil {
		category = ingredient.Category.Name
	}
	target := ingredient.MinStock * 2
	if target <= 0 {
		target = 1
	}
	return ManagerReportStockRisk{
		ID:              ingredient.ID,
		Name:            ingredient.Name,
		Category:        category,
		Stock:           ingredient.Stock,
		MinStock:        ingredient.MinStock,
		Unit:            ingredient.Unit,
		RestockEstimate: maxFloat(0, target-ingredient.Stock),
		Status:          status,
	}
}
