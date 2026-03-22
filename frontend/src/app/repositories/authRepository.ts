import Cookies from "js-cookie";


export const authRepository = {
  getToken() {
    return Cookies.get("token") || null;
  },

  getTokenType() {
    return Cookies.get("token_type") || null;
  },

  setToken(token: string, tokenType: string) {
    Cookies.set("token", token, { expires: 1 })
    Cookies.set("token_type", tokenType, { expires: 1 });
  },

  clearToken() {
    Cookies.remove("token");
    Cookies.remove("token_type");
  }
};
