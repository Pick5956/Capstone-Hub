export type WorkspaceRoute = '/home' | '/tables' | '/kitchen' | '/orders' | '/menu';

export function resolveWorkspaceRoute(
  roleName: string,
  hasPermission: (
    permission:
      | 'view_kitchen'
      | 'take_order'
      | 'view_orders'
      | 'view_menu'
      | 'manage_menu'
  ) => boolean,
): WorkspaceRoute {
  if (roleName === 'chef' && hasPermission('view_kitchen')) return '/kitchen';
  if (roleName === 'waiter' && hasPermission('take_order')) return '/tables';
  if (roleName === 'cashier' && hasPermission('view_orders')) return '/orders';
  if (roleName === 'owner' || roleName === 'manager') return '/home';

  if (hasPermission('view_kitchen')) return '/kitchen';
  if (hasPermission('take_order')) return '/tables';
  if (hasPermission('view_orders')) return '/orders';
  if (hasPermission('view_menu') || hasPermission('manage_menu')) return '/menu';
  return '/home';
}
