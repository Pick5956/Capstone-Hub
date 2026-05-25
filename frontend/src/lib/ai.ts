import { apiClient } from "./apiClient";
import type { AIAskResponse, AIConversationMessage, AISnapshot } from "../types/ai";

export const askOperationsAI = (question: string, history: AIConversationMessage[] = []) =>
  apiClient.post<AIAskResponse>("/api/v1/ai/operations/ask", { question, history });

export const getOperationsSnapshot = () =>
  apiClient.get<AISnapshot>("/api/v1/ai/operations/snapshot");
