export type AIConversationMessage = { id?: string; role: 'user' | 'assistant'; content: string };
export type AIAskRequest = {
  question: string;
  history: AIConversationMessage[];
  conversation_id?: string;
};
export type AIActionPreview = {
  id: string;
  action_type: 'set_menu_availability';
  status: string;
  expires_at: string;
  confirmation_token: string;
  summary: string;
  target: { menu_item_id: number; name: string };
  current: { is_available: boolean };
  requested: { is_available: boolean };
  warnings: string[];
};
export type AIActionConfirmationRequest = { confirmation_token: string };
export type AIActionConfirmation = {
  action_id: string;
  status: string;
  replayed: boolean;
  executed_at: string;
  message: string;
  result: { menu_item_id: number; name: string; is_available: boolean };
};
export type AISnapshot = {
  generated_at: string;
  analysis_readiness: {
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
  inventory_summary: { total_items: number; low_items: number; out_items: number; value: number };
  sales_days: Array<{ order_date: string; orders: number; revenue: number }>;
  top_menu_items: Array<{ menu_name: string; quantity: number; revenue: number }>;
  menu_margins: Array<{ menu_name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number }>;
  low_margin_menus: Array<{ menu_name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number }>;
  stock_risks: Array<{
    name: string;
    category: string;
    stock: number;
    min_stock: number;
    unit: string;
    storage_type: string;
    cost_per_unit: number;
    restock_estimate: number;
    status: 'low' | 'out' | 'ok' | string;
  }>;
};
export type AIAskResponse = {
  answer: string;
  intent: 'analysis' | 'greeting' | 'capabilities' | 'conversation' | 'unclear' | 'out_of_scope' | string;
  task?: 'explain_concept' | 'retrieve_fact' | 'analyze_data' | 'recommend_action' | string;
  tool?: 'get_lowest_margin_menu' | string;
  model: string;
  snapshot: AISnapshot;
  conversation_id?: string;
  turn_id?: string;
  action_preview?: AIActionPreview;
};
