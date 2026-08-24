export const expenseCategories = ['ingredient', 'labor', 'rent', 'utilities', 'equipment', 'other'] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export interface Expense {
  ID: number;
  CreatedAt: string;
  category: ExpenseCategory;
  amount: number;
  spent_at: string;
  note: string;
  created_by_id: number;
  ingredient_transaction_id?: number | null;
  created_by?: { ID: number; first_name: string; last_name: string } | null;
}

export interface ExpenseCategoryTotal {
  category: ExpenseCategory;
  amount: number;
  entries: number;
}

export interface ExpenseDailyTotal {
  date: string;
  amount: number;
  entries: number;
}

export interface ExpenseListResponse {
  expenses: Expense[];
  categories: ExpenseCategoryTotal[];
  daily: ExpenseDailyTotal[];
  total: number;
  entries: number;
  has_more: boolean;
}

export interface ExpenseInput {
  category: ExpenseCategory;
  amount: number;
  spent_at: string;
  note?: string;
}
