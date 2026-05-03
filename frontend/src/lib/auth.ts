import { apiClient } from "./apiClient";
import { User } from "../types/auth";

export const getCurrentUser = () =>
  apiClient.get("/api/v1/users/profile").catch(() => null);

export const login = (email: string, password: string) =>
  apiClient.post("/api/login", { email, password }).catch(() => null);

export const googleLogin = (idToken: string) =>
  apiClient.post("/api/google-login", { id_token: idToken }).catch(() => null);

export const register = (data: Omit<User, "password">) =>
  apiClient.post("/api/register", data).catch(() => null);

export const getRoles = () =>
  apiClient.get("/api/roles").catch(() => null);
