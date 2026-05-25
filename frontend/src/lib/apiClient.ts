import axios from "axios";
import { authRepository } from "../app/repositories/authRepository";
import { restaurantRepository } from "../app/repositories/restaurantRepository";

const localhostHosts = new Set(["localhost", "127.0.0.1"]);

function resolveApiUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (typeof window === "undefined") {
    return configuredUrl || "http://localhost:8080";
  }

  const currentHost = window.location.hostname;
  const fallbackUrl = `${window.location.protocol}//${currentHost}:8080`;

  if (!configuredUrl) {
    return fallbackUrl;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (localhostHosts.has(parsed.hostname) && !localhostHosts.has(currentHost)) {
      parsed.hostname = currentHost;
      return parsed.toString().replace(/\/$/, "");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return configuredUrl;
  }
}

export const apiUrl = resolveApiUrl();

export const apiClient = axios.create({
  baseURL: apiUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

export const publicApiClient = axios.create({
  baseURL: apiUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Inject Authorization + X-Restaurant-ID on every request.
// X-Restaurant-ID identifies which restaurant the current user is acting in
// (a user can be a member of many restaurants).
apiClient.interceptors.request.use((config) => {
  const token = authRepository.getToken();
  const tokenType = authRepository.getTokenType();
  if (token && tokenType && config.headers) {
    config.headers.Authorization = `${tokenType} ${token}`;
  }

  const activeRestaurantId = restaurantRepository.getActiveId();
  if (activeRestaurantId && config.headers) {
    config.headers["X-Restaurant-ID"] = String(activeRestaurantId);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = String(error?.response?.data?.error ?? "").toLowerCase();
    if ((status === 400 || status === 403) && message.includes("restaurant")) {
      restaurantRepository.clearActiveId();
    }
    return Promise.reject(error);
  }
);
