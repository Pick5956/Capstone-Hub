import { describe, expect, it } from "vitest";
import { normalizeApiMediaUrls, resolveBackendMediaUrl } from "@/src/lib/mediaUrl";

const publicApiUrl = "https://api.dishy.pro";

describe("resolveBackendMediaUrl", () => {
  it("moves localhost uploads to the current API origin", () => {
    expect(resolveBackendMediaUrl("http://localhost:8080/uploads/restaurants/1/logo.png", publicApiUrl)).toBe(
      "https://api.dishy.pro/uploads/restaurants/1/logo.png"
    );
  });

  it("moves private-network uploads while preserving query and hash", () => {
    expect(resolveBackendMediaUrl("http://192.168.1.8:8080/uploads/menu/item.webp?v=2#preview", publicApiUrl)).toBe(
      "https://api.dishy.pro/uploads/menu/item.webp?v=2#preview"
    );
  });

  it("resolves relative backend upload paths", () => {
    expect(resolveBackendMediaUrl("/uploads/users/2/avatar.jpg", publicApiUrl)).toBe(
      "https://api.dishy.pro/uploads/users/2/avatar.jpg"
    );
  });

  it("leaves external media URLs unchanged", () => {
    const external = "https://images.example.com/uploads/menu/item.jpg";
    expect(resolveBackendMediaUrl(external, publicApiUrl)).toBe(external);
  });
});

describe("normalizeApiMediaUrls", () => {
  it("normalizes known media fields throughout an API response", () => {
    const payload = {
      memberships: [
        {
          restaurant: {
            logo: "http://127.0.0.1:8080/uploads/restaurants/1/logo.png",
            cover_image: "/uploads/restaurants/1/cover.jpg",
            name: "Test restaurant",
          },
        },
      ],
      note: "http://localhost:8080/uploads/should-not-change.png",
    };

    expect(normalizeApiMediaUrls(payload, publicApiUrl)).toEqual({
      memberships: [
        {
          restaurant: {
            logo: "https://api.dishy.pro/uploads/restaurants/1/logo.png",
            cover_image: "https://api.dishy.pro/uploads/restaurants/1/cover.jpg",
            name: "Test restaurant",
          },
        },
      ],
      note: "http://localhost:8080/uploads/should-not-change.png",
    });
  });
});
