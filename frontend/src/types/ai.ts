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
  role: "user" | "assistant";
  content: string;
};

export type AIAskResponse = {
  answer: string;
  intent: "analysis" | "greeting" | "capabilities" | "conversation" | "unclear" | "out_of_scope" | string;
  model: string;
  snapshot: AISnapshot;
};
