export type RegistrationFlowResult =
  | { status: 'signed_in' }
  | { status: 'register_failed'; error: unknown }
  | { status: 'registered_sign_in_failed'; error: unknown };

interface RegistrationActions<T> {
  registerAccount: (input: T) => Promise<unknown>;
  signIn: (email: string, password: string) => Promise<void>;
}

export async function registerAndSignIn<T extends { email: string; password: string }>(
  input: T,
  actions: RegistrationActions<T>,
): Promise<RegistrationFlowResult> {
  try {
    await actions.registerAccount(input);
  } catch (error) {
    return { status: 'register_failed', error };
  }

  try {
    await actions.signIn(input.email, input.password);
    return { status: 'signed_in' };
  } catch (error) {
    return { status: 'registered_sign_in_failed', error };
  }
}

export function registrationInviteRoute(inviteToken: string) {
  return inviteToken
    ? { pathname: '/invite/[token]' as const, params: { token: inviteToken } }
    : null;
}

export function registrationFallbackLoginRoute(inviteToken: string) {
  return inviteToken
    ? { pathname: '/login' as const, params: { inviteToken } }
    : '/login' as const;
}
