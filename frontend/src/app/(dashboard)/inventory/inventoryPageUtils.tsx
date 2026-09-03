import type { AdjustStockInput, Ingredient, IngredientInput } from "@/src/types/ingredient";
import { localeForLanguage } from "@/src/lib/format";

export const UNITS = ["กรัม", "กก.", "มิลลิลิตร", "ลิตร", "ชิ้น", "ลูก", "ฟอง", "ใบ", "แผ่น", "ขวด", "แพ็ก", "ถุง", "กล่อง"];
export const STORAGE_TYPES = ["room_temp", "chilled", "frozen", "dry"];

export const emptyForm: IngredientInput = {
  name: "",
  category_id: 0,
  unit: "กก.",
  stock: 0,
  min_stock: 0,
  cost_per_unit: 0,
  storage_type: "room_temp",
};

export type StockStatus = "all" | "ok" | "low" | "out";
export type ItemStatus = Exclude<StockStatus, "all">;

export function getStatus(item: Ingredient): ItemStatus {
  if (item.stock === 0) return "out";
  if (item.min_stock > 0 && item.stock <= item.min_stock) return "low";
  return "ok";
}

/**
 * How many days of cover the bar treats as a full tank. A restaurant that buys
 * once a week only needs the bar to answer "do I get to the next delivery?", so
 * anything past a week is equally fine and reads as full.
 */
export const FULL_COVER_DAYS = 7;

/**
 * The bar answers "how long does this last?", not "what fraction of some
 * ceiling is this?" — the inventory has no ceiling to divide by. The old
 * version divided by min_stock, which pinned at 100% the moment stock merely
 * reached the reorder line, so an item at ten times its minimum looked
 * identical to one exactly at it.
 *
 * Returns null when the ingredient has no consumption history: there is no rate
 * to forecast from, and any percentage would be invented. Callers must render
 * that as "no usage data" rather than an empty bar.
 */
export function getStockPercent(item: Ingredient): number | null {
  if (item.stock <= 0) return 0;
  if (item.days_left === undefined || item.days_left === null) return null;
  return Math.min(100, Math.round((item.days_left / FULL_COVER_DAYS) * 100));
}

/** Rounds the cover figure the way it is spoken: "2 วัน", "7 วัน+". */
export function formatDaysLeft(item: Ingredient, lang: "th" | "en"): string | null {
  if (item.days_left === undefined || item.days_left === null) return null;
  if (item.days_left >= FULL_COVER_DAYS) {
    return lang === "th" ? `พอใช้ ${FULL_COVER_DAYS} วัน+` : `${FULL_COVER_DAYS}+ days left`;
  }
  const days = Math.max(0, Math.round(item.days_left * 10) / 10);
  return lang === "th" ? `พอใช้ ${days} วัน` : `${days} days left`;
}

export function getTargetStock(item: Ingredient) {
  return item.min_stock > 0 ? item.min_stock * 2 : Math.max(item.stock, 1);
}

export function getInventoryValue(item: Ingredient) {
  return item.stock * item.cost_per_unit;
}

export function buildAdjustStockPayload({
  type,
  quantity,
  unit,
  note,
  paidAmount,
  canManageExpenses,
}: {
  type: AdjustStockInput["type"];
  quantity: number;
  unit?: string;
  note: string;
  paidAmount: string;
  canManageExpenses: boolean;
}): AdjustStockInput {
  const payload: AdjustStockInput = { type, quantity, note };
  // Only send a unit when it differs from what the ingredient stores; an empty
  // unit already means "the ingredient's own", and sending it adds nothing.
  if (unit && unit.trim()) payload.unit = unit.trim();
  const amount = Number(paidAmount);
  if (type === "in" && canManageExpenses && paidAmount.trim() !== "" && Number.isFinite(amount) && amount > 0) {
    payload.amount = amount;
  }
  return payload;
}

export function formatDateTime(value: string | undefined, language: "th" | "en") {
  if (!value) return language === "th" ? "ยังไม่มีข้อมูล" : "No update yet";
  return new Date(value).toLocaleString(localeForLanguage(language), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const inputCls =
  "h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 dark:focus:ring-orange-900/30";
