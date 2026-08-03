import { apiClient } from "./apiClient";

export const expenseCategories = ["ingredient", "labor", "rent", "utilities", "equipment", "other"] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export type Expense = {
  ID: number;
  CreatedAt: string;
  category: ExpenseCategory;
  amount: number;
  spent_at: string;
  note: string;
  created_by_id: number;
  ingredient_transaction_id?: number | null;
  created_by?: { ID: number; first_name: string; last_name: string } | null;
};

export type ExpenseCategoryTotal = {
  category: ExpenseCategory;
  amount: number;
  entries: number;
};

export type ExpenseDailyTotal = { date: string; amount: number; entries: number };

export type ExpenseListResponse = {
  expenses: Expense[];
  categories: ExpenseCategoryTotal[];
  daily: ExpenseDailyTotal[];
  total: number;
  entries: number;
  has_more: boolean;
};

export type ExpenseInput = {
  category: ExpenseCategory;
  amount: number;
  spent_at: string;
  note?: string;
};

export const listExpenses = (params: { from?: string; until?: string; category?: string } = {}) =>
  apiClient.get<ExpenseListResponse>("/api/v1/expenses", { params });

export const createExpense = (data: ExpenseInput) =>
  apiClient.post<{ expense: Expense }>("/api/v1/expenses", data);

export const updateExpense = (id: number, data: ExpenseInput) =>
  apiClient.put<{ expense: Expense }>(`/api/v1/expenses/${id}`, data);

export const deleteExpense = (id: number) => apiClient.delete(`/api/v1/expenses/${id}`);
