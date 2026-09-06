import { describe, expect, it } from "vitest";
import { oklchFromRgb, orbPaletteForSurface, parseCssRgb } from "@/src/lib/orbPalette";

describe("orb palette", () => {
  it("reads the colours browsers report", () => {
    expect(parseCssRgb("rgb(249, 115, 22)")).toEqual({ r: 249, g: 115, b: 22, a: 1 });
    expect(parseCssRgb("rgba(0, 0, 0, 0)")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseCssRgb("transparent")).toBeNull();
  });

  it("finds the hue of the rail's orange", () => {
    const { h, c } = oklchFromRgb(249, 115, 22);
    expect(h).toBeGreaterThan(40);
    expect(h).toBeLessThan(70);
    expect(c).toBeGreaterThan(0.15);
  });

  it("keeps the sunset orb on neutral and dark surfaces", () => {
    expect(orbPaletteForSurface({ r: 250, g: 248, b: 242 }).colors).toBeUndefined(); // cream canvas
    expect(orbPaletteForSurface({ r: 255, g: 255, b: 255 }).colors).toBeUndefined();
    expect(orbPaletteForSurface({ r: 17, g: 24, b: 39 }).colors).toBeUndefined(); // gray-900
  });

  it("goes pearl-of-the-same-hue with a ring on a strong colour", () => {
    const orange = orbPaletteForSurface({ r: 249, g: 115, b: 22 });
    expect(orange.ring).toBe(true);
    expect(orange.colors?.c1).toMatch(/^oklch\(86% 0\.12 \d+\)$/);
    const green = orbPaletteForSurface({ r: 16, g: 185, b: 129 });
    expect(green.colors?.c1).not.toEqual(orange.colors?.c1);
  });
});
