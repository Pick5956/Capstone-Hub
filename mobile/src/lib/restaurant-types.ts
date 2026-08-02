export const RESTAURANT_TYPE_VALUES = [
  'ร้านอาหาร',
  'คาเฟ่',
  'ชาบู/ปิ้งย่าง',
  'เดลิเวอรี',
  'ฟู้ดทรัค',
] as const;

export const DEFAULT_RESTAURANT_TYPE = RESTAURANT_TYPE_VALUES[0];

export type RestaurantTypeLanguage = 'th' | 'en';

const CANONICAL_LABELS: Record<
  (typeof RESTAURANT_TYPE_VALUES)[number],
  Record<RestaurantTypeLanguage, string>
> = {
  ร้านอาหาร: { th: 'ร้านอาหาร', en: 'Restaurant' },
  คาเฟ่: { th: 'คาเฟ่', en: 'Cafe' },
  'ชาบู/ปิ้งย่าง': { th: 'ชาบู/ปิ้งย่าง', en: 'Shabu / Grill' },
  เดลิเวอรี: { th: 'เดลิเวอรี', en: 'Delivery' },
  ฟู้ดทรัค: { th: 'ฟู้ดทรัค', en: 'Food truck' },
};

const TYPE_ALIASES: Record<string, (typeof RESTAURANT_TYPE_VALUES)[number]> = {
  restaurant: 'ร้านอาหาร',
  ร้านอาหาร: 'ร้านอาหาร',
  cafe: 'คาเฟ่',
  café: 'คาเฟ่',
  คาเฟ่: 'คาเฟ่',
  'shabu / grill': 'ชาบู/ปิ้งย่าง',
  'shabu/grill': 'ชาบู/ปิ้งย่าง',
  shabu: 'ชาบู/ปิ้งย่าง',
  grill: 'ชาบู/ปิ้งย่าง',
  'ชาบู/ปิ้งย่าง': 'ชาบู/ปิ้งย่าง',
  delivery: 'เดลิเวอรี',
  เดลิเวอรี: 'เดลิเวอรี',
  'food truck': 'ฟู้ดทรัค',
  food_truck: 'ฟู้ดทรัค',
  'food-truck': 'ฟู้ดทรัค',
  ฟู้ดทรัค: 'ฟู้ดทรัค',
};

const LEGACY_LABELS: Record<string, Record<RestaurantTypeLanguage, string>> = {
  bar: { th: 'บาร์', en: 'Bar' },
  fast_food: { th: 'ฟาสต์ฟู้ด', en: 'Fast food' },
};

export function normalizeRestaurantType(value: string | null | undefined): string {
  const trimmed = value?.trim() || '';
  if (!trimmed) return DEFAULT_RESTAURANT_TYPE;
  return TYPE_ALIASES[trimmed.toLocaleLowerCase('en-US')] ?? trimmed;
}

export function restaurantTypeOptions(
  language: RestaurantTypeLanguage,
  currentValue?: string | null,
): Array<{ value: string; label: string }> {
  const canonicalOptions = RESTAURANT_TYPE_VALUES.map((value) => ({
    value,
    label: CANONICAL_LABELS[value][language],
  }));
  const normalizedCurrent = normalizeRestaurantType(currentValue);

  if (RESTAURANT_TYPE_VALUES.some((value) => value === normalizedCurrent)) {
    return canonicalOptions;
  }

  const baseLabel = LEGACY_LABELS[normalizedCurrent]?.[language] || normalizedCurrent;
  const suffix = language === 'th' ? 'ค่าเดิม' : 'legacy';
  return [
    { value: normalizedCurrent, label: `${baseLabel} (${suffix})` },
    ...canonicalOptions,
  ];
}
