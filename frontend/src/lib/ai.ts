import { apiClient } from "./apiClient";
import type { AIOutage } from "../components/shared/AIOutageNotice";
import type {
  AIActionConfirmation,
  AIAskRequest,
  AIAskResponse,
  AIActionPlanConfirmation,
  AIConversationMessage,
  AIInsight,
  AIReceiptDraft,
  AISnapshot,
} from "../types/ai";

// The assistant reports an outage rather than answering from the database
// behind the owner's back, so the two states it can report have to survive the
// trip through axios: a spent daily quota, which clears on its own and says
// when, and an unreachable provider, which does not.
export function readAIOutage(err: unknown): AIOutage | null {
  if (typeof err !== "object" || err === null || !("response" in err)) return null;
  const response = (err as {
    response?: { data?: { error?: string; code?: string; retry_after_seconds?: number } };
  }).response;
  const code = response?.data?.code;
  if (code !== "ai_quota_exceeded" && code !== "ai_provider_unavailable") return null;

  const seconds = response?.data?.retry_after_seconds;
  return {
    kind: code === "ai_quota_exceeded" ? "quota" : "provider",
    message: response?.data?.error?.trim() || "",
    retryAfterSeconds: typeof seconds === "number" && seconds > 0 ? seconds : undefined,
  };
}

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

export const confirmAIActionPlan = (planId: string, confirmationToken: string) =>
  apiClient.post<AIActionPlanConfirmation>(
    `/api/v1/ai/operations/plans/${encodeURIComponent(planId)}/confirm`,
    { confirmation_token: confirmationToken },
  );

export const cancelAIActionPlan = (planId: string) =>
  apiClient.delete<void>(`/api/v1/ai/operations/plans/${encodeURIComponent(planId)}`);

export const getOperationsSnapshot = () =>
  apiClient.get<AISnapshot>("/api/v1/ai/operations/snapshot");

export const getProactiveInsights = () =>
  apiClient.get<{ insights: AIInsight[] }>("/api/v1/ai/operations/insights");

export type AISettingsView = {
  actions_enabled: boolean;
  feature_available: boolean;
};

export const getAISettings = () =>
  apiClient.get<AISettingsView>("/api/v1/ai/operations/settings");

export const updateAISettings = (actionsEnabled: boolean) =>
  apiClient.put<AISettingsView>("/api/v1/ai/operations/settings", { actions_enabled: actionsEnabled });

export const extractReceipt = (imageBase64: string, mimeType: string) =>
  apiClient.post<{ draft: AIReceiptDraft }>(
    "/api/v1/ai/operations/receipt",
    { image: imageBase64, mime_type: mimeType },
    // vision reads take longer than chat, and a stuck key rotates on the server;
    // cap the wait so the UI fails gracefully instead of hanging forever.
    { timeout: 70000 },
  );
