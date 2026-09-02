import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthUrl,
  idTokenNonce,
  isGoogleCallbackTrusted,
  parseGoogleCallbackParams,
} from "../googleOAuth";

function fakeIdToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

describe("buildGoogleAuthUrl", () => {
  const url = new URL(
    buildGoogleAuthUrl({
      clientId: "client-123.apps.googleusercontent.com",
      redirectUri: "https://dishy.example/auth/google/callback",
      state: "state-abc",
      nonce: "nonce-xyz",
    })
  );

  it("targets the Google authorization endpoint", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  });

  it("asks for an id_token in the fragment so the backend can verify it as-is", () => {
    expect(url.searchParams.get("response_type")).toBe("id_token");
    expect(url.searchParams.get("response_mode")).toBe("fragment");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });

  it("carries the redirect target, state and nonce", () => {
    expect(url.searchParams.get("redirect_uri")).toBe("https://dishy.example/auth/google/callback");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("nonce")).toBe("nonce-xyz");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });
});

describe("parseGoogleCallbackParams", () => {
  it("reads the credential out of the fragment", () => {
    const params = parseGoogleCallbackParams("#id_token=tok&state=st");
    expect(params).toEqual({ idToken: "tok", state: "st", error: undefined });
  });

  it("still finds an error returned as a query parameter", () => {
    const params = parseGoogleCallbackParams("", "?error=access_denied&state=st");
    expect(params.error).toBe("access_denied");
    expect(params.idToken).toBeUndefined();
  });

  it("returns nothing for an empty callback", () => {
    expect(parseGoogleCallbackParams("", "")).toEqual({
      idToken: undefined,
      state: undefined,
      error: undefined,
    });
  });
});

describe("idTokenNonce", () => {
  it("reads the nonce claim regardless of base64url padding", () => {
    expect(idTokenNonce(fakeIdToken({ nonce: "nonce-xyz", sub: "1" }))).toBe("nonce-xyz");
    expect(idTokenNonce(fakeIdToken({ nonce: "n", sub: "12" }))).toBe("n");
  });

  it("returns undefined for a malformed token", () => {
    expect(idTokenNonce("not-a-token")).toBeUndefined();
    expect(idTokenNonce("header.!!!.signature")).toBeUndefined();
    expect(idTokenNonce(fakeIdToken({ sub: "1" }))).toBeUndefined();
  });
});

describe("isGoogleCallbackTrusted", () => {
  const pending = { state: "state-abc", nonce: "nonce-xyz" };
  const idToken = fakeIdToken({ nonce: "nonce-xyz" });

  it("accepts a callback that matches the request it answers", () => {
    expect(isGoogleCallbackTrusted({ idToken, state: "state-abc" }, pending)).toBe(true);
  });

  it("rejects a mismatched state", () => {
    expect(isGoogleCallbackTrusted({ idToken, state: "other" }, pending)).toBe(false);
  });

  it("rejects a token minted for a different nonce", () => {
    const replayed = fakeIdToken({ nonce: "someone-elses-nonce" });
    expect(isGoogleCallbackTrusted({ idToken: replayed, state: "state-abc" }, pending)).toBe(false);
  });

  it("rejects an error callback and an unrequested one", () => {
    expect(isGoogleCallbackTrusted({ error: "access_denied", state: "state-abc" }, pending)).toBe(false);
    expect(isGoogleCallbackTrusted({ idToken, state: "state-abc" }, null)).toBe(false);
  });
});
