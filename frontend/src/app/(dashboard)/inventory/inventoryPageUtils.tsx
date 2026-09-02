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

export function getStockPercent(item: Ingredient) {
  if (item.min_stock <= 0) return item.stock > 0 ? 100 : 0;
  if (item.stock <= 0) return 0;
  return Math.min(100, Math.round((item.stock / item.min_stock) * 100));
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
  note,
  paidAmount,
  canManageExpenses,
}: {
  type: AdjustStockInput["type"];
  quantity: number;
  note: string;
  paidAmount: string;
  canManageExpenses: boolean;
}): AdjustStockInput {
  const payload: AdjustStockInput = { type, quantity, note };
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
