export type TableEntryAction = 'resume' | 'reservation' | 'blocked' | 'new';
export type TableStatus = 'free' | 'occupied' | 'reserved' | 'inactive';

export function canEditTableAvailability(status: TableStatus) {
  return status === 'free' || status === 'inactive';
}

export function tableEditorSaveStatus(
  current: TableStatus,
  requested: TableStatus,
) {
  return canEditTableAvailability(current) ? requested : current;
}

export function tableEntryAction(
  status: TableStatus,
  hasActiveOrder: boolean,
): TableEntryAction {
  if (hasActiveOrder) return 'resume';
  if (status === 'inactive') return 'blocked';
  if (status === 'reserved') return 'reservation';
  return 'new';
}

export function canViewReservationHistory(
  canViewTables: boolean,
  canManageTables: boolean,
  canTakeOrder: boolean,
) {
  return canViewTables || canManageTables || canTakeOrder;
}

export function canOpenDineInOrder(tableId: number, tableFound: boolean) {
  return Number.isInteger(tableId) && tableId > 0 && tableFound;
}

export function reservationArrivalOrderInput(
  tableId: number,
  guest: {
    customerCount: number | string;
    customerName?: string;
    customerPhone?: string;
  },
) {
  const parsedCount = Number(guest.customerCount);
  const customerCount = Number.isFinite(parsedCount)
    ? Math.max(1, Math.trunc(parsedCount))
    : 1;

  return {
    table_id: tableId,
    order_type: 'dine_in' as const,
    customer_count: customerCount,
    customer_name: guest.customerName?.trim() || '',
    customer_phone: guest.customerPhone?.trim() || '',
    seat_reservation: true,
  };
}
