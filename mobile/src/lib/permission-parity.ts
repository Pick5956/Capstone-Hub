export type InventoryItemAccess = 'denied' | 'read' | 'edit';
export type OrderDetailResource = 'order' | 'menu' | 'categories';
export type OrderListAccess = 'denied' | 'operational' | 'archive';

export const orderRoutePermissions = ['view_orders', 'take_order'] as const;

type OrderListRequestInput = {
  status?: string;
  search?: string;
  page: number;
  limit: number;
};

export function orderListAccess(
  canViewOrders: boolean,
  canTakeOrder: boolean,
): OrderListAccess {
  if (canViewOrders) return 'archive';
  if (canTakeOrder) return 'operational';
  return 'denied';
}

export function orderListRequest(
  access: OrderListAccess,
  input: OrderListRequestInput,
) {
  if (access === 'denied') return null;
  if (access === 'operational') {
    return {
      status: 'active' as const,
      page: input.page,
      limit: input.limit,
    };
  }
  return {
    status: input.status || '',
    search: input.search?.trim() || '',
    include_summary: true as const,
    page: input.page,
    limit: input.limit,
  };
}

export function orderDetailLoadResources(canTakeOrder: boolean): readonly OrderDetailResource[] {
  return canTakeOrder
    ? ['order', 'menu', 'categories'] as const
    : ['order'] as const;
}

export function tableManagementAccess(canViewTables: boolean, canManageTable: boolean) {
  return {
    canView: canViewTables || canManageTable,
    canMutate: canManageTable,
  };
}

export function inventoryItemAccess(
  editing: boolean,
  canViewInventory: boolean,
  canManageInventory: boolean,
): InventoryItemAccess {
  if (canManageInventory) return 'edit';
  if (editing && canViewInventory) return 'read';
  return 'denied';
}

export function kitchenAccess(canViewKitchen: boolean, canUpdateOrderStatus: boolean) {
  return {
    canView: canViewKitchen,
    canUpdate: canUpdateOrderStatus,
  };
}
