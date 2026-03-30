import { apiClient } from "./apiClient";
import { User } from "../types/auth";

export const getCurrentUser = () =>
  apiClient.get("/api/v1/users/profile").catch(() => null);

export const login = (sut_id: string, password: string) =>
  apiClient.post("/api/login", { sut_id, password }).catch(() => null);

export const register = (data: Omit<User, "password">) =>
  apiClient.post("/api/register", data).catch(() => null);

export const getRoles = () =>
  apiClient.get("/api/roles").catch(() => null);