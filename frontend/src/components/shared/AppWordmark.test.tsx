import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AppWordmark, {
  APP_WORDMARK_ASPECT_RATIO,
  APP_WORDMARK_SRC,
} from "./AppWordmark";

describe("AppWordmark", () => {
  it("renders the canonical recolorable wordmark with one accessible name", () => {
    const markup = renderToStaticMarkup(<AppWordmark height={19} />);

    expect(APP_WORDMARK_SRC).toBe("/dishy-wordmark.svg");
    expect(APP_WORDMARK_ASPECT_RATIO).toBe(520 / 190);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Dishy"');
    expect(markup).toContain("background-color:currentColor");
    expect(markup).toContain("dishy-wordmark.svg");
    expect(markup).toContain("height:19px");
    expect(markup).toContain(`width:${19 * APP_WORDMARK_ASPECT_RATIO}px`);
  });

  it("can be decorative without exposing a competing brand label", () => {
    const markup = renderToStaticMarkup(<AppWordmark decorative />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role="img"');
    expect(markup).not.toContain("aria-label");
  });
});
