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
	restaurantID, ok := requireRestaurant(c)
	if !ok {
		return
	}
	if !memberCan(c, "view_reports") {
		c.JSON(http.StatusForbidden, gin.H{"error": "missing view_reports permission"})
		return
	}
	report, err := ctrl.reportSvc.ManagerReport(restaurantID, boundedQueryInt(c, "days", 14, 1, 90))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}
