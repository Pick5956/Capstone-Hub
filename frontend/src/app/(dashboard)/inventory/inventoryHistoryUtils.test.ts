import { describe, expect, it } from "vitest";
import {
  HISTORY_PAGE_SIZE,
  defaultHistoryRange,
  historyMovement,
  historyPageCount,
  historyTypeLabel,
  toDateInput,
} from "./inventoryHistoryUtils";
import { filenameFromDisposition, transactionParams } from "@/src/lib/ingredient";
import { FULL_COVER_DAYS, formatDaysLeft, getStockPercent } from "./inventoryPageUtils";
import type { Ingredient } from "@/src/types/ingredient";
import { normalizeApiMediaUrls } from "@/src/lib/mediaUrl";

describe("toDateInput", () => {
  // toISOString() converts to UTC first, which lands on the previous day for any
  // Bangkok evening — the filter would silently miss today's movements.
  it("uses the local calendar day, not the UTC one", () => {
    const lateEvening = new Date(2026, 8, 1, 23, 30);
    expect(toDateInput(lateEvening)).toBe("2026-09-01");
  });

  it("pads single-digit months and days", () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("defaultHistoryRange", () => {
  it("opens on the last 30 days, today included", () => {
    const range = defaultHistoryRange(new Date(2026, 8, 1));
    expect(range).toEqual({ from: "2026-08-03", to: "2026-09-01" });
  });
});

describe("historyMovement", () => {
  // "adjust" sets an absolute level rather than moving stock by an amount. Mixing
  // it into the change column would make a running total silently wrong.
  it("keeps an absolute set out of the change column", () => {
    expect(historyMovement({ type: "adjust", quantity: 3.2 })).toEqual({ change: null, setTo: 3.2 });
  });

  it("signs a stock-out negative and a stock-in positive", () => {
    expect(historyMovement({ type: "out", quantity: 0.6 })).toEqual({ change: -0.6, setTo: null });
    expect(historyMovement({ type: "in", quantity: 5 })).toEqual({ change: 5, setTo: null });
  });
});

describe("historyPageCount", () => {
  it("counts the partial last page", () => {
    expect(historyPageCount(51, HISTORY_PAGE_SIZE)).toBe(2);
    expect(historyPageCount(50, HISTORY_PAGE_SIZE)).toBe(1);
  });

  // An empty history still renders one page rather than "page 1 of 0".
  it("never reports fewer than one page", () => {
    expect(historyPageCount(0, HISTORY_PAGE_SIZE)).toBe(1);
    expect(historyPageCount(10, 0)).toBe(1);
  });
});

describe("historyTypeLabel", () => {
  it("labels every type in both languages", () => {
    expect(historyTypeLabel("", "th")).toBe("ทุกประเภท");
    expect(historyTypeLabel("in", "th")).toBe("เข้า");
    expect(historyTypeLabel("out", "en")).toBe("Out");
    expect(historyTypeLabel("adjust", "en")).toBe("Set");
  });
});

describe("transactionParams", () => {
  it("drops empty filters instead of sending blank values", () => {
    expect(transactionParams({ type: "", search: "   ", category_id: 0, page: 1 })).toEqual({});
  });

  it("passes through the filters that are set", () => {
    expect(
      transactionParams({
        ingredient_id: 7,
        category_id: 2,
        type: "in",
        search: " pork ",
        from: "2026-08-19",
        to: "2026-09-01",
        page: 3,
        limit: 50,
      }),
    ).toEqual({
      ingredient_id: "7",
      category_id: "2",
      type: "in",
      search: "pork",
      from: "2026-08-19",
      to: "2026-09-01",
      page: "3",
      limit: "50",
    });
  });
});

describe("filenameFromDisposition", () => {
  it("reads the name the server picked", () => {
    expect(
      filenameFromDisposition('attachment; filename="inventory-history-2026-08-19_2026-09-01.csv"', "x.csv"),
    ).toBe("inventory-history-2026-08-19_2026-09-01.csv");
  });

  // CORS can hide the header entirely; the download still needs a name.
  it("falls back when the header is missing", () => {
    expect(filenameFromDisposition(undefined, "inventory-history.csv")).toBe("inventory-history.csv");
  });
});

describe("normalizeApiMediaUrls", () => {
  // The response interceptor rebuilds JSON bodies to rewrite media URLs. A Blob is
  // an object too, and rebuilding it would hand the user a 0-byte CSV.
  it("leaves a Blob response untouched", () => {
    const blob = new Blob(["a,b\r\n1,2\r\n"], { type: "text/csv" });
    const result = normalizeApiMediaUrls(blob, "http://localhost:8080");
    expect(result).toBe(blob);
    expect(result.size).toBe(blob.size);
  });

  it("still rewrites media fields on a JSON body", () => {
    const payload = { items: [{ image_url: "/uploads/a.png" }] };
    const result = normalizeApiMediaUrls(payload, "http://localhost:8080");
    expect(result.items[0].image_url).toContain("http://localhost:8080");
  });
});

function ingredient(fields: Partial<Ingredient>): Ingredient {
  return {
    ID: 1,
    restaurant_id: 1,
    name: "หมูสับ",
    unit: "กรัม",
    stock: 0,
    min_stock: 0,
    cost_per_unit: 0,
    ...fields,
  };
}

describe("getStockPercent", () => {
  // The old version divided by min_stock, so an item that merely reached its
  // reorder line already showed a full bar — the same picture as one sitting at
  // ten times the minimum. The bar now answers "how long does this last?".
  it("no longer pins at 100% the moment stock reaches the minimum", () => {
    const atMinimum = ingredient({ stock: 3000, min_stock: 3000, days_left: 2 });
    expect(getStockPercent(atMinimum)).toBe(Math.round((2 / FULL_COVER_DAYS) * 100));
  });

  it("caps at 100% once a week of cover is reached", () => {
    expect(getStockPercent(ingredient({ stock: 9000, days_left: 7 }))).toBe(100);
    expect(getStockPercent(ingredient({ stock: 90000, days_left: 400 }))).toBe(100);
  });

  // An ingredient nobody cooks with has no rate to divide by. A percentage
  // there would be invented, and an empty bar would read as "about to run out".
  it("returns null when there is no usage history", () => {
    expect(getStockPercent(ingredient({ stock: 5000 }))).toBeNull();
  });

  // Empty is empty regardless of history — that one needs no forecast.
  it("reports an empty shelf as 0 even without usage data", () => {
    expect(getStockPercent(ingredient({ stock: 0 }))).toBe(0);
  });
});

describe("formatDaysLeft", () => {
  it("collapses anything past a week into the capped label", () => {
    expect(formatDaysLeft(ingredient({ days_left: 400 }), "th")).toBe("พอใช้ 7 วัน+");
    expect(formatDaysLeft(ingredient({ days_left: 400 }), "en")).toBe("7+ days left");
  });

  it("keeps one decimal for a short runway", () => {
    expect(formatDaysLeft(ingredient({ days_left: 2.34 }), "th")).toBe("พอใช้ 2.3 วัน");
  });

  it("says nothing when there is no usage history", () => {
    expect(formatDaysLeft(ingredient({ stock: 100 }), "th")).toBeNull();
  });
});
