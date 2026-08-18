import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();

describe("Dishy wordmark rollout", () => {
  it("ships a transparent, scalable, font-independent canonical SVG", async () => {
    const source = await readFile(
      path.join(frontendRoot, "public", "dishy-wordmark.svg"),
      "utf8",
    );

    expect(source).toContain('viewBox="0 0 520 190"');
    expect(source).toContain("currentColor");
    expect(source).toContain('data-letter="s"');
    expect(source).toContain('data-connector="i-s"');
    expect(source).toContain('data-connector="s-h"');
    expect(source).not.toContain(
      "M189 95C202 80 225 76 235 87C243 97 231 105 214 106",
    );
    expect(source).not.toMatch(/<(?:text|tspan|image|use)\b/i);
    expect(source).not.toMatch(/font-family|@font-face|<rect\b/i);
  });

  it("keeps the shipped PNG derivative pixel-identical to the canonical SVG", async () => {
    const [svg, png] = await Promise.all([
      readFile(path.join(frontendRoot, "public", "dishy-wordmark.svg")),
      readFile(path.join(frontendRoot, "public", "dishy-wordmark.png")),
    ]);
    const [renderedSvg, renderedPng] = await Promise.all([
      sharp(svg).resize(520, 190, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
      sharp(png).ensureAlpha().raw().toBuffer(),
    ]);

    expect(renderedPng.equals(renderedSvg)).toBe(true);
  });

  it("replaces every curated visual Dishy label with the shared wordmark", async () => {
    const lockupFiles = [
      "src/app/page.tsx",
      "src/app/restaurants/page.tsx",
      "src/app/restaurants/restaurantWorkspaceUi.tsx",
      "src/components/auth/AuthModal.tsx",
      "src/components/docs/DocsShell.tsx",
      "src/components/shared/NotFoundUI.tsx",
    ];

    for (const relativePath of lockupFiles) {
      const source = await readFile(path.join(frontendRoot, relativePath), "utf8");

      expect(source, relativePath).toContain("AppWordmark");
      expect(source, relativePath).not.toMatch(/>\s*DISHY\s*</);
      expect(source, relativePath).not.toMatch(/>\s*Dishy(?:\s*\{copy\.docs\})?\s*</);
    }
  });
});
