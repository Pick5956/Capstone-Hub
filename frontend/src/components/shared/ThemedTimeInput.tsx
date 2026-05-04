"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/src/providers/LanguageProvider";

const HOURS = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => index.toString().padStart(2, "0"));
const QUICK_TIMES = ["08:00", "11:00", "17:00", "21:00"];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeTime(value: string) {
  const match = value.match(TIME_PATTERN);
  if (!match) return "00:00";
  return `${match[1]}:${match[2]}`;
}

function formatPreview(value: string) {
  const normalized = normalizeTime(value);
  const [hourText, minuteText] = normalized.split(":");
  const hour = Number.parseInt(hourText, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour.toString().padStart(2, "0")}:${minuteText} ${period}`;
}

function withPeriod(value: string, period: "AM" | "PM") {
  const normalized = normalizeTime(value);
  const [hourText, minuteText] = normalized.split(":");
  const hour = Number.parseInt(hourText, 10);
  const hour12 = hour % 12;
  const nextHour = period === "AM" ? hour12 : hour12 + 12;
  return `${nextHour.toString().padStart(2, "0")}:${minuteText}`;
}

export default function ThemedTimeInput({
  value,
  onChange,
  disabled,
  error,
  help,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  help?: string;
}) {
  const { language } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => normalizeTime(value));

  const copy = language === "th"
    ? {
        label: "เลือกเวลา",
        selected: "เวลาที่เลือก",
        quickTimes: "เวลายอดนิยม",
        hour: "ชั่วโมง",
        minute: "นาที",
        choose: "กดเพื่อเลือกเวลา",
        cancel: "ยกเลิก",
        apply: "ใช้เวลานี้",
      }
    : {
        label: "Time",
        selected: "Selected time",
        quickTimes: "Quick picks",
        hour: "Hour",
        minute: "Minute",
        choose: "Click to choose time",
        cancel: "Cancel",
        apply: "Use this time",
      };

  useEffect(() => {
    setDraft(normalizeTime(value));
  }, [value]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setDraft(normalizeTime(value));
      }
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [value]);

  const [draftHour, draftMinute] = useMemo(() => normalizeTime(draft).split(":"), [draft]);
  const draftPeriod = Number.parseInt(draftHour, 10) >= 12 ? "PM" : "AM";

  const updateDraftHour = (nextHour: string) => setDraft(`${nextHour}:${draftMinute}`);
  const updateDraftMinute = (nextMinute: string) => setDraft(`${draftHour}:${nextMinute}`);
  const updateDraftPeriod = (nextPeriod: "AM" | "PM") => setDraft(withPeriod(draft, nextPeriod));

  const applyDraft = () => {
    const normalized = normalizeTime(draft);
    onChange(normalized);
    setDraft(normalized);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-active-hour='true']")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      rootRef.current
        ?.querySelector<HTMLElement>("[data-active-minute='true']")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftHour, draftMinute, open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={copy.choose}
        onClick={() => {
          setDraft(normalizeTime(value));
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setDraft(normalizeTime(value));
            setOpen(true);
          }
        }}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md border bg-white px-3 py-2.5 text-left text-[13px] outline-none transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 ${
          error
            ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15 dark:border-red-900/60 dark:text-red-200"
            : "border-gray-200 text-gray-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:text-white"
        }`}
      >
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{copy.label}</span>
          <span className="mt-0.5 block font-mono text-[14px] font-semibold tabular-nums">{value || "00:00"}</span>
          <span className="block text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
            {formatPreview(value || "00:00")}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {(error || help) && (
        <p className={`mt-1 text-[11px] ${error ? "text-red-600 dark:text-red-300" : "text-gray-400 dark:text-gray-500"}`}>
          {error || help}
        </p>
      )}

      {open && !disabled && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-full rounded-md border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(normalizeTime(value));
              setOpen(false);
            }
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              applyDraft();
            }
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{copy.selected}</p>
              <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-gray-900 dark:text-white">{draft}</p>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-800">
              {(["AM", "PM"] as const).map((period) => {
                const active = draftPeriod === period;
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => updateDraftPeriod(period)}
                    className={`h-9 rounded-md px-3 text-[11px] font-semibold tabular-nums transition-colors ${
                      active
                        ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white"
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}
                  >
                    {period}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">{copy.quickTimes}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUICK_TIMES.map((time) => {
                const active = normalizeTime(draft) === time;
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setDraft(time)}
                    className={`h-9 rounded-md border px-2 text-[12px] font-medium tabular-nums transition-colors ${
                      active
                        ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="mb-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">{copy.hour}</p>
              <div className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto pr-1">
                {HOURS.map((hour) => {
                  const active = hour === draftHour;
                  return (
                    <button
                      key={hour}
                      type="button"
                      onClick={() => updateDraftHour(hour)}
                      data-active-hour={active ? "true" : undefined}
                      className={`h-9 rounded-md text-[12px] font-medium tabular-nums transition-colors ${
                        active
                          ? "bg-orange-50 text-orange-700 dark:bg-orange-900/25 dark:text-orange-300"
                          : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      }`}
                    >
                      {hour}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">{copy.minute}</p>
              <div className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto pr-1">
                {MINUTES.map((minute) => {
                  const active = minute === draftMinute;
                  return (
                    <button
                      key={minute}
                      type="button"
                      onClick={() => updateDraftMinute(minute)}
                      data-active-minute={active ? "true" : undefined}
                      className={`h-9 rounded-md text-[12px] font-medium tabular-nums transition-colors ${
                        active
                          ? "bg-orange-50 text-orange-700 dark:bg-orange-900/25 dark:text-orange-300"
                          : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      }`}
                    >
                      {minute}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <button
              type="button"
              onClick={() => {
                setDraft(normalizeTime(value));
                setOpen(false);
              }}
              className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={applyDraft}
              className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
            >
              {copy.apply}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
