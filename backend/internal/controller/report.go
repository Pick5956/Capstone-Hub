package controller

import (
	"net/http"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ReportController struct {
	reportSvc *service.ReportService
}

func ProvideReportController(db *gorm.DB) *ReportController {
	return &ReportController{
		reportSvc: service.ProvideReportService(repository.NewReportRepository(db)),
	}
}

func (ctrl *ReportController) ManagerReport(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "view_reports", "missing view_reports permission")
	if !ok {
		return
	}
	report, err := ctrl.reportSvc.ManagerReport(restaurantID, boundedQueryInt(c, "days", 14, 1, 90))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (ctrl *ReportController) TopMenuItemsByMonth(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithPermission(c, "view_reports", "missing view_reports permission")
	if !ok {
		return
	}
	now := repository.BangkokNow()
	year := boundedQueryInt(c, "year", now.Year(), 2000, 2100)
	month := boundedQueryInt(c, "month", int(now.Month()), 1, 12)

	report, err := ctrl.reportSvc.TopMenuItemsByMonth(restaurantID, year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}
