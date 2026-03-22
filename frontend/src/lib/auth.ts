import { User } from "../types/auth";
import { apiClient } from "./apiClient";

export async function getCurrentUser(){
    return await apiClient
        .get("/api/v1/users/profile")
        .then(res => res)
        .catch(() => null);
}

export async function login(sut_id: string, password: string) {
    return await apiClient
        .post("/api/login", { sut_id, password })
        .then(res => res)
        .catch(() => null);
}

export async function register(data: User) {
    return await apiClient
        .post("/api/register", data)
        .then(res => res)
        .catch(() => null);
}

export async function getRoles() {
    return await apiClient
        .get("/api/roles")
        .then(res => res)
        .catch(() => null);
}