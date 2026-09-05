package service

import (
	"encoding/json"
	"log"

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

	// writeAuditEvent has no return value, so a dropped write cannot be noticed
	// by any caller. An audit trail that fails silently is worse than no audit
	// trail, because it still reads as complete. Log the error type only - the
	// message can carry driver and constraint text - matching request_error and
	// upload_cleanup_failed.
	if err := auditRepo.Create(&entity.RestaurantAuditLog{
		RestaurantID: restaurantID,
		ActorUserID:  actorUserID,
		TargetUserID: targetUserID,
		InvitationID: invitationID,
		Action:       action,
		Details:      payload,
	}); err != nil {
		log.Printf("audit_write_failed restaurant_id=%d action=%s error_type=%T", restaurantID, action, err)
	}
}
