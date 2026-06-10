"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { useLanguage } from "@/src/providers/LanguageProvider";

const HOURS = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => index.toString().padStart(2, "0"));
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HIDDEN_SCROLLBAR =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const PICKER_WIDTH = 178;
const PICKER_HEIGHT = 184;

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
  const buttonId = useId();
  const pickerId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [draft, setDraft] = useState(() => normalizeTime(value));

  const copy = language === "th"
    ? {
        label: "เลือกเวลา",
        hour: "ชั่วโมง",
        minute: "นาที",
        choose: "กดเพื่อเลือกเวลา",
      }
    : {
        label: "Time",
        hour: "Hour",
        minute: "Minute",
        choose: "Click to choose time",
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

  const commitDraft = (nextHour: string, nextMinute: string) => {
    const normalized = normalizeTime(`${nextHour}:${nextMinute}`);
    setDraft(normalized);
    onChange(normalized);
  };

  const openPicker = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - PICKER_WIDTH - 8));
      const opensAbove = window.innerHeight - rect.bottom < PICKER_HEIGHT + 12 && rect.top > PICKER_HEIGHT + 12;
      const rawTop = opensAbove ? rect.top - PICKER_HEIGHT - 8 : rect.bottom + 8;
      const top = Math.min(Math.max(8, rawTop), Math.max(8, window.innerHeight - PICKER_HEIGHT - 8));
      setPosition({ left, top });
    }
    setDraft(normalizeTime(value));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-active-hour='true']")
        ?.scrollIntoView({ block: "center", inline: "nearest" });
      rootRef.current
        ?.querySelector<HTMLElement>("[data-active-minute='true']")
        ?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftHour, draftMinute, open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={buttonId}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? pickerId : undefined}
        aria-label={copy.choose}
        aria-describedby={error || help ? descriptionId : undefined}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          openPicker();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
          if (event.key === "Escape") {
            setOpen(false);
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
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </button>

      {(error || help) && (
        <p id={descriptionId} className={`mt-1 text-[11px] ${error ? "text-red-600 dark:text-red-300" : "text-gray-400 dark:text-gray-500"}`}>
          {error || help}
        </p>
      )}

      {open && !disabled && (
        <div
          id={pickerId}
          role="dialog"
          aria-labelledby={buttonId}
          aria-label={copy.choose}
          className="fixed z-[var(--z-dropdown)] w-max rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ left: position.left, top: position.top }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          <div className="flex items-center gap-2">
            <div
              role="listbox"
              aria-label={copy.hour}
              aria-activedescendant={`${pickerId}-hour-${draftHour}`}
              className={`h-40 w-16 snap-y overflow-y-auto rounded-md bg-orange-50 p-1 ${HIDDEN_SCROLLBAR} dark:bg-orange-500/15`}
            >
              {HOURS.map((hour) => {
                const active = hour === draftHour;
                return (
                  <button
                    key={hour}
                    id={`${pickerId}-hour-${hour}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`${copy.hour} ${hour}`}
                    onClick={() => commitDraft(hour, draftMinute)}
                    data-active-hour={active ? "true" : undefined}
                    className={`mb-1 flex h-11 w-full snap-center items-center justify-center rounded-md font-mono text-[18px] font-semibold leading-none tabular-nums transition-colors last:mb-0 ${
                      active
                        ? "bg-orange-500 text-white shadow-sm dark:bg-orange-500 dark:text-white"
                        : "text-gray-500 hover:bg-white/70 dark:text-gray-400 dark:hover:bg-gray-800"
                    }`}
                  >
                    {hour}
                  </button>
                );
              })}
            </div>

            <span className="font-mono text-[22px] font-semibold leading-none text-gray-700 dark:text-gray-200">:</span>

            <div
              role="listbox"
              aria-label={copy.minute}
              aria-activedescendant={`${pickerId}-minute-${draftMinute}`}
              className={`h-40 w-16 snap-y overflow-y-auto rounded-md bg-gray-100 p-1 ${HIDDEN_SCROLLBAR} dark:bg-gray-800`}
            >
              {MINUTES.map((minute) => {
                const active = minute === draftMinute;
                return (
                  <button
                    key={minute}
                    id={`${pickerId}-minute-${minute}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`${copy.minute} ${minute}`}
                    onClick={() => commitDraft(draftHour, minute)}
                    data-active-minute={active ? "true" : undefined}
                    className={`mb-1 flex h-11 w-full snap-center items-center justify-center rounded-md font-mono text-[18px] font-semibold leading-none tabular-nums transition-colors last:mb-0 ${
                      active
                        ? "bg-gray-700 text-white shadow-sm dark:bg-gray-100 dark:text-gray-900"
                        : "text-gray-500 hover:bg-white/70 dark:text-gray-400 dark:hover:bg-gray-700"
                    }`}
                  >
                    {minute}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
