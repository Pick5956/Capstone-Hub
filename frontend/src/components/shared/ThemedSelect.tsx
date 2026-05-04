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
        className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 pr-9 text-left text-[13px] text-gray-900 outline-none transition-colors hover:border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:border-gray-600"
      >
        <span className={`${selected ? "" : "text-gray-400"} block truncate`}>
          {selected?.label ?? (placeholder || fallbackPlaceholder)}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
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
                className={`flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "bg-orange-50 font-semibold text-orange-700 dark:bg-orange-900/25 dark:text-orange-300"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {active && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
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
