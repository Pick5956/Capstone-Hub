export type ManagerReport = {
  generated_at: string;
  days: number;
  sales_days: Array<{ order_date: string; orders: number; revenue: number }>;
  menu_margins: Array<{ menu_id: number; menu_name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number }>;
  stock_risks: Array<{ id: number; name: string; category: string; stock: number; min_stock: number; unit: string; restock_estimate: number; status: 'low' | 'out' | string }>;
  summary: { orders: number; revenue: number; cost: number; profit: number; margin: number };
};
