import { apiClient } from "./apiClient";
import type { AIAskRequest, AIAskResponse, AIConversationMessage, AISnapshot } from "../types/ai";

export const askOperationsAI = (
  question: string,
  history: AIConversationMessage[] = [],
  conversationId?: string | null,
) => {
  const request: AIAskRequest = { question, history };
  const normalizedConversationId = conversationId?.trim();
  if (normalizedConversationId) request.conversation_id = normalizedConversationId;
  return apiClient.post<AIAskResponse>("/api/v1/ai/operations/ask", request);
};

export const deleteAIConversation = (conversationId: string) =>
  apiClient.delete<void>(`/api/v1/ai/operations/conversations/${encodeURIComponent(conversationId)}`);

export const getOperationsSnapshot = () =>
  apiClient.get<AISnapshot>("/api/v1/ai/operations/snapshot");
