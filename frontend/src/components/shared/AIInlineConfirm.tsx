"use client";

import { AlertTriangle } from "lucide-react";

// Reusable inline confirmation that "grows out of" the message card above it.
// Any action that needs a yes/no before it runs should use this so the pattern
// stays consistent: a warning-tinted card that reveals downward, with a primary
// confirm and a quiet cancel. Kept presentational — the caller owns the action.

type Props = {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

export default function AIInlineConfirm({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  disabled = false,
}: Props) {
  return (
    <div
      role="alert"
      className="ai-reveal-down mt-3 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30"
    >
      <div className="flex gap-2.5 px-3.5 py-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">{message}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled}
              className="rounded-full bg-gray-950 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:bg-white dark:text-gray-950"
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="rounded-full border border-amber-300 px-3.5 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/30"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
