package controller

import (
	"net/http"
	"strconv"

	"Project-M/internal/repository"
	"Project-M/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ReservationController struct {
	reservationSvc *service.ReservationService
}

func ProvideReservationController(db *gorm.DB) *ReservationController {
	return &ReservationController{
		reservationSvc: service.ProvideReservationService(repository.NewReservationRepository(db)),
	}
}

// GET /api/v1/reservations
func (ctrl *ReservationController) ListReservations(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing reservation permission", "manage_table", "view_tables", "take_order")
	if !ok {
		return
	}
	status := c.Query("status")
	limit := 20
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	offset := 0
	if raw := c.Query("offset"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			offset = parsed
		}
	}
	result, err := ctrl.reservationSvc.ListReservations(restaurantID, status, limit, offset)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"reservations": result.Reservations,
		"has_more":     result.HasMore,
		"next_offset":  result.NextOffset,
		"counts":       result.Counts,
	})
}
