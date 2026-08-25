"use client";

import { useEffect, useState } from "react";
import { CloudOff, Hourglass, RotateCw } from "lucide-react";

export type AIOutageKind = "quota" | "provider";

export type AIOutage = {
  kind: AIOutageKind;
  message: string;
  retryAfterSeconds?: number;
};

type AIOutageNoticeProps = {
  language: "th" | "en";
  outage: AIOutage;
  onRetry: () => void;
  retrying?: boolean;
};

// formatWait counts down in the units a person reads at a glance: seconds when
// the wait is nearly over, minutes while it matters, hours when it is far off.
const formatWait = (seconds: number, language: "th" | "en") => {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return language === "th"
      ? `${hours} ชั่วโมง ${minutes} นาที`
      : `${hours}h ${minutes}m`;
  }
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return language === "th"
      ? `${minutes} นาที ${String(rest).padStart(2, "0")} วินาที`
      : `${minutes}m ${String(rest).padStart(2, "0")}s`;
  }
  return language === "th" ? `${seconds} วินาที` : `${seconds}s`;
};

export default function AIOutageNotice({
  language,
  outage,
  onRetry,
  retrying = false,
}: AIOutageNoticeProps) {
  const [remaining, setRemaining] = useState(outage.retryAfterSeconds ?? 0);

  // A fresh outage restarts the clock; without this the countdown from a previous
  // failure would keep running against the new one.
  useEffect(() => {
    setRemaining(outage.retryAfterSeconds ?? 0);
  }, [outage.retryAfterSeconds, outage.message]);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const quota = outage.kind === "quota";
  const waiting = remaining > 0;

  const copy =
    language === "th"
      ? {
          quotaTitle: "โควตา AI ของวันนี้หมดแล้ว",
          providerTitle: "เชื่อมต่อผู้ช่วย AI ไม่ได้",
          countdown: "ใช้ได้อีกครั้งใน",
          retry: "ลองอีกครั้ง",
          retrying: "กำลังลองใหม่",
          // The owner should know the rest of the app is unaffected.
          footnote: "ข้อมูลยอดขาย สต็อก และรายงานทั้งหมดยังใช้งานได้ตามปกติครับ",
        }
      : {
          quotaTitle: "Today's AI quota is used up",
          providerTitle: "Can't reach the AI assistant",
          countdown: "Available again in",
          retry: "Try again",
          retrying: "Retrying",
          footnote: "Sales, stock and every report still work as usual.",
        };

  const tone = quota
    ? {
        frame:
          "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        title: "text-amber-900 dark:text-amber-200",
        body: "text-amber-800/90 dark:text-amber-200/80",
      }
    : {
        frame: "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40",
        badge: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        title: "text-gray-900 dark:text-gray-100",
        body: "text-gray-600 dark:text-gray-400",
      };

  return (
    <section
      role="status"
      aria-live="polite"
      className={`rounded-md border p-4 sm:p-5 ${tone.frame}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-md ${tone.badge}`}
        >
          {quota ? (
            <Hourglass className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CloudOff className="h-4 w-4" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className={`text-sm font-semibold ${tone.title}`}>
            {quota ? copy.quotaTitle : copy.providerTitle}
          </h2>
          <p className={`mt-1 text-sm leading-6 ${tone.body}`}>{outage.message}</p>

          {waiting && (
            <p className={`mt-2 text-sm font-medium tabular-nums ${tone.title}`}>
              {copy.countdown} {formatWait(remaining, language)}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              disabled={waiting || retrying}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                quota
                  ? "border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/30"
                  : "border-gray-300 text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              }`}
            >
              <RotateCw
                className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {retrying ? copy.retrying : copy.retry}
            </button>
            <span className={`text-xs ${tone.body}`}>{copy.footnote}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
