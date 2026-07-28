export type InventoryItemAccess = 'denied' | 'read' | 'edit';
export type OrderDetailResource = 'order' | 'menu' | 'categories';

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
