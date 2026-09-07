import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The assistant's charts share one visual language. These are source checks:
// they cannot judge the drawing, but they catch the ways it has drifted
// before — a rainbow of bars for one series, colours that only exist in one
// theme, a hint the backend sends that the drawing silently ignores.
const root = join(__dirname, "..", "..", "..");
const chart = readFileSync(join(root, "src/components/shared/AIChart.tsx"), "utf8");
const styles = readFileSync(join(root, "src/app/globals.css"), "utf8");
const types = readFileSync(join(root, "src/types/ai.ts"), "utf8");

describe("assistant chart drawing", () => {
  it("colours one series with one colour and carries emphasis as opacity", () => {
    // The old drawing gave every bar its own colour from BAR_COLORS.
    const assistant = chart.slice(chart.indexOf("export default function AIChart"));
    expect(assistant).not.toContain("BAR_COLORS[i % BAR_COLORS.length]");
    expect(assistant).toContain("fillOpacity={opacityFor(i)}");
    expect(chart).toContain("const FADED");
    expect(chart).toContain("const MUTED");
  });

  it("takes its colours from theme tokens defined for both themes", () => {
    for (const token of ["--ai-cat-1", "--ai-cat-2", "--ai-critical", "--ai-warning", "--ai-chart-grid"]) {
      expect(chart).toContain(`var(${token})`);
      expect(styles.match(new RegExp(`${token}:`, "g"))?.length).toBe(2);
    }
  });

  it("honours every hint the backend can send", () => {
    for (const hint of ["layout", "compare", "stacked", "share", "highlight", "muted", "muted_label", "status", "notes", "reference", "tone", "role"]) {
      expect(types).toContain(`${hint}?:`);
    }
    expect(chart).toContain('layout="vertical"'); // rankings run horizontal
    expect(chart).toContain('stackId="stack"');
    expect(chart).toContain("<ReferenceLine");
    expect(chart).toContain('role !== "tooltip"');
  });

  it("names meaning in a legend or label rather than colour alone", () => {
    expect(chart).toContain("statusLabel(");
    expect(chart).toContain("data.muted_label");
    expect(chart).toContain("legend.push(");
  });
});
