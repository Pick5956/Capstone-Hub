import { apiRequest } from './client';
import type { Expense, ExpenseInput, ExpenseListResponse } from '@/src/types/expense';

export const listExpenses = (params: { from?: string; until?: string; category?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.until) query.set('until', params.until);
  if (params.category) query.set('category', params.category);
  const suffix = query.toString();
  return apiRequest<ExpenseListResponse>(`/api/v1/expenses${suffix ? `?${suffix}` : ''}`);
};

export const createExpense = (data: ExpenseInput) =>
  apiRequest<{ expense: Expense }>('/api/v1/expenses', { method: 'POST', body: JSON.stringify(data) });

export const updateExpense = (id: number, data: ExpenseInput) =>
  apiRequest<{ expense: Expense }>(`/api/v1/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteExpense = (id: number) =>
  apiRequest<void>(`/api/v1/expenses/${id}`, { method: 'DELETE' });
