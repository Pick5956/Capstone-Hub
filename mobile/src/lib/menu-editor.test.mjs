import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialMenuCategoryIds,
  selectableMenuCategories,
} from './menu-editor.ts';

const categories = [
  { ID: 1, display_order: 1, is_active: false, name: 'หมวดเก่า' },
  { ID: 2, display_order: 2, is_active: true, name: 'อาหารจานหลัก' },
  { ID: 3, display_order: 3, is_active: true, name: 'เครื่องดื่ม' },
];

test('new menu items start in the first active category, never an inactive category', () => {
  assert.deepEqual(initialMenuCategoryIds(undefined, categories), [2]);
});

test('editing preserves every linked category and falls back to the legacy primary category', () => {
  assert.deepEqual(
    initialMenuCategoryIds(
      {
        category_id: 2,
        categories: [
          { category_id: 3 },
          { category_id: 1 },
          { category_id: 3 },
        ],
      },
      categories,
    ),
    [3, 1],
  );

  assert.deepEqual(
    initialMenuCategoryIds({ category_id: 2, categories: [] }, categories),
    [2],
  );
});

test('inactive linked categories remain visible while unrelated inactive categories stay hidden', () => {
  assert.deepEqual(
    selectableMenuCategories(categories, [1]).map((category) => category.ID),
    [1, 2, 3],
  );
  assert.deepEqual(
    selectableMenuCategories(categories, []).map((category) => category.ID),
    [2, 3],
  );
});
