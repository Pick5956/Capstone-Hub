import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RESTAURANT_TYPE,
  RESTAURANT_TYPE_VALUES,
  normalizeRestaurantType,
  restaurantTypeOptions,
} from './restaurant-types.ts';

test('uses the same canonical restaurant types as the current web setup', () => {
  assert.deepEqual(RESTAURANT_TYPE_VALUES, [
    'ร้านอาหาร',
    'คาเฟ่',
    'ชาบู/ปิ้งย่าง',
    'เดลิเวอรี',
    'ฟู้ดทรัค',
  ]);
  assert.equal(DEFAULT_RESTAURANT_TYPE, 'ร้านอาหาร');
});

test('normalizes supported English and legacy aliases to canonical API values', () => {
  assert.equal(normalizeRestaurantType('restaurant'), 'ร้านอาหาร');
  assert.equal(normalizeRestaurantType(' Cafe '), 'คาเฟ่');
  assert.equal(normalizeRestaurantType('shabu / grill'), 'ชาบู/ปิ้งย่าง');
  assert.equal(normalizeRestaurantType('delivery'), 'เดลิเวอรี');
  assert.equal(normalizeRestaurantType('food_truck'), 'ฟู้ดทรัค');
  assert.equal(normalizeRestaurantType(''), DEFAULT_RESTAURANT_TYPE);
});

test('keeps unsupported legacy stored values available until the user changes them', () => {
  assert.equal(normalizeRestaurantType('bar'), 'bar');
  assert.equal(normalizeRestaurantType('fast_food'), 'fast_food');

  const thaiOptions = restaurantTypeOptions('th', 'bar');
  assert.deepEqual(
    thaiOptions.find((option) => option.value === 'bar'),
    { value: 'bar', label: 'บาร์ (ค่าเดิม)' },
  );

  const englishOptions = restaurantTypeOptions('en', 'fast_food');
  assert.deepEqual(
    englishOptions.find((option) => option.value === 'fast_food'),
    { value: 'fast_food', label: 'Fast food (legacy)' },
  );
});

test('returns locale-aware labels without changing canonical values', () => {
  assert.deepEqual(restaurantTypeOptions('en'), [
    { value: 'ร้านอาหาร', label: 'Restaurant' },
    { value: 'คาเฟ่', label: 'Cafe' },
    { value: 'ชาบู/ปิ้งย่าง', label: 'Shabu / Grill' },
    { value: 'เดลิเวอรี', label: 'Delivery' },
    { value: 'ฟู้ดทรัค', label: 'Food truck' },
  ]);
});
