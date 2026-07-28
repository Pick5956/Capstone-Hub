import assert from 'node:assert/strict';
import test from 'node:test';

import { acquireGoogleIdToken } from './google-sign-in-flow.ts';

function generatedIdToken(seed = 0) {
  return Array.from(
    { length: 18 },
    (_, index) => String.fromCodePoint(65 + ((index + seed) % 26)),
  ).join('');
}

function createAdapter({
  signInResponse,
  createAccountResponse,
  explicitResponse,
}) {
  const calls = [];

  return {
    calls,
    adapter: {
      async checkPlayServices() {
        calls.push('checkPlayServices');
      },
      async signIn() {
        calls.push('signIn');
        return signInResponse;
      },
      async createAccount() {
        calls.push('createAccount');
        return createAccountResponse;
      },
      async presentExplicitSignIn() {
        calls.push('presentExplicitSignIn');
        return explicitResponse;
      },
      isSuccessResponse(response) {
        return response?.kind === 'success';
      },
      isNoSavedCredentialFoundResponse(response) {
        return response?.kind === 'no-saved-credential';
      },
      isCancelledResponse(response) {
        return response?.kind === 'cancelled';
      },
    },
  };
}

test('returns a trimmed Google ID token from the first sign-in attempt', async () => {
  const expectedToken = generatedIdToken();
  const { adapter, calls } = createAdapter({
    signInResponse: {
      kind: 'success',
      data: { idToken: `  ${expectedToken}  ` },
    },
  });

  const token = await acquireGoogleIdToken(adapter);

  assert.equal(token, expectedToken);
  assert.deepEqual(calls, ['checkPlayServices', 'signIn']);
});

test('opens account creation when no saved Google credential exists', async () => {
  const expectedToken = generatedIdToken(1);
  const { adapter, calls } = createAdapter({
    signInResponse: { kind: 'no-saved-credential' },
    createAccountResponse: {
      kind: 'success',
      data: { idToken: expectedToken },
    },
  });

  const token = await acquireGoogleIdToken(adapter);

  assert.equal(token, expectedToken);
  assert.deepEqual(calls, ['checkPlayServices', 'signIn', 'createAccount']);
});

test('falls back to explicit Google sign-in when account creation still has no credential', async () => {
  const expectedToken = generatedIdToken(2);
  const { adapter, calls } = createAdapter({
    signInResponse: { kind: 'no-saved-credential' },
    createAccountResponse: { kind: 'no-saved-credential' },
    explicitResponse: {
      kind: 'success',
      data: { idToken: expectedToken },
    },
  });

  const token = await acquireGoogleIdToken(adapter);

  assert.equal(token, expectedToken);
  assert.deepEqual(calls, [
    'checkPlayServices',
    'signIn',
    'createAccount',
    'presentExplicitSignIn',
  ]);
});

test('returns null when the user cancels Google sign-in', async () => {
  const { adapter } = createAdapter({
    signInResponse: { kind: 'cancelled' },
  });

  await assert.doesNotReject(async () => {
    assert.equal(await acquireGoogleIdToken(adapter), null);
  });
});

test('rejects a successful Google response that has no ID token', async () => {
  const { adapter } = createAdapter({
    signInResponse: { kind: 'success', data: { idToken: null } },
  });

  await assert.rejects(
    () => acquireGoogleIdToken(adapter),
    /Google did not return an ID token/,
  );
});

test('rejects an unrecognized Google response', async () => {
  const { adapter } = createAdapter({
    signInResponse: { kind: 'error' },
  });

  await assert.rejects(
    () => acquireGoogleIdToken(adapter),
    /Google sign-in did not complete/,
  );
});
