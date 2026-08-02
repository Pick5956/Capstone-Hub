import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRegistrationInput } from './auth-validation.ts';
import {
  registerAndSignIn,
  registrationFallbackLoginRoute,
  registrationInviteRoute,
} from './registration-flow.ts';

function generatedCredential(length = 12) {
  return String.fromCodePoint(65).repeat(length);
}

function generatedInviteToken() {
  return Array.from(
    { length: 32 },
    (_, index) => String.fromCodePoint(65 + (index % 26)),
  ).join('');
}

test('registration validation requires every credential field and confirms the password', () => {
  const validPassword = generatedCredential();
  const validInput = {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    email: 'staff@example.com',
    password: validPassword,
    confirmPassword: validPassword,
  };

  assert.deepEqual(
    validateRegistrationInput({ ...validInput, firstName: ' ' }),
    { valid: false, error: 'missing_required' },
  );
  assert.deepEqual(
    validateRegistrationInput({ ...validInput, confirmPassword: generatedCredential(13) }),
    { valid: false, error: 'password_mismatch' },
  );
  const tooShort = generatedCredential(7);
  assert.deepEqual(
    validateRegistrationInput({ ...validInput, password: tooShort, confirmPassword: tooShort }),
    { valid: false, error: 'too_short' },
  );
  assert.deepEqual(validateRegistrationInput(validInput), { valid: true, error: null });
});

test('registration signs in with the same normalized credentials after account creation', async () => {
  const calls = [];
  const input = {
    first_name: 'สมชาย',
    last_name: 'ใจดี',
    email: 'staff@example.com',
    password: generatedCredential(),
  };

  const result = await registerAndSignIn(input, {
    async registerAccount(payload) {
      calls.push(['register', payload]);
    },
    async signIn(email, password) {
      calls.push(['sign_in', email, password]);
    },
  });

  assert.deepEqual(result, { status: 'signed_in' });
  assert.deepEqual(calls, [
    ['register', input],
    ['sign_in', input.email, input.password],
  ]);
});

test('registration failure does not attempt sign-in', async () => {
  let signInCalls = 0;
  const failure = new Error('register failed');

  const result = await registerAndSignIn(
    { email: 'staff@example.com', password: generatedCredential() },
    {
      async registerAccount() {
        throw failure;
      },
      async signIn() {
        signInCalls += 1;
      },
    },
  );

  assert.equal(result.status, 'register_failed');
  assert.equal(result.error, failure);
  assert.equal(signInCalls, 0);
});

test('post-registration sign-in failure is classified without registering twice', async () => {
  let registrationCalls = 0;
  const failure = new Error('sign in failed');

  const result = await registerAndSignIn(
    { email: 'staff@example.com', password: generatedCredential() },
    {
      async registerAccount() {
        registrationCalls += 1;
      },
      async signIn() {
        throw failure;
      },
    },
  );

  assert.equal(result.status, 'registered_sign_in_failed');
  assert.equal(result.error, failure);
  assert.equal(registrationCalls, 1);
});

test('registration follow-up routes preserve an invitation token', () => {
  const inviteToken = generatedInviteToken();

  assert.deepEqual(registrationInviteRoute(inviteToken), {
    pathname: '/invite/[token]',
    params: { token: inviteToken },
  });
  assert.equal(registrationInviteRoute(''), null);
  assert.deepEqual(registrationFallbackLoginRoute(inviteToken), {
    pathname: '/login',
    params: { inviteToken },
  });
  assert.equal(registrationFallbackLoginRoute(''), '/login');
});
