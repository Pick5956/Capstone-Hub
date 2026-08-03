export type AISalesSummary = {
  order_date: string;
  orders: number;
  revenue: number;
};

export type AIMenuSummary = {
  menu_name: string;
  quantity: number;
  revenue: number;
};

export type AIMenuMarginSummary = {
  menu_name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export type AIInventorySummary = {
  total_items: number;
  low_items: number;
  out_items: number;
  value: number;
};

export type AIAnalysisReadiness = {
  has_sales: boolean;
  sales_items: number;
  margin_items: number;
  costed_margin_items: number;
  sold_menus: number;
  sold_menus_with_recipes: number;
  margin_cost_coverage_percent: number;
  menu_recipe_coverage_percent: number;
  can_analyze_revenue: boolean;
  can_analyze_margin: boolean;
  can_recommend_business_actions: boolean;
  warnings: string[];
};

export type AIStockRisk = {
  name: string;
  category: string;
  stock: number;
  min_stock: number;
  unit: string;
  storage_type: string;
  cost_per_unit: number;
  restock_estimate: number;
  status: "low" | "out" | "ok" | string;
};

export type AISnapshot = {
  generated_at: string;
  sales_days: AISalesSummary[];
  top_menu_items: AIMenuSummary[];
  menu_margins: AIMenuMarginSummary[];
  low_margin_menus: AIMenuMarginSummary[];
  analysis_readiness: AIAnalysisReadiness;
  inventory_summary: AIInventorySummary;
  stock_risks: AIStockRisk[];
};

export type AIConversationMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

export type AIAskRequest = {
  question: string;
  history: AIConversationMessage[];
  conversation_id?: string;
};

export type AIResolvedPlan = {
  schema_version: string;
  original_question: string;
  resolved_question: string;
  task: string;
  domain: string;
  operation: string;
  parameters: Record<string, unknown>;
  tool_hint: string;
  resolution: Record<string, unknown>;
  policy: Record<string, unknown>;
  response_style: string;
};

export type AIAskResponse = {
  answer: string;
  intent: "analysis" | "greeting" | "capabilities" | "conversation" | "unclear" | "out_of_scope" | string;
  task?: "explain_concept" | "retrieve_fact" | "analyze_data" | "recommend_action" | string;
  tool?: "get_lowest_margin_menu" | string;
  model: string;
  snapshot: AISnapshot;
  conversation_id?: string;
  turn_id?: string;
  resolved_plan?: AIResolvedPlan;
  candidate_tools?: string[];
  planner?: {
    provider: "groq" | "gemini" | "local_clarification_fallback" | string;
    model?: string;
    provider_fallback: boolean;
    local_fallback: boolean;
    attempt_count: number;
  };
};
