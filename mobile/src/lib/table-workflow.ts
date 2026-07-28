export type TableEntryAction = 'resume' | 'reservation' | 'blocked' | 'new';

export function tableEntryAction(
  status: 'free' | 'occupied' | 'reserved' | 'inactive',
  hasActiveOrder: boolean,
): TableEntryAction {
  if (hasActiveOrder) return 'resume';
  if (status === 'inactive') return 'blocked';
  if (status === 'reserved') return 'reservation';
  return 'new';
}

export function reservationArrivalPlan(tableId: number) {
  return {
    tableStatus: 'free' as const,
    route: {
      pathname: '/order/new' as const,
      params: { tableId: String(tableId) },
    },
  };
}
