package service

import (
	"encoding/json"

	"Project-M/internal/entity"
	"Project-M/internal/repository"
)

func writeAuditEvent(
	auditRepo *repository.RestaurantAuditLogRepository,
	restaurantID uint,
	action string,
	actorUserID *uint,
	targetUserID *uint,
	invitationID *uint,
	details map[string]any,
) {
	if auditRepo == nil {
		return
	}

	payload := "{}"
	if len(details) > 0 {
		if encoded, err := json.Marshal(details); err == nil {
			payload = string(encoded)
		}
	}

	_ = auditRepo.Create(&entity.RestaurantAuditLog{
		RestaurantID: restaurantID,
		ActorUserID:  actorUserID,
		TargetUserID: targetUserID,
		InvitationID: invitationID,
		Action:       action,
		Details:      payload,
	})
}
