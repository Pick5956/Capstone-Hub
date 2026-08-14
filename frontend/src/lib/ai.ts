import { apiClient } from "./apiClient";
import type {
  AIActionConfirmation,
  AIAskRequest,
  AIAskResponse,
  AIConversationMessage,
  AIInsight,
  AIReceiptDraft,
  AISnapshot,
} from "../types/ai";

export function normalizeAIAnswer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const answer = value.trim();
  return answer || null;
}

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

export const confirmAIAction = (previewId: string, confirmationToken: string) =>
  apiClient.post<AIActionConfirmation>(
    `/api/v1/ai/operations/actions/${encodeURIComponent(previewId)}/confirm`,
    { confirmation_token: confirmationToken },
  );

export const cancelAIAction = (previewId: string) =>
  apiClient.delete<void>(`/api/v1/ai/operations/actions/${encodeURIComponent(previewId)}`);

export const getOperationsSnapshot = () =>
  apiClient.get<AISnapshot>("/api/v1/ai/operations/snapshot");

export const getProactiveInsights = () =>
  apiClient.get<{ insights: AIInsight[] }>("/api/v1/ai/operations/insights");

export const extractReceipt = (imageBase64: string, mimeType: string) =>
  apiClient.post<{ draft: AIReceiptDraft }>(
    "/api/v1/ai/operations/receipt",
    { image: imageBase64, mime_type: mimeType },
    // vision reads take longer than chat, and a stuck key rotates on the server;
    // cap the wait so the UI fails gracefully instead of hanging forever.
    { timeout: 70000 },
  );
