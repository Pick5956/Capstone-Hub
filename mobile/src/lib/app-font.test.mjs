import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_FONT_FAMILIES,
  resolveAppFontFamily,
  resolveAppFontWeight,
} from './app-font.ts';

const cases = [
  [undefined, APP_FONT_FAMILIES.regular],
  ['normal', APP_FONT_FAMILIES.regular],
  ['100', APP_FONT_FAMILIES.regular],
  ['ultralight', APP_FONT_FAMILIES.regular],
  ['thin', APP_FONT_FAMILIES.regular],
  ['light', APP_FONT_FAMILIES.regular],
  ['regular', APP_FONT_FAMILIES.regular],
  ['condensed', APP_FONT_FAMILIES.regular],
  ['400', APP_FONT_FAMILIES.regular],
  [400, APP_FONT_FAMILIES.regular],
  ['medium', APP_FONT_FAMILIES.medium],
  ['500', APP_FONT_FAMILIES.medium],
  [500, APP_FONT_FAMILIES.medium],
  ['semibold', APP_FONT_FAMILIES.semiBold],
  ['600', APP_FONT_FAMILIES.semiBold],
  [600, APP_FONT_FAMILIES.semiBold],
  ['bold', APP_FONT_FAMILIES.bold],
  ['condensedBold', APP_FONT_FAMILIES.bold],
  ['700', APP_FONT_FAMILIES.bold],
  [700, APP_FONT_FAMILIES.bold],
  ['heavy', APP_FONT_FAMILIES.extraBold],
  ['black', APP_FONT_FAMILIES.extraBold],
  ['800', APP_FONT_FAMILIES.extraBold],
  [800, APP_FONT_FAMILIES.extraBold],
  ['900', APP_FONT_FAMILIES.extraBold],
  [900, APP_FONT_FAMILIES.extraBold],
];

for (const [weight, expectedFamily] of cases) {
  test(`maps ${String(weight)} to ${expectedFamily}`, () => {
    assert.equal(resolveAppFontFamily(weight), expectedFamily);
  });
}

test('nested text inherits its parent weight when no weight is set', () => {
  assert.equal(resolveAppFontWeight(undefined, '700'), '700');
});

test('an explicit nested weight overrides its parent weight', () => {
  assert.equal(resolveAppFontWeight('800', '700'), '800');
});

test('top-level text defaults to normal weight', () => {
  assert.equal(resolveAppFontWeight(undefined), 'normal');
});
