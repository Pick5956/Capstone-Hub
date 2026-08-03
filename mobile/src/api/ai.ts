import { apiRequest } from './client';
import {
  buildAIActionCancellationPath,
  buildAIActionConfirmationPath,
  buildAIActionConfirmationRequest,
  buildAIAskRequest,
  buildAIConversationDeletePath,
} from '@/src/lib/ai-contract';
import type {
  AIActionConfirmation,
  AIAskResponse,
  AIConversationMessage,
  AISnapshot,
} from '@/src/types/ai';

export const askOperationsAI = (
  question: string,
  history: AIConversationMessage[] = [],
  conversationId?: string | null,
) => apiRequest<AIAskResponse>('/api/v1/ai/operations/ask', {
  method: 'POST',
  body: JSON.stringify(buildAIAskRequest(question, history, conversationId)),
});

export const deleteAIConversation = (conversationId: string) => apiRequest<void>(
  buildAIConversationDeletePath(conversationId),
  { method: 'DELETE' },
);

export const confirmAIAction = (previewId: string, confirmationToken: string) => (
  apiRequest<AIActionConfirmation>(buildAIActionConfirmationPath(previewId), {
    method: 'POST',
    body: JSON.stringify(buildAIActionConfirmationRequest(confirmationToken)),
  })
);

export const cancelAIAction = (previewId: string) => apiRequest<void>(
  buildAIActionCancellationPath(previewId),
  { method: 'DELETE' },
);

export const getOperationsSnapshot = () => apiRequest<AISnapshot>('/api/v1/ai/operations/snapshot');
