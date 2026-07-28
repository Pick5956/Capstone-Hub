import { describe, expect, it } from "vitest";
import { invitationEmailMismatch } from "../invitation";

describe("invitation email preview", () => {
  it("does not compare a masked public email literally", () => {
    expect(invitationEmailMismatch("i***@e***.test", "invitee@example.test")).toBe(false);
  });

  it("still detects a mismatch when an authorized response contains the full email", () => {
    expect(invitationEmailMismatch("invitee@example.test", "other@example.test")).toBe(true);
    expect(invitationEmailMismatch("invitee@example.test", "INVITEE@example.test")).toBe(false);
  });
});
