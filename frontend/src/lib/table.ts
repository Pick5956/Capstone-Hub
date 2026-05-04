import { apiClient } from "./apiClient";
import type { RestaurantTable, RestaurantTableInput } from "../types/table";

export const listTables = () =>
  apiClient.get<{ tables: RestaurantTable[] }>("/api/v1/tables");

export const createTable = (data: RestaurantTableInput) =>
  apiClient.post<RestaurantTable>("/api/v1/tables", data);

export const updateTable = (id: number, data: RestaurantTableInput) =>
  apiClient.put<RestaurantTable>(`/api/v1/tables/${id}`, data);

export const deleteTable = (id: number) =>
  apiClient.delete(`/api/v1/tables/${id}`);
