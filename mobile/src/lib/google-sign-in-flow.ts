interface GoogleSuccessResponse {
  data: {
    idToken: string | null;
  };
}

export interface GoogleSignInAdapter {
  checkPlayServices: () => Promise<void>;
  signIn: () => Promise<unknown>;
  createAccount: () => Promise<unknown>;
  presentExplicitSignIn: () => Promise<unknown>;
  isSuccessResponse: (response: unknown) => response is GoogleSuccessResponse;
  isNoSavedCredentialFoundResponse: (response: unknown) => boolean;
  isCancelledResponse: (response: unknown) => boolean;
}

export async function acquireGoogleIdToken(
  adapter: GoogleSignInAdapter,
): Promise<string | null> {
  await adapter.checkPlayServices();

  let response = await adapter.signIn();
  if (adapter.isNoSavedCredentialFoundResponse(response)) {
    response = await adapter.createAccount();
  }
  if (adapter.isNoSavedCredentialFoundResponse(response)) {
    response = await adapter.presentExplicitSignIn();
  }

  if (adapter.isCancelledResponse(response)) {
    return null;
  }
  if (!adapter.isSuccessResponse(response)) {
    throw new Error('Google sign-in did not complete');
  }

  const idToken = response.data.idToken?.trim();
  if (!idToken) {
    throw new Error('Google did not return an ID token');
  }

  return idToken;
}
