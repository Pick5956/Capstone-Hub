export type AIConversationMessage = { role: 'user' | 'assistant'; content: string };
export type AISnapshot = {
  generated_at: string;
  analysis_readiness: { can_analyze_revenue: boolean; can_analyze_margin: boolean; can_recommend_business_actions: boolean; warnings: string[] };
  inventory_summary: { total_items: number; low_items: number; out_items: number; value: number };
  sales_days: Array<{ order_date: string; orders: number; revenue: number }>;
  top_menu_items: Array<{ menu_name: string; quantity: number; revenue: number }>;
  menu_margins: Array<{ menu_name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number }>;
  low_margin_menus: Array<{ menu_name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number }>;
  stock_risks: Array<{ name: string; category: string; stock: number; min_stock: number; unit: string; status: string }>;
};
export type AIAskResponse = { answer: string; intent: string; task?: string; tool?: string; model: string; snapshot: AISnapshot };
