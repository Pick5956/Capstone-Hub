import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync(
  join(process.cwd(), "src", "app", "page.tsx"),
  "utf8",
);

describe("landing phone mockup", () => {
  it("renders a first-party mockup instead of a third-party phone image", () => {
    expect(landingSource).not.toContain("PHONE_IMAGE_URL");
    expect(landingSource).not.toContain("static.vecteezy.com");
    expect(landingSource).toContain("function PhoneMockup");
  });

  it("exposes the visual preview through an accessible image label", () => {
    expect(landingSource).toContain('role="img"');
    expect(landingSource).toContain("aria-label={label}");
  });
});
