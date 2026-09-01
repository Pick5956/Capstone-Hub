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
