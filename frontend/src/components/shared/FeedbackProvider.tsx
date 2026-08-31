"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";

type ToastTone = "success" | "error" | "warning" | "info";
type ConfirmTone = "default" | "danger" | "warning";

type ToastInput = {
  title: string;
  message?: string;
  tone?: ToastTone;
  duration?: number;
};

type Toast = ToastInput & {
  id: number;
  tone: ToastTone;
};

type ConfirmInput = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmState = ConfirmInput & {
  resolve: (confirmed: boolean) => void;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
  dismissToast: (id: number) => void;
};

type ConfirmContextValue = {
  confirm: (input: ConfirmInput) => Promise<boolean>;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Every tone shares one neutral surface and differs only in its accent bar and
// icon tile - the same vocabulary the table cards use (a white card, a w-1.5
// status bar, a soft tinted pill). The old table flooded the whole panel with
// the hue, which made the toast the only surface in the product that did that,
// and left `success` as a near-black card with no relation to green at all.
const TOAST_SURFACE =
  "border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-white";

const toneStyles: Record<ToastTone, { icon: LucideIcon; accentClassName: string; iconWrapClassName: string }> = {
  success: {
    icon: CheckCircle2,
    accentClassName: "bg-emerald-500",
    iconWrapClassName: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  error: {
    icon: XCircle,
    accentClassName: "bg-red-500",
    iconWrapClassName: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  },
  warning: {
    icon: AlertTriangle,
    accentClassName: "bg-amber-500",
    iconWrapClassName: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  },
  info: {
    icon: Info,
    accentClassName: "bg-sky-500",
    iconWrapClassName: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  },
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmClosing, setConfirmClosing] = useState(false);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const confirmStateRef = useRef<ConfirmState | null>(null);
  const confirmClosingRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = Date.now() + Math.round(Math.random() * 1000);
      const nextToast: Toast = { ...toast, id, tone: toast.tone ?? "success" };
      setToasts((current) => [...current, nextToast].slice(-4));
      window.setTimeout(() => dismissToast(id), toast.duration ?? 3600);
    },
    [dismissToast],
  );

  const confirm = useCallback((input: ConfirmInput) => {
    return new Promise<boolean>((resolve) => {
      setConfirmClosing(false);
      confirmClosingRef.current = false;
      setConfirmState({ ...input, resolve });
    });
  }, []);

  const toastValue = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);
  const confirmValue = useMemo(() => ({ confirm }), [confirm]);

  useEffect(() => {
    confirmStateRef.current = confirmState;
    confirmClosingRef.current = confirmClosing;
  }, [confirmClosing, confirmState]);

  const closeConfirm = useCallback((confirmed: boolean) => {
    const currentConfirm = confirmStateRef.current;
    if (!currentConfirm || confirmClosingRef.current) return;
    confirmClosingRef.current = true;
    setConfirmClosing(true);
    window.setTimeout(() => {
      currentConfirm.resolve(confirmed);
      setConfirmState(null);
      setConfirmClosing(false);
      confirmClosingRef.current = false;
    }, 180);
  }, []);

  useEffect(() => {
    if (!confirmState) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const target = confirmDialogRef.current?.querySelector<HTMLElement>("[data-confirm-autofocus]");
      target?.focus();
    });

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirm(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(confirmDialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [closeConfirm, confirmState]);

  const confirmTone = confirmState?.tone ?? "default";
  const confirmButtonClass = confirmTone === "danger"
    ? "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-white dark:hover:bg-red-400"
    : confirmTone === "warning"
      ? "bg-amber-500 text-amber-950 hover:bg-amber-400"
      : "bg-gray-900 text-white hover:bg-gray-800 dark:bg-orange-400 dark:text-orange-950 dark:hover:bg-orange-300";
  const confirmBackdrop = useBackdropClose(() => closeConfirm(false));

  return (
    <ToastContext.Provider value={toastValue}>
      <ConfirmContext.Provider value={confirmValue}>
        {children}

        <div className="pointer-events-none fixed left-1/2 top-16 z-[var(--z-toast)] flex w-[calc(100dvw-1.5rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:top-5">
          {toasts.map((toast) => {
            const styles = toneStyles[toast.tone];
            const Icon = styles.icon;
            const urgent = toast.tone === "error" || toast.tone === "warning";
            return (
              <div
                key={toast.id}
                className={`animate-slide-down pointer-events-auto relative flex min-h-14 items-center gap-3 overflow-hidden rounded-xl border py-3 pl-4 pr-2 shadow-[0_2px_6px_rgba(15,23,42,0.08),0_16px_48px_rgba(15,23,42,0.20)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.35),0_16px_48px_rgba(0,0,0,0.55)] ${TOAST_SURFACE}`}
                role={urgent ? "alert" : "status"}
                aria-live={urgent ? "assertive" : "polite"}
                aria-atomic="true"
              >
                <span className={`absolute bottom-0 left-0 top-0 w-1.5 ${styles.accentClassName}`} aria-hidden="true" />
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${styles.iconWrapClassName}`} aria-hidden="true">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-5">{toast.title}</p>
                  {toast.message && <p className="mt-0.5 text-[12px] leading-5 text-gray-500 dark:text-gray-400">{toast.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 dark:text-gray-500 dark:hover:bg-gray-900 dark:hover:text-gray-300"
                  aria-label={language === "th" ? "ปิดแจ้งเตือน" : "Dismiss notification"}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>

        {confirmState && (
          <div
            {...confirmBackdrop}
            className={`${confirmClosing ? "motion-overlay-exit" : "motion-overlay"} fixed left-0 top-0 z-[var(--z-modal)] h-dvh w-dvw max-w-full bg-gray-950/55`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-confirm-title"
            aria-describedby={confirmState.message ? "global-confirm-message" : undefined}
          >
            <div className="absolute inset-3 m-auto h-fit w-[calc(100dvw-1.5rem)] max-w-md">
              <div
                ref={confirmDialogRef}
                tabIndex={-1}
                className={`${confirmClosing ? "motion-dialog-exit" : "motion-dialog"} w-full rounded-md border border-gray-200 bg-white p-4 shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${confirmTone === "danger" ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300" : confirmTone === "warning" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" : "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"}`}>
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 id="global-confirm-title" className="text-[15px] font-semibold text-gray-950 dark:text-white">
                      {confirmState.title}
                    </h2>
                    {confirmState.message && <p id="global-confirm-message" className="mt-1 text-[13px] leading-6 text-gray-600 dark:text-gray-400">{confirmState.message}</p>}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => closeConfirm(false)}
                    data-confirm-autofocus
                    className="h-10 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                  >
                    {confirmState.cancelLabel ?? (language === "th" ? "ยกเลิก" : "Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeConfirm(true)}
                    className={`h-10 rounded-md px-3 text-[13px] font-semibold transition-colors ${confirmButtonClass}`}
                  >
                    {confirmState.confirmLabel ?? (language === "th" ? "ยืนยัน" : "Confirm")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within FeedbackProvider");
  return context;
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within FeedbackProvider");
  return context.confirm;
}
