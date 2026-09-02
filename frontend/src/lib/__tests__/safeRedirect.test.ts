import { describe, expect, it } from "vitest";

import { safeInternalPath, safeNextPathFromSearch } from "../safeRedirect";

const BASE = "https://dishy.pro/";

describe("safeInternalPath", () => {
  it("returns ordinary internal paths unchanged", () => {
    expect(safeInternalPath("/home", BASE)).toBe("/home");
    expect(safeInternalPath("/pos/tables", BASE)).toBe("/pos/tables");
    expect(safeInternalPath("/orders?date=2026-01-01", BASE)).toBe("/orders?date=2026-01-01");
    expect(safeInternalPath("/reports#summary", BASE)).toBe("/reports#summary");
  });

  it("rejects protocol-relative targets", () => {
    expect(safeInternalPath("//evil.com", BASE)).toBeUndefined();
    expect(safeInternalPath("//evil.com/path", BASE)).toBeUndefined();
  });

  it("rejects backslash variants that the URL parser folds into a host", () => {
    expect(safeInternalPath("/\\/evil.com", BASE)).toBeUndefined();
    expect(safeInternalPath("/\\evil.com", BASE)).toBeUndefined();
    expect(safeInternalPath("\\\\evil.com", BASE)).toBeUndefined();
  });

  it("rejects targets hidden behind stripped control characters", () => {
    expect(safeInternalPath("/\t/evil.com", BASE)).toBeUndefined();
    expect(safeInternalPath("/\n/evil.com", BASE)).toBeUndefined();
  });

  it("rejects absolute and non-path values", () => {
    expect(safeInternalPath("https://evil.com", BASE)).toBeUndefined();
    expect(safeInternalPath("javascript:alert(1)", BASE)).toBeUndefined();
    expect(safeInternalPath("home", BASE)).toBeUndefined();
    expect(safeInternalPath("", BASE)).toBeUndefined();
    expect(safeInternalPath(null, BASE)).toBeUndefined();
    expect(safeInternalPath(undefined, BASE)).toBeUndefined();
  });
});

describe("safeNextPathFromSearch", () => {
  it("reads a valid next parameter", () => {
    expect(safeNextPathFromSearch("?next=%2Fhome", BASE)).toBe("/home");
  });

  it("drops a hostile next parameter", () => {
    expect(safeNextPathFromSearch("?next=%2F%5C%2Fevil.com", BASE)).toBeUndefined();
    expect(safeNextPathFromSearch("?next=%2F%2Fevil.com", BASE)).toBeUndefined();
  });

  it("returns undefined when next is absent", () => {
    expect(safeNextPathFromSearch("?other=1", BASE)).toBeUndefined();
  });
});
