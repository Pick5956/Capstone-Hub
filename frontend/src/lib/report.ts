import { apiClient } from "./apiClient";
import type { ManagerReport, TopMenuItemsReport } from "../types/report";

export const getManagerReport = (days = 14) =>
  apiClient.get<ManagerReport>("/api/v1/reports/manager", { params: { days } });

export const getTopMenuItemsByMonth = (year: number, month: number) =>
  apiClient.get<TopMenuItemsReport>("/api/v1/reports/top-menu-items", {
    params: { year, month },
  });
