import assert from 'node:assert/strict';
import test from 'node:test';

import {
  categoryActiveToggleInput,
  initialMenuCategoryIds,
  validateMenuOptionGroups,
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

const option = (overrides = {}) => ({
  name: 'Regular',
  price_delta: 0,
  is_default: false,
  display_order: 1,
  is_active: true,
  ...overrides,
});

const optionGroup = (overrides = {}) => ({
  name: 'Size',
  required: false,
  min_select: 0,
  max_select: 1,
  display_order: 1,
  is_active: true,
  options: [option()],
  ...overrides,
});

test('normalizes option selection bounds and payload text without mutating the editor state', () => {
  const groups = [
    optionGroup({
      name: '  Size  ',
      required: true,
      min_select: -3,
      max_select: 0,
      display_order: 0,
      options: [
        option({
          name: '  Large  ',
          price_delta: Number.NaN,
          display_order: 0,
        }),
      ],
    }),
  ];

  const result = validateMenuOptionGroups(groups);

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.groups, [
    optionGroup({
      name: 'Size',
      required: true,
      min_select: 1,
      max_select: 1,
      display_order: 1,
      options: [option({ name: 'Large', price_delta: 0, display_order: 1 })],
    }),
  ]);
  assert.equal(groups[0].name, '  Size  ');
  assert.equal(groups[0].min_select, -3);
});

test('rejects invalid min, max, active-option, and default-option constraints', () => {
  const result = validateMenuOptionGroups([
    optionGroup({
      name: 'Minimum exceeds maximum',
      required: true,
      min_select: 2,
      max_select: 1,
      options: [option(), option({ name: 'Large', display_order: 2 })],
    }),
    optionGroup({
      name: 'Not enough active options',
      min_select: 2,
      max_select: 2,
      options: [
        option(),
        option({ name: 'Large', is_active: false, display_order: 2 }),
      ],
    }),
    optionGroup({
      name: 'Too many defaults',
      max_select: 1,
      options: [
        option({ name: 'Egg', is_default: true }),
        option({ name: 'Cheese', is_default: true, display_order: 2 }),
      ],
    }),
  ]);

  assert.deepEqual(
    result.issues.map(({ code, groupIndex }) => ({ code, groupIndex })),
    [
      { code: 'max_below_min', groupIndex: 0 },
      { code: 'min_exceeds_active_options', groupIndex: 1 },
      { code: 'defaults_exceed_max', groupIndex: 2 },
    ],
  );
});

test('rejects incomplete and duplicate option names plus negative prices', () => {
  const result = validateMenuOptionGroups([
    optionGroup({ name: '  ', options: [] }),
    optionGroup({
      name: 'Toppings',
      options: [
        option({ name: '  ' }),
        option({ name: 'Egg', price_delta: -1, display_order: 2 }),
        option({ name: ' egg ', display_order: 3 }),
      ],
    }),
    optionGroup({ name: ' toppings ', options: [option({ name: 'Cheese' })] }),
  ]);

  assert.deepEqual(
    result.issues.map(({ code, groupIndex, optionIndex }) => ({
      code,
      groupIndex,
      optionIndex,
    })),
    [
      { code: 'group_name_required', groupIndex: 0, optionIndex: undefined },
      { code: 'option_required', groupIndex: 0, optionIndex: undefined },
      { code: 'option_name_required', groupIndex: 1, optionIndex: 0 },
      { code: 'option_price_negative', groupIndex: 1, optionIndex: 1 },
      { code: 'option_name_duplicate', groupIndex: 1, optionIndex: 2 },
      { code: 'group_name_duplicate', groupIndex: 2, optionIndex: undefined },
    ],
  );
});

test('category active toggle preserves editable metadata and flips only the status', () => {
  assert.deepEqual(
    categoryActiveToggleInput({
      ID: 8,
      name: '  Drinks  ',
      display_order: 4,
      is_active: true,
    }),
    {
      name: 'Drinks',
      display_order: 4,
      is_active: false,
    },
  );
});
