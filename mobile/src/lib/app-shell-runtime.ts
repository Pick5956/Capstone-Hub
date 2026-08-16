type HomeRestaurantIdentityInput = {
  restaurantName?: string | null;
  branchName?: string | null;
  roleDisplayNameOverride?: string | null;
  roleDisplayName?: string | null;
  roleName?: string | null;
  nickname?: string | null;
  firstName?: string | null;
  email?: string | null;
};

type TabletWorkspaceRailVisibilityInput = {
  activeMembership: boolean;
  authStatus: string;
  pathname: string;
  tabletBreakpoint: number;
  user: boolean;
  width: number;
};

const WORKSPACE_ROUTE_ROOTS = [
  '/home',
  '/tables',
  '/kitchen',
  '/orders',
  '/more',
  '/reservations',
  '/table-reservation',
  '/table-management',
  '/order',
  '/menu',
  '/staff',
  '/settings',
  '/inventory',
  '/reports',
  '/ai-assistant',
] as const;

export function shouldShowTabletWorkspaceRail({
  activeMembership,
  authStatus,
  pathname,
  tabletBreakpoint,
  user,
  width,
}: TabletWorkspaceRailVisibilityInput) {
  if (
    !Number.isFinite(width)
    || width < tabletBreakpoint
    || authStatus === 'loading'
    || !user
    || !activeMembership
  ) return false;

  return WORKSPACE_ROUTE_ROOTS.some(
    (routeRoot) => pathname === routeRoot || pathname.startsWith(`${routeRoot}/`),
  );
}

export function resolveHomeRestaurantIdentity({
  restaurantName,
  branchName,
  roleDisplayNameOverride,
  roleDisplayName,
  roleName,
  nickname,
  firstName,
  email,
}: HomeRestaurantIdentityInput) {
  const identitySource = nickname || firstName || email || 'D';
  return {
    restaurantName: restaurantName?.trim() || 'Dishy',
    detail: branchName?.trim()
      || roleDisplayNameOverride?.trim()
      || roleDisplayName?.trim()
      || roleName?.trim()
      || '',
    userInitial: identitySource.trim().charAt(0).toUpperCase() || 'D',
  };
}

export async function runManualRefresh(
  onRefresh: () => void | Promise<void>,
  onRefreshingChange: (refreshing: boolean) => void,
) {
  onRefreshingChange(true);
  try {
    await onRefresh();
  } finally {
    onRefreshingChange(false);
  }
}
