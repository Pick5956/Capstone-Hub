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
