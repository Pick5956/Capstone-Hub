import { apiRequest } from './client';
import {
  buildManagerReportPath,
  buildTopMenuItemsPath,
  type ReportMonth,
} from '@/src/lib/report-query';
import type {
  ManagerReport,
  TopMenuItemsReport,
} from '@/src/types/report';

export const getManagerReport = (days = 14) =>
  apiRequest<ManagerReport>(buildManagerReportPath(days));

export const getTopMenuItemsByMonth = (month: ReportMonth) =>
  apiRequest<TopMenuItemsReport>(buildTopMenuItemsPath(month));
