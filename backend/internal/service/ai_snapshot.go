package service

import (
	"errors"
	"sort"
	"time"

	"Project-M/internal/repository"
)

func (s *AIService) buildSnapshot(restaurantID uint) (AISnapshot, error) {
	if s.repo == nil {
		return AISnapshot{}, errors.New("restaurant repository is not initialized")
	}
	since := repository.BangkokNow().AddDate(0, 0, -14)
	ingredients, err := s.repo.ListIngredients(restaurantID)
	if err != nil {
		return AISnapshot{}, err
	}
	sales, err := s.repo.RecentSalesSummary(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	topMenus, err := s.repo.TopMenuItems(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	menuMargins, err := s.repo.MenuMargins(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	lowMarginMenus, err := s.repo.LowMarginMenus(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	highMarginMenus, err := s.repo.HighMarginMenus(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	coverage, err := s.repo.AnalysisCoverage(restaurantID, since)
	if err != nil {
		return AISnapshot{}, err
	}
	if sales == nil {
		sales = []repository.AISalesSummary{}
	}
	if topMenus == nil {
		topMenus = []repository.AIMenuSummary{}
	}
	if menuMargins == nil {
		menuMargins = []repository.AIMenuMarginSummary{}
	}
	if lowMarginMenus == nil {
		lowMarginMenus = []repository.AIMenuMarginSummary{}
	}
	if highMarginMenus == nil {
		highMarginMenus = []repository.AIMenuMarginSummary{}
	}

	summary := AIInventorySummary{TotalItems: len(ingredients)}
	risks := make([]AIStockRisk, 0)
	for _, item := range ingredients {
		summary.Value += item.Stock * item.CostPerUnit
		status := "ok"
		if item.Stock <= 0 {
			status = "out"
			summary.OutItems++
		} else if item.MinStock > 0 && item.Stock <= item.MinStock {
			status = "low"
			summary.LowItems++
		}

		if status != "ok" {
			categoryName := ""
			if item.Category != nil {
				categoryName = item.Category.Name
			}
			target := item.MinStock * 2
			if target <= 0 {
				target = 1
			}
			risks = append(risks, AIStockRisk{
				Name:            item.Name,
				Category:        categoryName,
				Stock:           item.Stock,
				MinStock:        item.MinStock,
				Unit:            item.Unit,
				StorageType:     item.StorageType,
				CostPerUnit:     item.CostPerUnit,
				RestockEstimate: maxFloat(0, target-item.Stock),
				Status:          status,
			})
		}
	}
	sort.SliceStable(risks, func(i, j int) bool {
		if risks[i].Status != risks[j].Status {
			return risks[i].Status == "out"
		}
		return risks[i].RestockEstimate > risks[j].RestockEstimate
	})
	if len(risks) > 12 {
		risks = risks[:12]
	}

	return AISnapshot{
		GeneratedAt:       repository.BangkokNow().Format(time.RFC3339),
		SalesDays:         sales,
		TopMenuItems:      topMenus,
		MenuMargins:       menuMargins,
		LowMarginMenus:    lowMarginMenus,
		HighMarginMenus:   highMarginMenus,
		AnalysisReadiness: analysisReadinessFromCoverage(coverage),
		InventorySummary:  summary,
		StockRisks:        risks,
	}, nil
}

func analysisReadinessFromCoverage(coverage repository.AIAnalysisCoverage) AIAnalysisReadiness {
	readiness := AIAnalysisReadiness{
		HasSales:             coverage.SalesItems > 0,
		SalesItems:           coverage.SalesItems,
		MarginItems:          coverage.MarginItems,
		CostedMarginItems:    coverage.CostedMarginItems,
		SoldMenus:            coverage.SoldMenus,
		SoldMenusWithRecipes: coverage.SoldMenusWithRecipes,
		Warnings:             []string{},
	}
	if coverage.MarginItems > 0 {
		readiness.MarginCostCoveragePercent = float64(coverage.CostedMarginItems) / float64(coverage.MarginItems) * 100
	}
	if coverage.SoldMenus > 0 {
		readiness.MenuRecipeCoveragePercent = float64(coverage.SoldMenusWithRecipes) / float64(coverage.SoldMenus) * 100
	}

	readiness.CanAnalyzeRevenue = readiness.HasSales
	readiness.CanAnalyzeMargin = coverage.MarginItems > 0 && readiness.MarginCostCoveragePercent >= 100
	readiness.CanRecommendActions = readiness.CanAnalyzeMargin && readiness.MenuRecipeCoveragePercent >= 100

	if !readiness.HasSales {
		readiness.Warnings = append(readiness.Warnings, "No recorded sales are available in the analysis period.")
		return readiness
	}
	if coverage.MarginItems == 0 {
		readiness.Warnings = append(readiness.Warnings, "No served sales are available for confirmed margin analysis.")
		return readiness
	}
	if !readiness.CanAnalyzeMargin {
		readiness.Warnings = append(readiness.Warnings, "Some served items have no recorded inventory cost deduction; margin and profit are not confirmed.")
	}
	if readiness.MenuRecipeCoveragePercent < 100 {
		readiness.Warnings = append(readiness.Warnings, "Some sold menus have no current ingredient recipe; inventory and business recommendations need setup review.")
	}
	return readiness
}
