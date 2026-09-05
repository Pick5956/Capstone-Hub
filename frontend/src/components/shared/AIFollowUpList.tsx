"use client";

import { ArrowUpRight } from "lucide-react";

export type AIFollowUpItem = { id: string; label: string };

/**
 * Follow-up prompts under an assistant answer.
 *
 * Sits below the bubble, not inside it, as a plain list with a hairline
 * between rows — the way ChatGPT shows its suggestions. The earlier pills
 * inside the bubble read as part of the answer, so people took them for
 * things the assistant had said rather than things they could ask next.
 *
 * The left spacer is the orb's width so the rows line up with the bubble's
 * text edge; keep it in step with the `SiriOrb size="30px"` beside the bubble.
 */
export default function AIFollowUpList<T extends AIFollowUpItem>({
  items,
  messageId,
  onSelect,
  className = "",
}: {
  items: T[];
  messageId: string;
  onSelect: (item: T) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      data-testid="ai-follow-ups"
      className={`flex max-w-full items-start gap-2 sm:max-w-[90%] sm:gap-2.5 ${className}`}
    >
      <div aria-hidden="true" className="w-[30px] shrink-0" />
      <ul className="min-w-0 flex-1 divide-y divide-gray-200/80 dark:divide-gray-700/60">
        {items.map((item) => (
          <li key={`${messageId}-${item.id}`}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="group flex min-h-9 w-full items-center justify-between gap-3 px-1 py-2 text-left text-xs text-gray-700 transition-colors hover:text-orange-700 dark:text-gray-300 dark:hover:text-orange-300 sm:text-[13px]"
            >
              <span className="min-w-0 break-words">{item.label}</span>
              <ArrowUpRight
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
