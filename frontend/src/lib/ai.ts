import { apiClient } from "./apiClient";
import type { AIAskResponse } from "../types/ai";

export const askOperationsAI = (question: string) =>
  apiClient.post<AIAskResponse>("/api/v1/ai/operations/ask", { question });
