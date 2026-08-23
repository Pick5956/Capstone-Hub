package service

import "Project-M/internal/repository"

type AIIntent string

const (
	AIIntentAnalysis   AIIntent = "analysis"
	AIIntentGreeting   AIIntent = "greeting"
	AIIntentCapability AIIntent = "capabilities"
	AIIntentChat       AIIntent = "conversation"
	AIIntentUnclear    AIIntent = "unclear"
	AIIntentOutOfScope AIIntent = "out_of_scope"
)

type AIAskRequest struct {
	Question       string                  `json:"question" binding:"required"`
	History        []AIConversationMessage `json:"history"`
	ConversationID string                  `json:"conversation_id,omitempty" binding:"omitempty,max=64"`
}

type AIConversationMessage struct {
	ID      string `json:"id,omitempty"`
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIAskResponse struct {
	Answer         string                   `json:"answer"`
	Intent         AIIntent                 `json:"intent"`
	Task           AITask                   `json:"task,omitempty"`
	Tool           AIToolName               `json:"tool,omitempty"`
	Model          string                   `json:"model"`
	Snapshot       AISnapshot               `json:"snapshot"`
	// ScopeAssumed is true when the answer covers a default time window the user did
	// not ask for ("ยอดขายเท่าไหร่" → last 30 days). The client uses it to offer
	// period-pivot chips, without re-deriving the "no scope stated" test itself.
	ScopeAssumed   bool                     `json:"scope_assumed,omitempty"`
	// Forecast carries the chart-ready sales prediction (history + bounded future +
	// measured error) when the question asked for a forecast.
	Forecast       *AIForecastResult        `json:"forecast,omitempty"`
	ConversationID string                   `json:"conversation_id,omitempty"`
	TurnID         string                   `json:"turn_id,omitempty"`
	ResolvedPlan   *ResolvedPlan            `json:"resolved_plan,omitempty"`
	ActionPreview  *AIActionPreviewResponse `json:"action_preview,omitempty"`
	CandidateTools []AIToolName             `json:"candidate_tools,omitempty"`
	Planner        *AIPlannerMetadata       `json:"planner,omitempty"`
	ToolsUsed      []AIToolName             `json:"tools_used,omitempty"`
	DocSources     []AISystemDocSource      `json:"doc_sources,omitempty"`
}

type AIPlannerMetadata struct {
	Provider         StructuredPlannerProviderName `json:"provider"`
	Model            string                        `json:"model,omitempty"`
	ProviderFallback bool                          `json:"provider_fallback"`
	LocalFallback    bool                          `json:"local_fallback"`
	AttemptCount     int                           `json:"attempt_count"`
}

type AISnapshot struct {
	GeneratedAt        string                           `json:"generated_at"`
	SalesDays          []repository.AISalesSummary      `json:"sales_days"`
	TopMenuItems       []repository.AIMenuSummary       `json:"top_menu_items"`
	TopMenusByRevenue  []repository.AIMenuSummary       `json:"top_menus_by_revenue"`
	MostExpensiveMenus []repository.AIMenuPrice         `json:"most_expensive_menus"`
	OrderTypeBreakdown []repository.AIOrderTypeSummary  `json:"order_type_breakdown"`
	MenuMargins        []repository.AIMenuMarginSummary `json:"menu_margins"`
	LowMarginMenus     []repository.AIMenuMarginSummary `json:"low_margin_menus"`
	HighMarginMenus    []repository.AIMenuMarginSummary `json:"high_margin_menus"`
	LowestCostMenus    []repository.AIMenuMarginSummary `json:"lowest_cost_menus"`
	AllMenuMargins     []repository.AIMenuMarginSummary `json:"all_menu_margins"`
	SlowMovingMenus    []repository.AIMenuSummary       `json:"slow_moving_menus"`
	PeakWeekdays       []repository.AIPeriodSummary     `json:"peak_weekdays"`
	PeakHours          []repository.AIPeriodSummary     `json:"peak_hours"`
	IngredientUsage    []repository.AIIngredientUsage   `json:"ingredient_usage"`
	AnalysisReadiness  AIAnalysisReadiness              `json:"analysis_readiness"`
	InventorySummary   AIInventorySummary               `json:"inventory_summary"`
	StockRisks         []AIStockRisk                    `json:"stock_risks"`
}

type AIAnalysisReadiness struct {
	HasSales                  bool     `json:"has_sales"`
	SalesItems                int64    `json:"sales_items"`
	MarginItems               int64    `json:"margin_items"`
	CostedMarginItems         int64    `json:"costed_margin_items"`
	SoldMenus                 int64    `json:"sold_menus"`
	SoldMenusWithRecipes      int64    `json:"sold_menus_with_recipes"`
	MarginCostCoveragePercent float64  `json:"margin_cost_coverage_percent"`
	MenuRecipeCoveragePercent float64  `json:"menu_recipe_coverage_percent"`
	CanAnalyzeRevenue         bool     `json:"can_analyze_revenue"`
	CanAnalyzeMargin          bool     `json:"can_analyze_margin"`
	CanRecommendActions       bool     `json:"can_recommend_business_actions"`
	Warnings                  []string `json:"warnings"`
}

type AIInventorySummary struct {
	TotalItems int     `json:"total_items"`
	LowItems   int     `json:"low_items"`
	OutItems   int     `json:"out_items"`
	Value      float64 `json:"value"`
}

type AIStockRisk struct {
	Name            string  `json:"name"`
	Category        string  `json:"category"`
	Stock           float64 `json:"stock"`
	MinStock        float64 `json:"min_stock"`
	Unit            string  `json:"unit"`
	StorageType     string  `json:"storage_type"`
	CostPerUnit     float64 `json:"cost_per_unit"`
	RestockEstimate float64 `json:"restock_estimate"`
	Status          string  `json:"status"`
}

type AIVerifyPayload struct {
	LowestMarginMenuName string  `json:"lowest_margin_menu_name,omitempty"`
	Quantity             int     `json:"quantity,omitempty"`
	Revenue              float64 `json:"revenue,omitempty"`
	Cost                 float64 `json:"cost,omitempty"`
	Profit               float64 `json:"profit,omitempty"`
	Margin               float64 `json:"margin,omitempty"`
	LowStockCount        int     `json:"low_stock_count,omitempty"`
	OutOfStockCount      int     `json:"out_of_stock_count,omitempty"`
	TopMenuName          string  `json:"top_menu_name,omitempty"`
	TopMenuQuantity      int     `json:"top_menu_quantity,omitempty"`
	TotalItems           int     `json:"total_items,omitempty"`
	TotalValue           float64 `json:"total_value,omitempty"`
}

type AIFinalJSONResponse struct {
	Answer string          `json:"answer"`
	Verify AIVerifyPayload `json:"verify"`
}

type geminiGenerateRequest struct {
	Contents         []geminiContent         `json:"contents"`
	Tools            []geminiTool            `json:"tools,omitempty"`
	GenerationConfig *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

type geminiGenerationConfig struct {
	Temperature *float64 `json:"temperature,omitempty"`
}

type geminiTool struct {
	FunctionDeclarations []geminiFunctionDeclaration `json:"functionDeclarations"`
}

type geminiFunctionDeclaration struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Parameters  geminiParameters `json:"parameters"`
}

type geminiParameters struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text         string              `json:"text,omitempty"`
	InlineData   *geminiInlineData   `json:"inline_data,omitempty"`
	FunctionCall *geminiFunctionCall `json:"functionCall,omitempty"`
}

// geminiInlineData carries a base64-encoded image (or other blob) so Gemini can
// read it — used by the receipt scanner to send a photo for field extraction.
type geminiInlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

type geminiFunctionCall struct {
	Name string                 `json:"name"`
	Args map[string]interface{} `json:"args"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}

type groqMessage struct {
	Role      string         `json:"role"`
	Content   string         `json:"content"`
	ToolCalls []groqToolCall `json:"tool_calls,omitempty"`
}

type groqToolCall struct {
	Id       string       `json:"id"`
	Type     string       `json:"type"`
	Function groqToolFunc `json:"function"`
}

type groqToolFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type groqRequest struct {
	Model    string        `json:"model"`
	Messages []groqMessage `json:"messages"`
	Tools    []groqTool    `json:"tools,omitempty"`
	// Temperature is a pointer so 0 is actually sent (omitempty would drop a 0
	// value). Used to pin the classifier to deterministic routing.
	Temperature *float64 `json:"temperature,omitempty"`
	// MaxTokens caps what the model may generate for one reply. It is a pointer
	// for the same reason Temperature is, and every existing caller leaves it
	// nil, so omitempty drops the key and their request bytes are unchanged.
	// Nothing sets it yet: the ceiling has to be measured before it is chosen,
	// which is what FinishReason and Usage below are for.
	MaxTokens *int `json:"max_tokens,omitempty"`
}

// zeroTemperature returns a pointer to 0 for deterministic calls (the intent
// classifier), so the same question routes the same way every time.
func zeroTemperature() *float64 {
	v := 0.0
	return &v
}

type groqTool struct {
	Type     string               `json:"type"`
	Function groqFunctionShortcut `json:"function"`
}

type groqFunctionShortcut struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  groqParameters `json:"parameters"`
}

type groqParameters struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

type groqResponse struct {
	Choices []struct {
		Message groqMessage `json:"message"`
		// FinishReason is "stop" when the model ended on its own and "length"
		// when the provider cut it off. Reading it is the only way to tell the
		// two apart: a cut reply parses fine, is not empty, and reaches the
		// owner with its last word half written — which is exactly what
		// happened to "สรุปสถานการณ์ร้าน" on 23 Aug, ending at "มูลค่ารวมของสิน".
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage groqUsage `json:"usage"`
}

// groqUsage is what the reply cost. It is recorded because the output ceiling
// cannot be set sensibly by guesswork: too low truncates more often than today,
// too high guards nothing. ReasoningTokens separates a model that thought for
// too long from one that wrote for too long, which need opposite fixes — it
// stays zero when the provider does not report it, so zero means "not reported"
// rather than "did not think".
type groqUsage struct {
	PromptTokens            int `json:"prompt_tokens"`
	CompletionTokens        int `json:"completion_tokens"`
	TotalTokens             int `json:"total_tokens"`
	CompletionTokensDetails struct {
		ReasoningTokens int `json:"reasoning_tokens"`
	} `json:"completion_tokens_details"`
}
