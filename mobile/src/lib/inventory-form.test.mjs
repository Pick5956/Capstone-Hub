import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIngredientCreateInput,
  buildIngredientMetadataInput,
  ingredientToFormValues,
  validateStockAdjustmentQuantity,
} from './inventory-form.ts';

const completeForm = {
  name: '  Salmon  ',
  sku: '  FISH-01  ',
  categoryId: '7',
  imageUrl: '  https://example.com/salmon.jpg  ',
  unit: 'kg',
  baseUnit: 'g',
  purchaseUnitDefault: 'box',
  conversionFactorDefault: '12.5',
  stock: '8.25',
  minStock: '2',
  cost: '315.75',
  yieldPercent: '92',
  storageType: 'chilled',
};

test('builds the complete metadata update without including stock', () => {
  const payload = buildIngredientMetadataInput(completeForm);

  assert.deepEqual(payload, {
    name: 'Salmon',
    sku: 'FISH-01',
    category_id: 7,
    image_url: 'https://example.com/salmon.jpg',
    unit: 'kg',
    base_unit: 'g',
    purchase_unit_default: 'box',
    conversion_factor_default: 12.5,
    min_stock: 2,
    cost_per_unit: 315.75,
    yield_percent: 92,
    storage_type: 'chilled',
  });
  assert.equal(Object.hasOwn(payload, 'stock'), false);
});

test('round-trips every editable backend metadata field without changing stock', () => {
  const item = {
    ID: 14,
    restaurant_id: 3,
    name: 'Salmon',
    sku: 'FISH-01',
    category_id: 7,
    image_url: 'https://example.com/salmon.jpg',
    unit: 'kg',
    base_unit: 'g',
    purchase_unit_default: 'box',
    conversion_factor_default: 12.5,
    stock: 8.25,
    min_stock: 2,
    cost_per_unit: 315.75,
    yield_percent: 92,
    storage_type: 'chilled',
  };

  const values = ingredientToFormValues(item);
  const payload = buildIngredientMetadataInput(values);

  assert.equal(values.stock, '8.25');
  assert.deepEqual(payload, {
    name: item.name,
    sku: item.sku,
    category_id: item.category_id,
    image_url: item.image_url,
    unit: item.unit,
    base_unit: item.base_unit,
    purchase_unit_default: item.purchase_unit_default,
    conversion_factor_default: item.conversion_factor_default,
    min_stock: item.min_stock,
    cost_per_unit: item.cost_per_unit,
    yield_percent: item.yield_percent,
    storage_type: item.storage_type,
  });
  assert.equal(Object.hasOwn(payload, 'stock'), false);
});

test('keeps initial stock only in the create payload', () => {
  const payload = buildIngredientCreateInput(completeForm);

  assert.equal(payload.stock, 8.25);
  assert.equal(payload.image_url, 'https://example.com/salmon.jpg');
  assert.equal(payload.base_unit, 'g');
  assert.equal(payload.purchase_unit_default, 'box');
  assert.equal(payload.conversion_factor_default, 12.5);
});

test('uses backend-compatible metadata defaults without discarding the stock unit', () => {
  const payload = buildIngredientMetadataInput({
    ...completeForm,
    categoryId: 'none',
    baseUnit: ' ',
    purchaseUnitDefault: '',
    conversionFactorDefault: '0',
    storageType: '',
  });

  assert.equal(payload.category_id, undefined);
  assert.equal(payload.base_unit, 'kg');
  assert.equal(payload.purchase_unit_default, 'kg');
  assert.equal(payload.conversion_factor_default, 1);
  assert.equal(payload.storage_type, 'room_temp');
});

test('rejects a blank stock adjustment as required', () => {
  assert.deepEqual(validateStockAdjustmentQuantity('   '), {
    ok: false,
    reason: 'required',
  });
});

test('rejects zero and negative stock adjustments as non-positive', () => {
  assert.deepEqual(validateStockAdjustmentQuantity('0'), {
    ok: false,
    reason: 'positive',
  });
  assert.deepEqual(validateStockAdjustmentQuantity('-2'), {
    ok: false,
    reason: 'positive',
  });
});

test('allows setting the stock balance to zero but not below zero', () => {
  assert.deepEqual(validateStockAdjustmentQuantity('0', 'adjust'), {
    ok: true,
    quantity: 0,
  });
  assert.deepEqual(validateStockAdjustmentQuantity('-2', 'adjust'), {
    ok: false,
    reason: 'non_negative',
  });
});

test('rejects malformed stock adjustments instead of partially parsing them', () => {
  assert.deepEqual(validateStockAdjustmentQuantity('2kg'), {
    ok: false,
    reason: 'invalid',
  });
});

test('accepts a positive decimal stock adjustment', () => {
  assert.deepEqual(validateStockAdjustmentQuantity('2.75'), {
    ok: true,
    quantity: 2.75,
  });
});
