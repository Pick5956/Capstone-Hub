"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";

export type AIFollowUpItem = { id: string; label: string };

/**
 * Follow-up prompts under an assistant answer.
 *
 * Sits below the bubble, not inside it, as a plain list with a hairline
 * between rows — the way ChatGPT shows its suggestions. The earlier pills
 * inside the bubble read as part of the answer, so people took them for
 * things the assistant had said rather than things they could ask next.
 *
 * The first version of this list was three unstyled rows and read as leftover
 * text: nothing said the rows were the assistant's idea rather than part of its
 * reply, and nothing said they could be tapped. So there is a quiet heading
 * above them, each row lights warm on hover or touch, and the arrow that was
 * hover-only now sits there faintly and brightens — a phone has no hover, and
 * an affordance only mouse users can see is not an affordance.
 *
 * The left spacer is the orb's width so the rows line up with the bubble's
 * text edge; keep it in step with the `SiriOrb size="30px"` beside the bubble.
 */
export default function AIFollowUpList<T extends AIFollowUpItem>({
  items,
  messageId,
  onSelect,
  language = "th",
  className = "",
}: {
  items: T[];
  messageId: string;
  onSelect: (item: T) => void;
  language?: "th" | "en";
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      data-testid="ai-follow-ups"
      className={`flex max-w-full items-start gap-2 sm:max-w-[90%] sm:gap-2.5 ${className}`}
    >
      <div aria-hidden="true" className="w-[30px] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 px-1 pb-0.5 text-[11px] font-medium tracking-wide text-gray-400 dark:text-gray-500">
          <Sparkles aria-hidden="true" className="h-3 w-3 text-orange-400/80" />
          {language === "th" ? "ถามต่อได้เลย" : "Ask next"}
        </p>
        <ul className="divide-y divide-gray-200/70 dark:divide-gray-700/50">
          {items.map((item) => (
            <li key={`${messageId}-${item.id}`}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left text-xs text-gray-600 transition-colors hover:bg-orange-50/70 hover:text-orange-700 active:bg-orange-100/70 dark:text-gray-300 dark:hover:bg-orange-950/25 dark:hover:text-orange-300 sm:text-[13px]"
              >
                <span className="min-w-0 break-words">{item.label}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-orange-500 dark:text-gray-600 dark:group-hover:text-orange-400"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
