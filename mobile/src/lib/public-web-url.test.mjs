import assert from 'node:assert/strict';
import test from 'node:test';

import {
  customerTableUrl,
  invitationUrl,
  publicWebUrl,
} from './public-web-url.ts';

test('public web links safely default to the established Dishy host', () => {
  assert.equal(publicWebUrl(undefined), 'https://dishy.pro');
  assert.equal(invitationUrl('invite token', undefined), 'https://dishy.pro/invitations/invite%20token');
  assert.equal(customerTableUrl('table/token', undefined), 'https://dishy.pro/customer/t/table%2Ftoken');
});

test('configured public web links are trimmed and never contain duplicate trailing slashes', () => {
  assert.equal(publicWebUrl('  https://preview.example.test///  '), 'https://preview.example.test');
  assert.equal(invitationUrl('abc', 'https://preview.example.test/'), 'https://preview.example.test/invitations/abc');
  assert.equal(customerTableUrl('xyz', 'https://preview.example.test///'), 'https://preview.example.test/customer/t/xyz');
});
