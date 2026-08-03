import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);

describe("expenses page integration guards", () => {
  it("ignores stale list responses after the month or category changes", () => {
    expect(pageSource).toContain("const requestGeneration = expenseRequests.begin();");
    expect(pageSource.match(/expenseRequests\.isCurrent\(requestGeneration\)/g)).toHaveLength(3);
  });

  it("never renders ledger data from a previously active restaurant", () => {
    expect(pageSource).toContain("const restaurantId = activeMembership?.restaurant_id ?? null;");
    expect(pageSource).toContain(
      "const scopedData = canView && data.restaurantId === restaurantId ? data : EMPTY_EXPENSE_DATA;",
    );
    expect(pageSource).toContain("restaurantId: requestedRestaurantId,");
    expect(pageSource).toContain(
      "}, [canView, categoryFilter, copy.loadError, expenseRequests, monthEnd, monthStart, restaurantId]);",
    );
  });

  it("drops edit-form and mutation UI state when the active restaurant changes", () => {
    expect(pageSource).toContain(
      "const form = storedForm.restaurantId === restaurantId ? storedForm : emptyForm(restaurantId);",
    );
    expect(pageSource).toContain("const saving = restaurantId !== null && savingRestaurantId === restaurantId;");
    expect(pageSource).toContain("setForm({ restaurantId, id: expense.ID,");
  });

  it("gives the icon-only ledger actions meaningful accessible names", () => {
    expect(pageSource).toContain('aria-label={`${copy.edit}: ${expense.note || copy.categories[expense.category]}`}');
    expect(pageSource).toContain('aria-label={`${copy.deleteAction}: ${expense.note || copy.categories[expense.category]}`}');
  });
});
