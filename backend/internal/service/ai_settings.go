package service

import (
	"errors"
	"os"
)

// AIActionsSettingView is the owner-facing AI-settings payload. ActionsEnabled is
// the owner's own on/off choice; FeatureAvailable reports whether the system
// master switch is on at all, so the settings screen can explain a toggle that
// would have no effect.
type AIActionsSettingView struct {
	ActionsEnabled   bool `json:"actions_enabled"`
	FeatureAvailable bool `json:"feature_available"`
}

// AIActionsSettingForOwner returns the current AI-settings for the owner's
// restaurant.
func (s *AIService) AIActionsSettingForOwner(restaurantID uint) (AIActionsSettingView, error) {
	view := AIActionsSettingView{FeatureAvailable: aiEnabledEnvironmentValue(os.Getenv("AI_ACTIONS_ENABLED"))}
	if s.actionsSetting == nil {
		return view, nil
	}
	enabled, err := s.actionsSetting.RestaurantAIActionsEnabled(restaurantID)
	if err != nil {
		return view, err
	}
	view.ActionsEnabled = enabled
	return view, nil
}

// SetAIActionsSettingForOwner stores the owner's choice of whether the assistant
// may make (previewed, confirmed) changes. Every action still needs an explicit
// confirmation regardless of this toggle.
func (s *AIService) SetAIActionsSettingForOwner(restaurantID uint, enabled bool) error {
	if s.actionsSetting == nil {
		return errors.New("AI settings store is unavailable")
	}
	return s.actionsSetting.SetRestaurantAIActionsEnabled(restaurantID, enabled)
}
