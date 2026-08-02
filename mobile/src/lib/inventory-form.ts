import type { Ingredient, IngredientInput, IngredientMetadataInput } from '@/src/types/ingredient';

export const INGREDIENT_UNITS = [
  'กรัม',
  'กก.',
  'มิลลิลิตร',
  'ลิตร',
  'ชิ้น',
  'ลูก',
  'ฟอง',
  'ใบ',
  'แผ่น',
  'ขวด',
  'แพ็ก',
  'ถุง',
  'กล่อง',
] as const;

export interface IngredientFormValues {
  name: string;
  sku: string;
  categoryId: string;
  imageUrl: string;
  unit: string;
  stock: string;
  minStock: string;
  cost: string;
  yieldPercent: string;
  storageType: string;
}

export type StockAdjustmentQuantityResult =
  | { ok: true; quantity: number }
  | { ok: false; reason: 'required' | 'invalid' | 'positive' | 'non_negative' };

export type StockAdjustmentType = 'in' | 'out' | 'adjust';

export function ingredientUnitOptions(currentUnit: string): string[] {
  const unit = currentUnit.trim();
  return unit && !INGREDIENT_UNITS.some((option) => option === unit)
    ? [unit, ...INGREDIENT_UNITS]
    : [...INGREDIENT_UNITS];
}

function finiteNumber(value: string, fallback: number) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeNumber(value: string, fallback = 0) {
  const parsed = finiteNumber(value, fallback);
  return parsed >= 0 ? parsed : fallback;
}

export function ingredientToFormValues(item: Ingredient): IngredientFormValues {
  const unit = item.unit?.trim() || 'กก.';

  return {
    name: item.name || '',
    sku: item.sku || '',
    categoryId: item.category_id ? String(item.category_id) : 'none',
    imageUrl: item.image_url || '',
    unit,
    stock: String(item.stock ?? 0),
    minStock: String(item.min_stock ?? 0),
    cost: String(item.cost_per_unit ?? 0),
    yieldPercent: String(item.yield_percent ?? 100),
    storageType: item.storage_type || 'room_temp',
  };
}

export function buildIngredientMetadataInput(values: IngredientFormValues): IngredientMetadataInput {
  const unit = values.unit.trim();
  const categoryId = Number(values.categoryId);
  const yieldPercent = finiteNumber(values.yieldPercent, 100);

  return {
    name: values.name.trim(),
    sku: values.sku.trim(),
    category_id: values.categoryId === 'none' || !Number.isInteger(categoryId) || categoryId <= 0 ? undefined : categoryId,
    image_url: values.imageUrl.trim(),
    unit,
    min_stock: nonNegativeNumber(values.minStock),
    cost_per_unit: nonNegativeNumber(values.cost),
    yield_percent: yieldPercent > 0 && yieldPercent <= 100 ? yieldPercent : 100,
    storage_type: values.storageType.trim() || 'room_temp',
  };
}

export function buildIngredientCreateInput(values: IngredientFormValues): IngredientInput {
  return {
    ...buildIngredientMetadataInput(values),
    stock: nonNegativeNumber(values.stock),
  };
}

export function validateStockAdjustmentQuantity(
  value: string,
  adjustmentType: StockAdjustmentType = 'in',
): StockAdjustmentQuantityResult {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: 'required' };

  const quantity = Number(trimmed);
  if (!Number.isFinite(quantity)) return { ok: false, reason: 'invalid' };
  if (adjustmentType === 'adjust') {
    if (quantity < 0) return { ok: false, reason: 'non_negative' };
    return { ok: true, quantity };
  }
  if (quantity <= 0) return { ok: false, reason: 'positive' };

  return { ok: true, quantity };
}
