import axios from "axios";
import { authRepository } from "../app/repositories/authRepository";

export const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const apiClient = axios.create({
    baseURL: apiUrl,
    headers: {
        "Content-Type": "application/json",
    },
});

// Interceptor
apiClient.interceptors.request.use((config) => {
    const token = authRepository.getToken();
    const tokenType = authRepository.getTokenType();

    if (token && tokenType && config.headers) {
        config.headers.Authorization = `${tokenType} ${token}`;
    }

    return config;
});
