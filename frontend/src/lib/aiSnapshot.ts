import type { AISnapshot } from "@/src/types/ai";

export function selectOperationsSnapshot(
  current: AISnapshot | null,
  incoming: AISnapshot | null | undefined,
): AISnapshot | null {
  if (!incoming?.generated_at?.trim()) return current;

  const incomingTime = Date.parse(incoming.generated_at);
  if (!Number.isFinite(incomingTime)) return current;

  const currentTime = current?.generated_at ? Date.parse(current.generated_at) : Number.NaN;
  if (Number.isFinite(currentTime) && incomingTime < currentTime) return current;
  return incoming;
}
