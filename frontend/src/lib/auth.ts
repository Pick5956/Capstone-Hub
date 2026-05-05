import { apiClient } from "./apiClient";
import { User } from "../types/auth";
import { Membership } from "../types/restaurant";

export interface LoginResponse {
  token: string;
  user: User;
  memberships: Membership[];
}

export const getCurrentUser = () =>
  apiClient.get("/api/v1/users/profile").catch(() => null);

export const updateProfile = (data: Pick<User, "first_name" | "last_name" | "nickname" | "phone">) =>
  apiClient.patch<User>("/api/v1/users/profile", data);

export const uploadProfileImage = (file: File) => {
  const formData = new FormData();
  formData.append("image", file);
  return apiClient.post<User>("/api/v1/users/profile/upload-image", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

export const login = (email: string, password: string) =>
  apiClient.post<LoginResponse>("/api/login", { email, password }).catch(() => null);

export const googleLogin = (idToken: string) =>
  apiClient.post<LoginResponse>("/api/google-login", { id_token: idToken }).catch(() => null);

export const register = (data: Omit<User, "ID"> & { password: string }) =>
  apiClient.post("/api/register", data).catch(() => null);

export const requestPasswordReset = (email: string) =>
  apiClient.post("/api/forgot-password", { email });

export const resetPassword = (token: string, password: string) =>
  apiClient.post("/api/reset-password", { token, password }).catch(() => null);

export const getRoles = () =>
  apiClient.get("/api/roles").catch(() => null);
