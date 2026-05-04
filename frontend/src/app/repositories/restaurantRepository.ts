import Cookies from "js-cookie";

const ACTIVE_KEY = "active_restaurant_id";

// Stores which restaurant the current session is acting in.
// Cookie so it travels with API requests and middleware can read it later.
export const restaurantRepository = {
  getActiveId(): number | null {
    const raw = Cookies.get(ACTIVE_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  },

  setActiveId(id: number) {
    Cookies.set(ACTIVE_KEY, String(id), { expires: 1 });
  },

  clearActiveId() {
    Cookies.remove(ACTIVE_KEY);
  },
};
