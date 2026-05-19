import { apiClient } from "./apiClient";
import type { ManagerReport } from "../types/report";

export const getManagerReport = (days = 14) =>
  apiClient.get<ManagerReport>("/api/v1/reports/manager", { params: { days } });
