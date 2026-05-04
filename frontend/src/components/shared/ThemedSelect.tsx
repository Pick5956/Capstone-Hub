"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/src/providers/LanguageProvider";

export type ThemedSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export default function ThemedSelect({
  value,
  onChange,
  options,
  disabled,
  className = "",
  placeholder = "เลือก",
}: {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const fallbackPlaceholder = language === "th" ? "เลือก" : "Select";
  const buttonState = open
    ? "border-gray-300 bg-gray-50 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.04)] dark:border-gray-600 dark:bg-gray-800/60"
    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800/60";

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={`h-10 w-full rounded-md border px-3 pr-9 text-left text-[13px] text-gray-900 outline-none transition-[background-color,border-color,box-shadow,transform,opacity] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 dark:text-white ${buttonState}`}
      >
        <span className={`${selected ? "" : "text-gray-400"} block truncate`}>
          {selected?.label ?? (placeholder || fallbackPlaceholder)}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1.5 max-h-64 min-w-full overflow-auto rounded-md border border-gray-200 bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.14)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)] sm:w-max sm:min-w-[max(100%,14rem)]">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] transition-[background-color,color] disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800 dark:text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/70"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {active && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-orange-500">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
