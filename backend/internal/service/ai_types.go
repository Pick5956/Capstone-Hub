package service

import "Project-M/internal/repository"

type AIIntent string

const (
	AIIntentAnalysis   AIIntent = "analysis"
	AIIntentCapability AIIntent = "capabilities"
	AIIntentChat       AIIntent = "conversation"
	AIIntentUnclear    AIIntent = "unclear"
	AIIntentOutOfScope AIIntent = "out_of_scope"
)

type AIAskRequest struct {
	Question string                  `json:"question" binding:"required"`
	History  []AIConversationMessage `json:"history"`
}

type AIConversationMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIAskResponse struct {
	Answer   string     `json:"answer"`
	Intent   AIIntent   `json:"intent"`
	Task     AITask     `json:"task,omitempty"`
	Tool     AIToolName `json:"tool,omitempty"`
	Model    string     `json:"model"`
	Snapshot AISnapshot `json:"snapshot"`
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

type geminiGenerateRequest struct {
	Contents []geminiContent `json:"contents"`
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
}

type ollamaRequest struct {
	Model    string        `json:"model"`
	Messages []groqMessage `json:"messages"`
	Think    bool          `json:"think"`
	Options  ollamaOptions `json:"options"`
}

type ollamaOptions struct {
	NumCtx int `json:"num_ctx"`
}

type groqResponse struct {
	Choices []struct {
		Message groqMessage `json:"message"`
	} `json:"choices"`
}
