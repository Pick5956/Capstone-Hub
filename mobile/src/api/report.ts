import { apiRequest } from './client';
import type { ManagerReport } from '@/src/types/report';
export const getManagerReport = (days = 14) => apiRequest<ManagerReport>(`/api/v1/reports/manager?days=${days}`);
