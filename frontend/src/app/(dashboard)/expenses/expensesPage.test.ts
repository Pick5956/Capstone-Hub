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

  it("gives the icon-only ledger actions meaningful accessible names", () => {
    expect(pageSource).toContain('aria-label={`${copy.edit}: ${expense.note || copy.categories[expense.category]}`}');
    expect(pageSource).toContain('aria-label={`${copy.deleteAction}: ${expense.note || copy.categories[expense.category]}`}');
  });
});
