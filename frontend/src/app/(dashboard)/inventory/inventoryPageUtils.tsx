import type { Ingredient, IngredientInput } from "@/src/types/ingredient";
import { localeForLanguage } from "@/src/lib/format";

export const UNITS = ["kg", "g", "liter", "ml", "piece", "pack", "bottle", "box", "bag"];
export const STORAGE_TYPES = ["room_temp", "chilled", "frozen", "dry"];

export const emptyForm: IngredientInput = {
  name: "",
  sku: "",
  category_id: 0,
  image_url: "",
  unit: "kg",
  base_unit: "kg",
  purchase_unit_default: "kg",
  conversion_factor_default: 1,
  stock: 0,
  min_stock: 0,
  cost_per_unit: 0,
  yield_percent: 100,
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

export function getRestockAmount(item: Ingredient) {
  return Math.max(0, getTargetStock(item) - item.stock);
}

export function getInventoryValue(item: Ingredient) {
  return item.stock * item.cost_per_unit;
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

export function SectionCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "warm" | "danger" | "success";
}) {
  const toneClass =
    tone === "warm"
      ? "border-orange-200/80 bg-orange-50/80 dark:border-orange-900/40 dark:bg-orange-950/20"
      : tone === "danger"
        ? "border-red-200/80 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/20"
        : tone === "success"
          ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950";

  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <span className="text-[11px] text-slate-400">{label}</span>
      <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p> : null}
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 dark:focus:ring-orange-900/30";
