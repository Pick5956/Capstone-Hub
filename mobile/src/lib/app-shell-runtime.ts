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
