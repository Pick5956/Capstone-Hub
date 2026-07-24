import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("manual refresh control convention", () => {
  it("does not use circular refresh icons or generic refresh button copy in app pages", () => {
    const violations = appTsxFiles(join(process.cwd(), "src", "app")).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const reasons = [
        /RefreshCw|RefreshCcw/.test(source) ? "circular refresh icon" : "",
        /refresh:\s*["'](?:รีเฟรช|Refresh)["']/.test(source) ? "generic refresh copy" : "",
      ].filter(Boolean);
      return reasons.map((reason) => `${path}: ${reason}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps one menu navigation action on the loaded customer-order screen", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "customer", "t", "[token]", "orders", "page.tsx"),
      "utf8",
    );

    expect(source).not.toContain("orderMore");
    expect(source).not.toContain("fixed inset-x-0 bottom-0");
  });
});
