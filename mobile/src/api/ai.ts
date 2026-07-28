import { apiRequest } from './client';
import type { AIAskResponse, AIConversationMessage, AISnapshot } from '@/src/types/ai';
export const askOperationsAI = (question: string, history: AIConversationMessage[] = []) => apiRequest<AIAskResponse>('/api/v1/ai/operations/ask', { method: 'POST', body: JSON.stringify({ question, history }) });
export const getOperationsSnapshot = () => apiRequest<AISnapshot>('/api/v1/ai/operations/snapshot');
