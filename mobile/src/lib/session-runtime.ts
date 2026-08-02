export type SessionInvalidationEvent =
  | { kind: 'auth-invalidated' }
  | { kind: 'restaurant-invalidated'; restaurantId: number };

type SessionInvalidationListener = (event: SessionInvalidationEvent) => void;

const sessionInvalidationListeners = new Set<SessionInvalidationListener>();

export function subscribeSessionInvalidation(listener: SessionInvalidationListener) {
  sessionInvalidationListeners.add(listener);
  return () => {
    sessionInvalidationListeners.delete(listener);
  };
}

export function publishSessionInvalidation(event: SessionInvalidationEvent) {
  for (const listener of sessionInvalidationListeners) {
    try {
      listener(event);
    } catch {
      // One screen listener must not prevent the remaining auth state from updating.
    }
  }
}

export function shouldApplySessionInvalidation(
  event: SessionInvalidationEvent,
  activeRestaurantId: number | null,
) {
  return event.kind === 'auth-invalidated'
    || event.restaurantId === activeRestaurantId;
}

type StoredSessionDependencies<User, Membership> = {
  getToken: () => Promise<string | null>;
  getProfile: () => Promise<User>;
  getMemberships: () => Promise<Membership[]>;
  getStoredRestaurantId: () => Promise<number | null>;
};

export type StoredSessionResult<User, Membership> =
  | { kind: 'signed-out' }
  | { kind: 'recoverable-error' }
  | { kind: 'invalid-session' }
  | {
    kind: 'memberships-unavailable';
    user: User;
    storedRestaurantId: number | null;
  }
  | {
    kind: 'authenticated';
    user: User;
    memberships: Membership[];
    storedRestaurantId: number | null;
  };

export async function loadStoredSession<User, Membership>(
  dependencies: StoredSessionDependencies<User, Membership>,
): Promise<StoredSessionResult<User, Membership>> {
  let token: string | null;
  try {
    token = await dependencies.getToken();
  } catch {
    return { kind: 'recoverable-error' };
  }

  if (!token) {
    return { kind: 'signed-out' };
  }

  let user: User;
  try {
    user = await dependencies.getProfile();
  } catch (error) {
    return hasHttpStatus(error, 401)
      ? { kind: 'invalid-session' }
      : { kind: 'recoverable-error' };
  }

  const [membershipResult, storedRestaurantResult] = await Promise.allSettled([
    dependencies.getMemberships(),
    dependencies.getStoredRestaurantId(),
  ]);
  const storedRestaurantId = storedRestaurantResult.status === 'fulfilled'
    ? storedRestaurantResult.value
    : null;

  if (membershipResult.status === 'rejected') {
    if (hasHttpStatus(membershipResult.reason, 401)) {
      return { kind: 'invalid-session' };
    }
    return {
      kind: 'memberships-unavailable',
      user,
      storedRestaurantId,
    };
  }

  return {
    kind: 'authenticated',
    user,
    memberships: membershipResult.value,
    storedRestaurantId,
  };
}

type ApiInvalidationInput = {
  status: number;
  message: string;
  authenticatedRequest: boolean;
  requestToken: string | null;
  restaurantId: number | null;
  activeRestaurantId: number | null;
};

type ApiInvalidationEffects = {
  clearSession: (expectedToken: string, afterClear: () => void) => Promise<unknown>;
  clearActiveRestaurant: (
    expectedRestaurantId: number,
    afterClear: () => void,
  ) => Promise<unknown>;
  publish: (event: SessionInvalidationEvent) => void;
};

export async function applyApiInvalidation(
  input: ApiInvalidationInput,
  effects: ApiInvalidationEffects,
): Promise<SessionInvalidationEvent | null> {
  const event = classifyApiInvalidation(input);
  if (!event) return null;

  let published = false;
  const publishAfterClear = () => {
    if (published) return;
    published = true;
    effects.publish(event);
  };

  if (event.kind === 'auth-invalidated') {
    if (!input.requestToken) return null;
    const cleared = await effects.clearSession(
      input.requestToken,
      publishAfterClear,
    ).catch(() => true);
    if (cleared === false) return null;
  } else {
    const cleared = await effects.clearActiveRestaurant(
      event.restaurantId,
      publishAfterClear,
    ).catch(() => true);
    if (cleared === false) return null;
  }
  publishAfterClear();
  return event;
}

function classifyApiInvalidation(
  input: ApiInvalidationInput,
): SessionInvalidationEvent | null {
  if (input.authenticatedRequest && input.requestToken && input.status === 401) {
    return { kind: 'auth-invalidated' };
  }

  const normalizedMessage = input.message.trim().toLowerCase();
  if (
    input.restaurantId
    && input.restaurantId === input.activeRestaurantId
    && input.status === 403
    && normalizedMessage === 'not a member of this restaurant'
  ) {
    return {
      kind: 'restaurant-invalidated',
      restaurantId: input.restaurantId,
    };
  }

  return null;
}

function hasHttpStatus(error: unknown, status: number) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'status' in error
    && error.status === status,
  );
}
