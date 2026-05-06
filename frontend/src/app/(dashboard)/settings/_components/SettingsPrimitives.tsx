"use client";

import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import ThemedTimeInput from "@/src/components/shared/ThemedTimeInput";

export function SettingsShell({
  eyebrow,
  title,
  subtitle,
  backHref = "/settings",
  backLabel,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex min-h-16 w-full max-w-screen-2xl items-center justify-between gap-3 px-3 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {backLabel ? (
                <Link href={backHref} className="ui-press shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
                  {backLabel}
                </Link>
              ) : null}
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{eyebrow}</p>
            </div>
            <h1 className="mt-1 truncate text-[18px] font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h1>
            <p className="mt-0.5 line-clamp-2 max-w-2xl text-[12px] leading-5 text-gray-500 dark:text-gray-400">{subtitle}</p>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>

      <main className="mx-auto w-full max-w-screen-2xl px-3 py-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export function SettingsPanel({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{hint}</p> : null}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  help,
  type = "text",
  disabled,
  inputMode,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  help?: string;
  type?: string;
  disabled?: boolean;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {type === "time" ? (
        <ThemedTimeInput value={value} onChange={(nextValue) => onChange?.(nextValue)} disabled={disabled} error={error} help={help} />
      ) : (
        <>
          <input
            type={type}
            value={value}
            placeholder={placeholder}
            inputMode={inputMode}
            disabled={disabled}
            readOnly={!onChange}
            onChange={(event) => onChange?.(event.target.value)}
            className={`h-11 w-full min-w-0 rounded-md border bg-white px-3 text-[14px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-white sm:h-10 sm:text-[13px] ${
              error
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/15 dark:border-red-900/60"
                : "border-gray-200 focus:border-orange-500 focus:ring-orange-500/15 dark:border-gray-700"
            }`}
          />
          {(error || help) && (
            <p className={`mt-1 text-[11px] leading-5 ${error ? "text-red-600 dark:text-red-300" : "text-gray-500 dark:text-gray-400"}`}>
              {error || help}
            </p>
          )}
        </>
      )}
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  error,
  help,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  help?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <textarea
        value={value}
        rows={4}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={!onChange}
        onChange={(event) => onChange?.(event.target.value)}
        className={`w-full min-w-0 rounded-md border bg-white px-3 py-2 text-[14px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-white sm:text-[13px] ${
          error
            ? "border-red-300 focus:border-red-500 focus:ring-red-500/15 dark:border-red-900/60"
            : "border-gray-200 focus:border-orange-500 focus:ring-orange-500/15 dark:border-gray-700"
        }`}
      />
      {(error || help) && (
        <p className={`mt-1 text-[11px] leading-5 ${error ? "text-red-600 dark:text-red-300" : "text-gray-500 dark:text-gray-400"}`}>
          {error || help}
        </p>
      )}
    </label>
  );
}

export function StatusMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <div
      aria-live="polite"
      className={`rounded-md border px-3 py-2 text-[12px] ${
        error
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
      }`}
    >
      {error || message}
    </div>
  );
}
