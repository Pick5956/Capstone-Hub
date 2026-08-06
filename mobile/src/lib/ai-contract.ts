import type {
  AIActionConfirmationRequest,
  AIAskRequest,
  AIConversationMessage,
} from '@/src/types/ai';

const validConversationIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

export function buildAIAskRequest(
  question: string,
  history: AIConversationMessage[] = [],
  conversationId?: string | null,
): AIAskRequest {
  const request: AIAskRequest = { question, history };
  const normalizedConversationId = conversationId?.trim();
  if (normalizedConversationId) request.conversation_id = normalizedConversationId;
  return request;
}

export function selectAIConversationId(
  current: string | null,
  incoming?: string | null,
): string | null {
  const normalized = incoming?.trim();
  return normalized && validConversationIdPattern.test(normalized)
    ? normalized
    : current;
}

export function buildAIConversationDeletePath(conversationId: string): string {
  return `/api/v1/ai/operations/conversations/${encodeURIComponent(conversationId)}`;
}

export function buildAIActionConfirmationPath(previewId: string): string {
  return `/api/v1/ai/operations/actions/${encodeURIComponent(previewId)}/confirm`;
}

export function buildAIActionCancellationPath(previewId: string): string {
  return `/api/v1/ai/operations/actions/${encodeURIComponent(previewId)}`;
}

export function canClearAIConversation(state: {
  loading?: boolean;
  actionConfirming?: boolean;
  actionCancelling?: boolean;
  clearingConversation?: boolean;
}): boolean {
  return !state.loading
    && !state.actionConfirming
    && !state.actionCancelling
    && !state.clearingConversation;
}

export function buildAIActionConfirmationRequest(
  confirmationToken: string,
): AIActionConfirmationRequest {
  return { confirmation_token: confirmationToken };
}
