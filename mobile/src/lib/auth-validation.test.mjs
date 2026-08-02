import assert from 'node:assert/strict';
import test from 'node:test';

import {
  localPasswordByteLength,
  validateLocalPassword,
} from './auth-validation.ts';

function generatedAscii(length) {
  return String.fromCodePoint(65).repeat(length);
}

function generatedThai(length) {
  return String.fromCodePoint(0x0e01).repeat(length);
}

test('local password validation follows the backend 8-72 UTF-8 byte contract', () => {
  assert.deepEqual(validateLocalPassword(generatedAscii(7)), { valid: false, error: 'too_short' });
  assert.deepEqual(validateLocalPassword(generatedAscii(8)), { valid: true, error: null });
  assert.deepEqual(validateLocalPassword(generatedAscii(72)), { valid: true, error: null });
  assert.deepEqual(validateLocalPassword(generatedAscii(73)), { valid: false, error: 'too_long' });
});

test('password length counts UTF-8 bytes instead of JavaScript code units', () => {
  assert.equal(localPasswordByteLength(generatedThai(4)), 12);
  assert.deepEqual(validateLocalPassword(generatedThai(2)), { valid: false, error: 'too_short' });
  assert.deepEqual(validateLocalPassword(generatedThai(3)), { valid: true, error: null });
});
