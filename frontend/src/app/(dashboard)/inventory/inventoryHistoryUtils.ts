import type { IngredientTransaction, TransactionType } from "@/src/types/ingredient";

export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_DEFAULT_DAYS = 30;

/**
 * YYYY-MM-DD in the viewer's own timezone. toISOString() would convert to UTC
 * first, which lands on the previous day for any Bangkok evening.
 */
export function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The history opens on the last 30 days rather than everything ever recorded. */
export function defaultHistoryRange(today: Date = new Date()) {
  const from = new Date(today);
  from.setDate(from.getDate() - (HISTORY_DEFAULT_DAYS - 1));
  return { from: toDateInput(from), to: toDateInput(today) };
}

export type HistoryMovement = {
  /** Signed change in stock, or null for an absolute set. */
  change: number | null;
  /** The level stock was set to, or null for an ordinary movement. */
  setTo: number | null;
};

/**
 * "adjust" sets an absolute level rather than moving stock by an amount, so it
 * never lands in the change column — a running total that mixed a target level
 * in with the ins and outs would be silently wrong.
 */
export function historyMovement(tx: Pick<IngredientTransaction, "type" | "quantity">): HistoryMovement {
  if (tx.type === "adjust") {
    return { change: null, setTo: tx.quantity };
  }
  return { change: tx.type === "out" ? -tx.quantity : tx.quantity, setTo: null };
}

export function historyPageCount(total: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.max(1, Math.ceil(total / limit));
}

export const HISTORY_TYPES: (TransactionType | "")[] = ["", "in", "out", "adjust"];

export function historyTypeLabel(type: TransactionType | "", lang: "th" | "en"): string {
  const labels: Record<string, [string, string]> = {
    "": ["ทุกประเภท", "All types"],
    in: ["เข้า", "In"],
    out: ["ออก", "Out"],
    adjust: ["ตั้งค่า", "Set"],
  };
  const pair = labels[type];
  if (!pair) return type;
  return lang === "th" ? pair[0] : pair[1];
}
