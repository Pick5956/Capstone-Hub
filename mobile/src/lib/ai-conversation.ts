import type {
  AIConversationMessage,
  AISnapshot,
} from '@/src/types/ai';

const MAX_CONVERSATION_MESSAGES = 6;

export function createAIConversationRequestGuard() {
  let generation = 0;

  return {
    beginRequest() {
      generation += 1;
      return generation;
    },
    clearConversation() {
      generation += 1;
    },
    canApplyResponse(request: number) {
      return request === generation;
    },
  };
}

export function recentConversationHistory(
  history: AIConversationMessage[],
): AIConversationMessage[] {
  return history.slice(-MAX_CONVERSATION_MESSAGES);
}

export function appendConversationTurn(
  history: AIConversationMessage[],
  question: string,
  answer: string,
): AIConversationMessage[] {
  return recentConversationHistory([
    ...history,
    { role: 'user', content: question },
    { role: 'assistant', content: answer },
  ]);
}

export function selectOperationsSnapshot(
  current: AISnapshot | null,
  incoming: AISnapshot | null | undefined,
): AISnapshot | null {
  if (!incoming?.generated_at?.trim()) {
    return current;
  }
  return incoming;
}
