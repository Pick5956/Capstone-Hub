"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A single-row, capsule-shaped confirmation bar embedded in the assistant chat.
// It replaces the tall "review before the AI acts" card for low/medium-risk
// writes (one row, reversible — e.g. opening or closing a menu). Nothing is
// written until the owner confirms; the bar owns the pending → done | cancelled |
// expired state machine and shows the outcome in place.
//
// The countdown ring glows and moves in the app's warm colour, echoing the Orb;
// the success/danger colours are fixed (#34C759 / #FF3B30) as specified.

export type InlineDbConfirmState = "pending" | "confirming" | "done" | "cancelled" | "expired";

// One line of a multi-item plan ("กะเพรา · 500 → 2,500 กรัม" plus anything the
// system will do on its own).
export type InlineDbConfirmItem = {
  title: string;
  change: string;
  unit?: string;
  sideEffects?: string[];
};

export type InlineDbConfirmBarProps = {
  /** Single-change mode (a menu opening or closing). */
  itemName?: string;
  fromLabel?: string;
  toLabel?: string;
  /** Plan mode: N changes confirmed together. Takes precedence when set. */
  items?: InlineDbConfirmItem[];
  /** Plan mode headline, e.g. "ปรับสต๊อก 2 รายการ". */
  summary?: string;
  /** Items the assistant could not take, shown so a batch never loses part of
   * what was asked without saying so. */
  warnings?: string[];
  detail: string;
  expiresAt: Date | string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onUndo?: () => void;
  onReissue?: () => void;
  /** Fired once when the bar settles into any terminal state (done/cancelled/
   * expired), so the host can stop treating the preview as pending. */
  onResolved?: () => void;
  language?: "th" | "en";
};

// 2πr with r = 18.
export const RING_CIRCUMFERENCE = 113;

const GREEN = "#34C759";
const GREEN_ICON = "#2ba84a";
const GREEN_TEXT = "#1f8b3d";
const GREEN_BORDER = "#9fe5b3";
const DANGER = "#FF3B30";
const DANGER_TEXT = "#c72c22";
const DANGER_BORDER = "#ffb3ad";
const ACCENT = "#f97316"; // orange-500 — the warm ring, glowing like the Orb
const ACCENT_URGENT = "#d97706"; // amber-600 — the last seconds, pulsing faster
// Below this many milliseconds left, the ring switches to the urgent look.
export const URGENT_MS = 15_000;
const ACCENT_DEEP = "#c2410c"; // orange-700 — highlighted "to" cell / confirm button

function labels(language: "th" | "en") {
  return language === "en"
    ? {
        confirm: "Confirm",
        cancel: "Cancel",
        undo: "Undo",
        reissue: "Ask again",
        cancelIn: (t: string) => `confirm within ${t}`,
        done: "Saved · takes effect now",
        cancelled: "Cancelled · nothing changed",
        expired: "Command expired · nothing changed",
        aria: "Confirm the assistant's data change",
        confirmError: "Could not confirm — try again",
      }
    : {
        confirm: "ยืนยัน",
        cancel: "ยกเลิก",
        undo: "เลิกทำ",
        reissue: "ขอคำสั่งใหม่",
        cancelIn: (t: string) => `กดยืนยันภายใน ${t}`,
        done: "บันทึกลงระบบแล้ว · มีผลทันที",
        cancelled: "ยกเลิกแล้ว · ไม่มีการแก้ข้อมูล",
        expired: "คำสั่งหมดอายุ · ไม่มีการแก้ข้อมูล",
        aria: "ยืนยันการแก้ข้อมูลของผู้ช่วย AI",
        confirmError: "ยืนยันไม่สำเร็จ ลองอีกครั้ง",
      };
}

// --- Pure helpers (unit-tested) ---------------------------------------------

export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// 0 = a full ring (full time / terminal), RING_CIRCUMFERENCE = empty.
export function ringDashoffset(state: InlineDbConfirmState, remainingMs: number, totalMs: number): number {
  if (state !== "pending") return 0;
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  return (1 - fraction) * RING_CIRCUMFERENCE;
}

export function canConfirm(state: InlineDbConfirmState): boolean {
  return state === "pending";
}

export function isTerminal(state: InlineDbConfirmState): boolean {
  return state === "done" || state === "cancelled" || state === "expired";
}

type BarView = {
  ringColor: string;
  glow: boolean;
  urgent: boolean;
  borderColor: string;
  highlight: "from" | "to";
  highlightColor: string;
  statusText: string;
  statusTone: string;
  icon: "none" | "spinner" | "check" | "x";
  buttons: "confirm" | "undo" | "reissue";
};

export function barView(
  state: InlineDbConfirmState,
  opts: { detail: string; remainingMs: number; language: "th" | "en"; error?: string },
): BarView {
  const t = labels(opts.language);
  switch (state) {
    case "done":
      return {
        ringColor: GREEN, glow: false, urgent: false, borderColor: GREEN_BORDER,
        highlight: "to", highlightColor: GREEN,
        statusText: t.done, statusTone: GREEN_TEXT, icon: "check", buttons: "undo",
      };
    case "cancelled":
      return {
        ringColor: DANGER, glow: false, urgent: false, borderColor: DANGER_BORDER,
        highlight: "from", highlightColor: "#64748b",
        statusText: t.cancelled, statusTone: DANGER_TEXT, icon: "x", buttons: "reissue",
      };
    case "expired":
      return {
        ringColor: DANGER, glow: false, urgent: false, borderColor: DANGER_BORDER,
        highlight: "from", highlightColor: "#64748b",
        statusText: t.expired, statusTone: DANGER_TEXT, icon: "x", buttons: "reissue",
      };
    default: { // pending | confirming
      const urgent = state === "pending" && opts.remainingMs <= URGENT_MS;
      return {
        ringColor: urgent ? ACCENT_URGENT : ACCENT,
        glow: state === "pending",
        urgent,
        borderColor: urgent ? "rgba(217,119,6,0.55)" : "rgba(249,115,22,0.35)",
        highlight: "to", highlightColor: ACCENT_DEEP,
        statusText: opts.error ? opts.error : `${opts.detail} · ${t.cancelIn(formatCountdown(opts.remainingMs))}`,
        statusTone: opts.error ? "#dc2626" : "var(--idcb-muted)",
        icon: state === "confirming" ? "spinner" : "none",
        buttons: "confirm",
      };
    }
  }
}

// --- Component --------------------------------------------------------------

export default function InlineDbConfirmBar({
  itemName, fromLabel, toLabel, items, summary, warnings, detail, expiresAt,
  onConfirm, onCancel, onUndo, onReissue, onResolved, language = "th",
}: InlineDbConfirmBarProps) {
  const planItems = items ?? [];
  const isPlan = planItems.length > 0;
  const t = labels(language);
  const expiryMs = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();

  const totalRef = useRef<number | null>(null);
  if (totalRef.current === null) totalRef.current = Math.max(1000, expiryMs - Date.now());

  const [state, setState] = useState<InlineDbConfirmState>("pending");
  const [remaining, setRemaining] = useState<number>(() => Math.max(0, expiryMs - Date.now()));
  const [error, setError] = useState("");

  // Real-clock countdown; ticks only while pending and stops the moment the bar
  // leaves the pending state.
  useEffect(() => {
    if (state !== "pending") return;
    const tick = () => {
      const rem = Math.max(0, expiryMs - Date.now());
      setRemaining(rem);
      if (rem <= 0) setState("expired");
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state, expiryMs]);

  const resolvedFiredRef = useRef(false);
  useEffect(() => {
    if (isTerminal(state) && !resolvedFiredRef.current) {
      resolvedFiredRef.current = true;
      onResolved?.();
    }
  }, [state, onResolved]);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm(state)) return; // guards double-clicks
    setState("confirming");
    setError("");
    try {
      await onConfirm();
      setState("done");
    } catch {
      setError(t.confirmError);
      setState("pending");
    }
  }, [state, onConfirm, t.confirmError]);

  const handleCancel = useCallback(() => {
    if (state !== "pending") return;
    onCancel();
    setState("cancelled");
  }, [state, onCancel]);

  const view = barView(state, { detail, remainingMs: remaining, language, error });
  const dashoffset = ringDashoffset(state, remaining, totalRef.current ?? 1);
  const secondsLeft = Math.max(0, Math.ceil(remaining / 1000));

  return (
    <div
      role="group"
      aria-label={t.aria}
      className="idcb mt-2 flex flex-wrap items-center gap-3 rounded-3xl border bg-white px-3 py-2.5 dark:bg-gray-950"
      style={{ borderColor: view.borderColor, ["--idcb-muted" as string]: "#64748b" }}
    >
      <style>{`
        @keyframes idcb-glow { 0%,100%{ filter: drop-shadow(0 0 2.5px rgba(249,115,22,.5)); } 50%{ filter: drop-shadow(0 0 7px rgba(249,115,22,.9)); } }
        @keyframes idcb-glow-urgent { 0%,100%{ filter: drop-shadow(0 0 3px rgba(217,119,6,.7)); } 50%{ filter: drop-shadow(0 0 9px rgba(217,119,6,1)); } }
        @keyframes idcb-spin { to { transform: rotate(360deg); } }
        /* The seconds swap with a small lift instead of a hard cut. */
        @keyframes idcb-tick { 0% { opacity: 0; transform: translateY(3px) scale(.9); } 100% { opacity: 1; transform: none; } }
        /* Check / cross draw themselves in, then the ring gives one soft pulse. */
        @keyframes idcb-draw { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
        @keyframes idcb-pop { 0% { transform: scale(.55); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes idcb-settle { 0% { transform: scale(1); } 45% { transform: scale(1.07); } 100% { transform: scale(1); } }
        .idcb-glow { animation: idcb-glow 2.2s ease-in-out infinite; }
        .idcb-glow-urgent { animation: idcb-glow-urgent .9s ease-in-out infinite; }
        .idcb-spin { animation: idcb-spin .8s linear infinite; transform-origin: center; }
        /* 1s ticks: ease the sweep over most of a second so the ring reads as
           continuous motion rather than a stepping hand. */
        .idcb-progress { transition: stroke-dashoffset .9s cubic-bezier(.35,.85,.4,1), stroke .35s ease; }
        .idcb-progress-settle { transition: stroke-dashoffset .5s cubic-bezier(.2,.9,.3,1), stroke .35s ease; animation: idcb-settle .5s ease-out; transform-origin: 20px 20px; }
        .idcb-tick { animation: idcb-tick .3s cubic-bezier(.2,.9,.3,1); }
        .idcb-mark { animation: idcb-pop .34s cubic-bezier(.2,.9,.3,1); transform-origin: center; }
        .idcb-mark path { stroke-dasharray: 40; animation: idcb-draw .38s cubic-bezier(.4,.9,.4,1) forwards; }
        .idcb-focus:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .idcb-glow, .idcb-glow-urgent { animation: none; filter: drop-shadow(0 0 4px rgba(249,115,22,.7)); }
          .idcb-spin { animation-duration: 1.6s; }
          .idcb-progress, .idcb-progress-settle { transition: none; animation: none; }
          .idcb-tick, .idcb-mark, .idcb-mark path { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>

      {/* Countdown ring */}
      <span className="relative grid h-10 w-10 shrink-0 place-items-center" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="20" cy="20" r="18" fill="none" stroke="#e5e7eb" strokeWidth="4" className="dark:opacity-30" />
          <circle
            cx="20" cy="20" r="18" fill="none" stroke={view.ringColor} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={dashoffset}
            className={`${isTerminal(state) ? "idcb-progress-settle" : "idcb-progress"}${view.glow ? (view.urgent ? " idcb-glow-urgent" : " idcb-glow") : ""}`}
          />
        </svg>
        <span className="absolute grid place-items-center">
          {view.icon === "none" && (
            // Seconds left, in the middle of the ring — the part of the countdown
            // the eye can actually read second to second.
            <span
              key={secondsLeft}
              className="idcb-tick text-[12px] font-semibold tabular-nums"
              style={{ color: view.ringColor }}
            >
              {secondsLeft}
            </span>
          )}
          {view.icon === "check" && (
            <svg className="idcb-mark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GREEN_ICON} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          )}
          {view.icon === "x" && (
            <svg className="idcb-mark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={DANGER} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          )}
          {view.icon === "spinner" && (
            <svg className="idcb-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
          )}
        </span>
      </span>

      {/* Centre block */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isPlan ? (
          <>
            <span className="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">
              {summary || itemName}
            </span>
            <ul className="mt-0.5 space-y-0.5">
              {planItems.slice(0, 3).map((planItem, index) => (
                <li key={index} className="text-[13px] text-gray-600 dark:text-gray-300">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{planItem.title}</span>
                  {" · "}
                  <span className="tabular-nums">{planItem.change}</span>
                  {planItem.unit ? ` ${planItem.unit}` : ""}
                  {(planItem.sideEffects ?? []).map((effect, effectIndex) => (
                    <span key={effectIndex} className="ml-1.5 text-[12px] text-amber-700 dark:text-amber-400">
                      · {effect}
                    </span>
                  ))}
                </li>
              ))}
              {planItems.length > 3 && (
                <li className="text-[12px] text-gray-400">+ อีก {planItems.length - 3} รายการ</li>
              )}
            </ul>
            {(warnings ?? []).length > 0 && (
              <span className="mt-0.5 text-[12px] text-red-600 dark:text-red-400">
                ทำให้ไม่ได้: {(warnings ?? []).join(" · ")}
              </span>
            )}
          </>
        ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">{itemName}</span>
          <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 p-0.5 dark:bg-gray-800">
            {(["from", "to"] as const).map((cell) => {
              const on = view.highlight === cell;
              return (
                <span
                  key={cell}
                  className="rounded-full px-[11px] py-[3px] text-[12.5px] font-semibold transition-[background-color,color] duration-200"
                  style={on
                    ? { backgroundColor: view.highlightColor, color: "#ffffff" }
                    : { color: "#94a3b8" }}
                >
                  {cell === "from" ? fromLabel : toLabel}
                </span>
              );
            })}
          </span>
        </div>
        )}
        <span role="status" aria-live="polite" className="text-[13px]" style={{ color: view.statusTone }}>
          {view.statusText}
        </span>
      </div>

      {/* Actions — full-width row under the text on a phone (the plan text wraps
          tall there), back inline on the right from sm up. */}
      <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:ml-auto sm:w-auto">
        {view.buttons === "confirm" && (
          <>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={state === "confirming"}
              className="idcb-focus inline-flex min-h-[36px] items-center rounded-full px-4 text-[14.5px] font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: ACCENT_DEEP }}
            >
              {t.confirm}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={state === "confirming"}
              className="idcb-focus inline-flex min-h-[36px] items-center rounded-full px-3 text-[14px] font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t.cancel}
            </button>
          </>
        )}
        {view.buttons === "undo" && onUndo && (
          <button type="button" onClick={onUndo} className="idcb-focus inline-flex min-h-[36px] items-center rounded-full px-3 text-[13.5px] font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-400">
            {t.undo}
          </button>
        )}
        {view.buttons === "reissue" && onReissue && (
          <button type="button" onClick={onReissue} className="idcb-focus inline-flex min-h-[36px] items-center rounded-full px-3 text-[13.5px] font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-400">
            {t.reissue}
          </button>
        )}
      </div>
    </div>
  );
}
