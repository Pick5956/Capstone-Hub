"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
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

const toneStyles: Record<ToastTone, { icon: typeof CheckCircle2; className: string; iconClassName: string }> = {
  success: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
    iconClassName: "text-emerald-600 dark:text-emerald-300",
  },
  error: {
    icon: XCircle,
    className: "border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
    iconClassName: "text-red-600 dark:text-red-300",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
    iconClassName: "text-amber-600 dark:text-amber-300",
  },
  info: {
    icon: Info,
    className: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100",
    iconClassName: "text-sky-600 dark:text-sky-300",
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

        <div className="pointer-events-none fixed right-3 top-3 z-[100] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5 sm:top-5">
          {toasts.map((toast) => {
            const styles = toneStyles[toast.tone];
            const Icon = styles.icon;
            return (
              <div
                key={toast.id}
                className={`pointer-events-auto flex items-start gap-3 rounded-md border px-3 py-3 shadow-lg shadow-gray-950/10 backdrop-blur dark:shadow-black/30 ${styles.className}`}
                role="status"
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${styles.iconClassName}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-5">{toast.title}</p>
                  {toast.message && <p className="mt-0.5 text-[12px] leading-5 opacity-80">{toast.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
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
