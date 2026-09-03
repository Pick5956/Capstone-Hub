import { describe, expect, it } from "vitest";

import {
  COMPOSER_COLLAPSED_MAX_PX,
  COMPOSER_EXPAND_THRESHOLD_PX,
  composerCanExpand,
  composerHeight,
} from "@/src/lib/chatComposer";

// The chat box that grows with what is being typed. The height itself is the
// thing that broke on a phone: the field stayed one line tall, so a long
// question scrolled sideways out of view while it was being written.

describe("composerHeight", () => {
  it("follows the text while it is short", () => {
    expect(composerHeight(36, false, 800)).toBe(36);
    expect(composerHeight(92, false, 800)).toBe(92);
  });

  it("stops growing once collapsed, and scrolls inside instead", () => {
    expect(composerHeight(400, false, 800)).toBe(COMPOSER_COLLAPSED_MAX_PX);
  });

  it("opens taller when expanded, but leaves the conversation visible", () => {
    const height = composerHeight(900, true, 800);
    expect(height).toBeGreaterThan(COMPOSER_COLLAPSED_MAX_PX);
    expect(height).toBeLessThan(800);
  });

  it("never shrinks below the collapsed cap on a short window", () => {
    // A phone in landscape: 55% of the window is less than the collapsed cap,
    // and expanding must not make the field smaller than it already was.
    expect(composerHeight(900, true, 200)).toBe(COMPOSER_COLLAPSED_MAX_PX);
  });

  it("stays at the content height when expanded text is still short", () => {
    expect(composerHeight(120, true, 800)).toBe(120);
  });

  it("treats a missing measurement as no height rather than a negative one", () => {
    expect(composerHeight(0, false, 800)).toBe(0);
    expect(composerHeight(-10, false, 800)).toBe(0);
  });
});

describe("composerCanExpand", () => {
  it("hides the button while every line already fits", () => {
    expect(composerCanExpand(36)).toBe(false);
    expect(composerCanExpand(120)).toBe(false);
    expect(composerCanExpand(COMPOSER_EXPAND_THRESHOLD_PX)).toBe(false);
  });

  it("offers the button exactly when the collapsed field starts hiding text", () => {
    // Tied to the collapsed cap on purpose: offered any earlier, pressing it
    // would leave the box the same size and read as a dead button.
    expect(COMPOSER_EXPAND_THRESHOLD_PX).toBe(COMPOSER_COLLAPSED_MAX_PX);
    expect(composerHeight(200, false, 800)).toBe(COMPOSER_COLLAPSED_MAX_PX);
    expect(composerHeight(200, true, 800)).toBe(200);
  });

  it("offers the button once the text runs past a few lines", () => {
    expect(composerCanExpand(COMPOSER_EXPAND_THRESHOLD_PX + 1)).toBe(true);
    expect(composerCanExpand(300)).toBe(true);
  });
});
