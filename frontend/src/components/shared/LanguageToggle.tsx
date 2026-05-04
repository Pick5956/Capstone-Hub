"use client";

import { useLanguage } from "@/src/providers/LanguageProvider";

export default function LanguageToggle({
  className = "",
}: {
  className?: string;
}) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={`inline-flex items-center rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-800 dark:bg-gray-950 ${className}`}>
      {([
        { value: "th", label: "TH" },
        { value: "en", label: "EN" },
      ] as const).map((option) => {
        const active = language === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLanguage(option.value)}
            className={`h-8 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
              active
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
