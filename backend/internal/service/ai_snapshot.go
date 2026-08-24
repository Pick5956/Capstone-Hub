package service

import "Project-M/internal/aitools"

// buildSnapshot delegates to the neutral aitools.BuildSnapshot; the method form
// stays so every caller (s.buildSnapshot) is unchanged.
func (s *AIService) buildSnapshot(restaurantID uint) (AISnapshot, error) {
	return aitools.BuildSnapshot(s.repo, restaurantID)
}

// analysisReadinessFromCoverage keeps its name in this package as a function
// value so existing tests reach the moved helper unchanged.
var analysisReadinessFromCoverage = aitools.AnalysisReadinessFromCoverage
