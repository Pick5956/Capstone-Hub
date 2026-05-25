"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/src/providers/LanguageProvider";

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

const toneStyles: Record<ToastTone, { icon: LucideIcon; className: string; accentClassName: string; iconWrapClassName: string; iconClassName: string }> = {
  success: {
    icon: CheckCircle2,
    className: "border-gray-900 bg-gray-950 text-white shadow-gray-950/25 dark:border-white/10 dark:bg-white dark:text-gray-950 dark:shadow-black/40",
    accentClassName: "bg-emerald-500 dark:bg-emerald-500",
    iconWrapClassName: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white",
    iconClassName: "text-white",
  },
  error: {
    icon: XCircle,
    className: "border-red-600 bg-red-600 text-white shadow-red-950/25 dark:border-red-500 dark:bg-red-500 dark:text-white dark:shadow-black/40",
    accentClassName: "bg-white/70",
    iconWrapClassName: "bg-white/15 text-white",
    iconClassName: "text-white",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-400 bg-amber-400 text-gray-950 shadow-amber-950/20 dark:border-amber-300 dark:bg-amber-300 dark:text-gray-950 dark:shadow-black/40",
    accentClassName: "bg-gray-950/75",
    iconWrapClassName: "bg-gray-950 text-amber-300",
    iconClassName: "text-amber-300",
  },
  info: {
    icon: Info,
    className: "border-sky-600 bg-sky-600 text-white shadow-sky-950/25 dark:border-sky-500 dark:bg-sky-500 dark:text-white dark:shadow-black/40",
    accentClassName: "bg-white/70",
    iconWrapClassName: "bg-white/15 text-white",
    iconClassName: "text-white",
  },
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmClosing, setConfirmClosing] = useState(false);

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
      setConfirmState({ ...input, resolve });
    });
  }, []);

  const toastValue = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);
  const confirmValue = useMemo(() => ({ confirm }), [confirm]);

  const closeConfirm = (confirmed: boolean) => {
    if (!confirmState || confirmClosing) return;
    setConfirmClosing(true);
    window.setTimeout(() => {
      confirmState.resolve(confirmed);
      setConfirmState(null);
      setConfirmClosing(false);
    }, 180);
  };

  const confirmTone = confirmState?.tone ?? "default";
  const confirmButtonClass = confirmTone === "danger"
    ? "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-white dark:hover:bg-red-400"
    : confirmTone === "warning"
      ? "bg-amber-500 text-gray-950 hover:bg-amber-400"
      : "bg-gray-900 text-white hover:bg-gray-800 dark:bg-orange-400 dark:text-gray-950 dark:hover:bg-orange-300";

  return (
    <ToastContext.Provider value={toastValue}>
      <ConfirmContext.Provider value={confirmValue}>
        {children}

        <div className="pointer-events-none fixed left-1/2 top-16 z-[100] flex w-[calc(100dvw-1.5rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:top-5">
          {toasts.map((toast) => {
            const styles = toneStyles[toast.tone];
            const Icon = styles.icon;
            return (
              <div
                key={toast.id}
                className={`animate-slide-down pointer-events-auto relative flex min-h-14 items-center gap-3 overflow-hidden rounded-md border py-3 pl-4 pr-2 shadow-2xl backdrop-blur ${styles.className}`}
                role="status"
              >
                <span className={`absolute bottom-0 left-0 top-0 w-1 ${styles.accentClassName}`} aria-hidden="true" />
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${styles.iconWrapClassName}`} aria-hidden="true">
                  <Icon className={`h-5 w-5 ${styles.iconClassName}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-5">{toast.title}</p>
                  {toast.message && <p className="mt-0.5 text-[12px] leading-5 opacity-85">{toast.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-75 transition-colors hover:bg-white/15 hover:opacity-100 dark:hover:bg-black/10"
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
            className={`${confirmClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-[110] flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-confirm-title"
            onClick={() => closeConfirm(false)}
          >
            <div
              className={`${confirmClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-md rounded-md border border-gray-200 bg-white p-4 shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${confirmTone === "danger" ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300" : confirmTone === "warning" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" : "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"}`}>
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="global-confirm-title" className="text-[15px] font-semibold text-gray-950 dark:text-white">
                    {confirmState.title}
                  </h2>
                  {confirmState.message && <p className="mt-1 text-[13px] leading-6 text-gray-600 dark:text-gray-400">{confirmState.message}</p>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => closeConfirm(false)}
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
