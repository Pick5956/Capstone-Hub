package service

import (
	"errors"
	"os"
	"strings"
	"unicode/utf8"

	"Project-M/internal/repository"
)

// AIActionsSettingView is the owner-facing AI-settings payload — everything
// the settings screen shows, in one read.
//
// ActionsEnabled is the owner's master switch; FeatureAvailable reports whether
// the system master switch is on at all, so the screen can explain a toggle
// that would have no effect. ActionTypes and InsightKinds always carry every
// key the screen renders, with the default applied, so the frontend never has
// to know what "missing" means.
type AIActionsSettingView struct {
	ActionsEnabled   bool            `json:"actions_enabled"`
	FeatureAvailable bool            `json:"feature_available"`
	ActionTypes      map[string]bool `json:"action_types"`
	InsightKinds     map[string]bool `json:"insight_kinds"`
	OwnerTitle       string          `json:"owner_title"`
}

// AISettingsPatch is one change from the settings screen. Every field is
// optional: the screen saves each switch the moment it is flipped, and a save
// must not reset the switches it did not touch.
type AISettingsPatch struct {
	ActionsEnabled *bool           `json:"actions_enabled"`
	ActionTypes    map[string]bool `json:"action_types"`
	InsightKinds   map[string]bool `json:"insight_kinds"`
	OwnerTitle     *string         `json:"owner_title"`
}

// AIActionsSettingForOwner returns the current AI-settings for the owner's
// restaurant.
func (s *AIService) AIActionsSettingForOwner(restaurantID uint) (AIActionsSettingView, error) {
	view := AIActionsSettingView{FeatureAvailable: aiEnabledEnvironmentValue(os.Getenv("AI_ACTIONS_ENABLED"))}
	if s.actionsSetting != nil {
		enabled, err := s.actionsSetting.RestaurantAIActionsEnabled(restaurantID)
		if err != nil {
			return view, err
		}
		view.ActionsEnabled = enabled
	}
	prefs := AIPreferences{}
	if s.preferences != nil {
		stored, err := s.preferences.RestaurantAIPreferences(restaurantID)
		if err != nil {
			return view, err
		}
		prefs = AIPreferences(stored)
	}
	view.ActionTypes = prefs.fullActionTypes()
	view.InsightKinds = prefs.fullInsightKinds()
	view.OwnerTitle = prefs.Title()
	return view, nil
}

// SetAIActionsSettingForOwner stores the owner's choice of whether the assistant
// may make (previewed, confirmed) changes. Every action still needs an explicit
// confirmation regardless of this toggle. Kept for the callers that only ever
// flip the master switch.
func (s *AIService) SetAIActionsSettingForOwner(restaurantID uint, enabled bool) error {
	if s.actionsSetting == nil {
		return errors.New("AI settings store is unavailable")
	}
	return s.actionsSetting.SetRestaurantAIActionsEnabled(restaurantID, enabled)
}

// ApplyAISettingsPatchForOwner stores whichever parts of the settings the
// patch carries and leaves the rest as they were.
//
// Unknown action types and insight kinds are dropped rather than refused: a
// stale frontend sending a key this build no longer knows should not lose the
// owner the rest of the save. The title is trimmed and bounded — it goes into
// the persona on every call, so it stays a form of address.
func (s *AIService) ApplyAISettingsPatchForOwner(restaurantID uint, patch AISettingsPatch) error {
	if patch.ActionsEnabled != nil {
		if err := s.SetAIActionsSettingForOwner(restaurantID, *patch.ActionsEnabled); err != nil {
			return err
		}
	}
	if patch.ActionTypes == nil && patch.InsightKinds == nil && patch.OwnerTitle == nil {
		return nil
	}
	if s.preferences == nil {
		return errors.New("AI preferences store is unavailable")
	}
	stored, err := s.preferences.RestaurantAIPreferences(restaurantID)
	if err != nil {
		return err
	}
	prefs := AIPreferences(stored)
	if patch.ActionTypes != nil {
		if prefs.ActionTypes == nil {
			prefs.ActionTypes = map[string]bool{}
		}
		for _, actionType := range aiSettableActionTypes {
			if allowed, sent := patch.ActionTypes[actionType]; sent {
				prefs.ActionTypes[actionType] = allowed
			}
		}
	}
	if patch.InsightKinds != nil {
		if prefs.InsightKinds == nil {
			prefs.InsightKinds = map[string]bool{}
		}
		for _, kind := range aiInsightKinds {
			if shown, sent := patch.InsightKinds[kind]; sent {
				prefs.InsightKinds[kind] = shown
			}
		}
	}
	if patch.OwnerTitle != nil {
		title := strings.Join(strings.Fields(*patch.OwnerTitle), " ")
		if utf8.RuneCountInString(title) > aiOwnerTitleMaxRunes {
			return errors.New("owner title is too long")
		}
		prefs.OwnerTitle = title
	}
	return s.preferences.SetRestaurantAIPreferences(restaurantID, repository.AIPreferences(prefs))
}
