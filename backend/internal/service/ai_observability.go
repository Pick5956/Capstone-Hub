package service

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	aiObservabilityMaxRestaurants = 2048
	aiObservabilityMaxBudget      = 1_000_000_000
	defaultAILatencyWarnMS        = 5000
)

var ErrAIQuotaExceeded = errors.New("AI daily quota exceeded")

type AIProviderUsageSnapshot struct {
	Attempts       int64 `json:"attempts"`
	Succeeded      int64 `json:"succeeded"`
	Failed         int64 `json:"failed"`
	InputTokens    int64 `json:"input_tokens"`
	OutputTokens   int64 `json:"output_tokens"`
	HTTPAttempts   int64 `json:"http_attempts"`
	KeyFallbacks   int64 `json:"key_fallbacks"`
	RateLimits     int64 `json:"rate_limits"`
	TotalLatencyMS int64 `json:"total_latency_ms"`
	MaxLatencyMS   int64 `json:"max_latency_ms"`
	SlowAttempts   int64 `json:"slow_attempts"`
}

type AIUsageSnapshot struct {
	Enabled           bool                               `json:"enabled"`
	Date              string                             `json:"date"`
	Timezone          string                             `json:"timezone"`
	PlannerRequests   int64                              `json:"planner_requests"`
	PlannerErrors     int64                              `json:"planner_errors"`
	ProviderFallbacks int64                              `json:"provider_fallbacks"`
	LocalFallbacks    int64                              `json:"local_fallbacks"`
	InputTokens       int64                              `json:"input_tokens"`
	OutputTokens      int64                              `json:"output_tokens"`
	RequestBudget     int64                              `json:"request_budget"`
	TokenBudget       int64                              `json:"token_budget"`
	ByProvider        map[string]AIProviderUsageSnapshot `json:"by_provider"`
}

type aiObservabilityConfig struct {
	enabled       bool
	requestBudget int64
	tokenBudget   int64
	latencyWarnMS int64
}

type aiRestaurantUsage struct {
	plannerRequests   int64
	plannerErrors     int64
	providerFallbacks int64
	localFallbacks    int64
	inputTokens       int64
	outputTokens      int64
	byProvider        map[string]*AIProviderUsageSnapshot
}

type aiObservability struct {
	mu          sync.Mutex
	now         func() time.Time
	day         string
	restaurants map[uint]*aiRestaurantUsage
}

func newAIObservability() *aiObservability {
	return &aiObservability{
		now:         time.Now,
		restaurants: make(map[uint]*aiRestaurantUsage),
	}
}

func aiObservabilityConfigFromEnvironment() aiObservabilityConfig {
	requestBudget := nonNegativeAIEnvironmentInt("AI_DAILY_REQUEST_BUDGET")
	tokenBudget := nonNegativeAIEnvironmentInt("AI_DAILY_TOKEN_BUDGET")
	latencyWarnMS := nonNegativeAIEnvironmentInt("AI_LATENCY_WARN_MS")
	if latencyWarnMS == 0 {
		latencyWarnMS = defaultAILatencyWarnMS
	}
	enabled := aiEnvironmentFlag("AI_OBSERVABILITY_ENABLED") || requestBudget > 0 || tokenBudget > 0
	return aiObservabilityConfig{
		enabled:       enabled,
		requestBudget: requestBudget,
		tokenBudget:   tokenBudget,
		latencyWarnMS: latencyWarnMS,
	}
}

func aiEnvironmentFlag(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "on", "enabled":
		return true
	default:
		return false
	}
}

func nonNegativeAIEnvironmentInt(name string) int64 {
	value, err := strconv.ParseInt(strings.TrimSpace(os.Getenv(name)), 10, 64)
	if err != nil || value < 0 {
		return 0
	}
	if value > aiObservabilityMaxBudget {
		return aiObservabilityMaxBudget
	}
	return value
}

func (s *AIService) beginAIPlannerObservation(restaurantID uint) error {
	if s == nil || s.observability == nil {
		return nil
	}
	config := aiObservabilityConfigFromEnvironment()
	if !config.enabled {
		return nil
	}

	o := s.observability
	o.mu.Lock()
	defer o.mu.Unlock()
	usage := o.usageForRestaurantLocked(restaurantID)
	if usage == nil {
		if config.requestBudget > 0 || config.tokenBudget > 0 {
			return ErrAIQuotaExceeded
		}
		return nil
	}
	if config.requestBudget > 0 && usage.plannerRequests >= config.requestBudget {
		return ErrAIQuotaExceeded
	}
	if config.tokenBudget > 0 && usage.inputTokens+usage.outputTokens >= config.tokenBudget {
		return ErrAIQuotaExceeded
	}
	usage.plannerRequests++
	return nil
}

func (s *AIService) recordAIPlannerResult(restaurantID uint, result StructuredPlannerResult) {
	if s == nil || s.observability == nil {
		return
	}
	config := aiObservabilityConfigFromEnvironment()
	if !config.enabled {
		return
	}

	o := s.observability
	o.mu.Lock()
	usage := o.usageForRestaurantLocked(restaurantID)
	if usage == nil {
		o.mu.Unlock()
		return
	}
	if result.UsedProviderFallback {
		usage.providerFallbacks++
	}
	if result.UsedLocalFallback {
		usage.localFallbacks++
	}
	for _, attempt := range result.Attempts {
		provider := string(attempt.Provider)
		stats := usage.byProvider[provider]
		if stats == nil {
			stats = &AIProviderUsageSnapshot{}
			usage.byProvider[provider] = stats
		}
		stats.Attempts++
		if attempt.Succeeded {
			stats.Succeeded++
		} else {
			stats.Failed++
		}
		stats.InputTokens += int64(attempt.InputTokens)
		stats.OutputTokens += int64(attempt.OutputTokens)
		stats.HTTPAttempts += int64(attempt.HTTPAttempts)
		stats.KeyFallbacks += int64(attempt.KeyFallbacks)
		stats.RateLimits += int64(attempt.RateLimits)
		latencyMS := attempt.Duration.Milliseconds()
		stats.TotalLatencyMS += latencyMS
		if latencyMS > stats.MaxLatencyMS {
			stats.MaxLatencyMS = latencyMS
		}
		if latencyMS >= config.latencyWarnMS {
			stats.SlowAttempts++
		}
		usage.inputTokens += int64(attempt.InputTokens)
		usage.outputTokens += int64(attempt.OutputTokens)
	}
	inputTokens := usage.inputTokens
	outputTokens := usage.outputTokens
	o.mu.Unlock()

	aiStage("metric", "planner restaurant=%d provider=%s attempts=%d provider_fallback=%v local_fallback=%v input_tokens=%d output_tokens=%d",
		restaurantID, result.Provider, len(result.Attempts), result.UsedProviderFallback,
		result.UsedLocalFallback, inputTokens, outputTokens)
}

func (s *AIService) recordAIPlannerError(restaurantID uint) {
	if s == nil || s.observability == nil || !aiObservabilityConfigFromEnvironment().enabled {
		return
	}
	s.observability.mu.Lock()
	defer s.observability.mu.Unlock()
	if usage := s.observability.usageForRestaurantLocked(restaurantID); usage != nil {
		usage.plannerErrors++
	}
}

func (s *AIService) AIUsageForOwner(actor AIActorContext) (*AIUsageSnapshot, error) {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return nil, errors.New("authenticated restaurant owner context is required")
	}
	config := aiObservabilityConfigFromEnvironment()
	snapshot := &AIUsageSnapshot{
		Enabled:       config.enabled,
		Date:          bangkokUsageDay(time.Now()),
		Timezone:      ResolvedPlanTimezone,
		RequestBudget: config.requestBudget,
		TokenBudget:   config.tokenBudget,
		ByProvider:    map[string]AIProviderUsageSnapshot{},
	}
	if s == nil || s.observability == nil || !config.enabled {
		return snapshot, nil
	}

	o := s.observability
	o.mu.Lock()
	defer o.mu.Unlock()
	usage := o.usageForRestaurantLocked(actor.RestaurantID)
	snapshot.Date = o.day
	if usage == nil {
		return snapshot, nil
	}
	snapshot.PlannerRequests = usage.plannerRequests
	snapshot.PlannerErrors = usage.plannerErrors
	snapshot.ProviderFallbacks = usage.providerFallbacks
	snapshot.LocalFallbacks = usage.localFallbacks
	snapshot.InputTokens = usage.inputTokens
	snapshot.OutputTokens = usage.outputTokens
	for provider, stats := range usage.byProvider {
		snapshot.ByProvider[provider] = *stats
	}
	return snapshot, nil
}

func (o *aiObservability) usageForRestaurantLocked(restaurantID uint) *aiRestaurantUsage {
	day := bangkokUsageDay(o.now())
	if o.day != day {
		o.day = day
		o.restaurants = make(map[uint]*aiRestaurantUsage)
	}
	if usage := o.restaurants[restaurantID]; usage != nil {
		return usage
	}
	if restaurantID == 0 || len(o.restaurants) >= aiObservabilityMaxRestaurants {
		return nil
	}
	usage := &aiRestaurantUsage{byProvider: make(map[string]*AIProviderUsageSnapshot)}
	o.restaurants[restaurantID] = usage
	return usage
}

func bangkokUsageDay(value time.Time) string {
	location := time.FixedZone(ResolvedPlanTimezone, 7*60*60)
	return value.In(location).Format("2006-01-02")
}
