export type AISalesSummary = {
  order_date: string;
  orders: number;
  revenue: number;
};

export type AIInsightSeverity = "critical" | "warning" | "info";

export type AIInsight = {
  kind: string;
  severity: AIInsightSeverity;
  title: string;
  metric: string;
  detail: string;
};

export type AIReceiptDraft = {
  category: "ingredient" | "labor" | "rent" | "utilities" | "equipment" | "other" | string;
  amount: number;
  spent_at: string;
  vendor: string;
  note: string;
  confidence: "high" | "medium" | "low" | string;
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
  action: {
    type: "set_menu_availability";
    arguments: { is_available: boolean };
  } | null;
  parameters: Record<string, unknown>;
  tool_hint: string;
  resolution: Record<string, unknown>;
  policy: Record<string, unknown>;
  response_style: string;
};

export type AIActionPreview = {
  id: string;
  action_type: "set_menu_availability";
  status: string;
  expires_at: string;
  confirmation_token: string;
  summary: string;
  target: {
    menu_item_id: number;
    name: string;
  };
  current: {
    is_available: boolean;
  };
  requested: {
    is_available: boolean;
  };
  warnings: string[];
};

export type AIActionConfirmation = {
  action_id: string;
  status: string;
  replayed: boolean;
  executed_at: string;
  message: string;
  result: {
    menu_item_id: number;
    name: string;
    is_available: boolean;
  };
};

export type AISystemDocSource = {
  article_slug: string;
  section_id: string;
  article_title: string;
  section_title: string;
  relevant_content?: string;
  url: `/docs#${string}` | `/docs/${string}#${string}`;
};

export type AICalendarException = {
  date: string; // "YYYY-MM-DD"
  kind: "closed" | "open";
};

export type AICalendarView = {
  closed_weekdays: number[]; // 0=Sunday .. 6=Saturday
  exceptions: AICalendarException[];
};

export type AIForecastResult = {
  history: { date: string; actual: number }[];
  forecast: { date: string; weekday: string; predicted: number; lower: number; upper: number }[];
  mape: number;
  mae: number;
  backtest_n: number;
  sample_days: number;
  stale_days: number;
};

export type AIAskResponse = {
  answer: string;
  intent: "analysis" | "greeting" | "capabilities" | "conversation" | "unclear" | "out_of_scope" | string;
  task?: "explain_concept" | "retrieve_fact" | "analyze_data" | "recommend_action" | "product_help" | string;
  tool?: "get_lowest_margin_menu" | string;
  model: string;
  snapshot: AISnapshot;
  // True when the answer covers a default time window the user did not ask for
  // (e.g. "ยอดขายเท่าไหร่" → last 30 days). Drives the period-pivot chips.
  scope_assumed?: boolean;
  // Chart-ready sales forecast when the question asked for one.
  forecast?: AIForecastResult;
  conversation_id?: string;
  turn_id?: string;
  resolved_plan?: AIResolvedPlan;
  action_preview?: AIActionPreview;
  candidate_tools?: string[];
  tools_used?: string[];
  doc_sources?: AISystemDocSource[];
  planner?: {
    provider: "groq" | "gemini" | "local_clarification_fallback" | string;
    model?: string;
    provider_fallback: boolean;
    local_fallback: boolean;
    attempt_count: number;
  };
};
