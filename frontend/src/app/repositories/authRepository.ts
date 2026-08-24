import Cookies from "js-cookie";

// The access token is stored client-side so the axios interceptor can attach it
// as a Bearer header. Hardening (DISHY-02): mark the cookie `secure` on HTTPS so
// it never rides a plaintext request, and set `sameSite=lax` explicitly. The
// token is not sent to the API as a cookie, so Lax is safe for routing and does
// not weaken the Authorization-header flow.
function cookieOptions(): Cookies.CookieAttributes {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  return { expires: 1, sameSite: "lax", secure };
}

export const authRepository = {
  getToken() {
    return Cookies.get("token") || null;
  },

  getTokenType() {
    return Cookies.get("token_type") || null;
  },

  setToken(token: string, tokenType: string) {
    const options = cookieOptions();
    Cookies.set("token", token, options);
    Cookies.set("token_type", tokenType, options);
  },

  clearToken() {
    Cookies.remove("token");
    Cookies.remove("token_type");
  },
};
