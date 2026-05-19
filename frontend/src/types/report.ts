export type ReportSalesDay = {
  order_date: string;
  orders: number;
  revenue: number;
};

export type ReportMenuMargin = {
  menu_id: number;
  menu_name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export type ReportStockRisk = {
  id: number;
  name: string;
  category: string;
  stock: number;
  min_stock: number;
  unit: string;
  restock_estimate: number;
  status: "low" | "out" | string;
};

export type ManagerReport = {
  generated_at: string;
  days: number;
  sales_days: ReportSalesDay[];
  menu_margins: ReportMenuMargin[];
  stock_risks: ReportStockRisk[];
  summary: {
    orders: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
  };
};
