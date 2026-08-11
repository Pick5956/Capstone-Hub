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
	Contents []geminiContent `json:"contents"`
	Tools    []geminiTool    `json:"tools,omitempty"`
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
	FunctionCall *geminiFunctionCall `json:"functionCall,omitempty"`
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
	} `json:"choices"`
}
