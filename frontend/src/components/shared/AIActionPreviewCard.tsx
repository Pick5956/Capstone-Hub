"use client";

import { AlertTriangle, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { describeAIActionPreview } from "@/src/lib/aiActionPreview";
import type { AIActionPreview } from "@/src/types/ai";

type Props = {
  preview: AIActionPreview;
  language: "th" | "en";
  confirming?: boolean;
  cancelling?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function availabilityLabel(isAvailable: boolean, language: "th" | "en") {
  if (language === "th") return isAvailable ? "เปิดขาย" : "ปิดขาย";
  return isAvailable ? "Available" : "Unavailable";
}

function formatExpiry(value: string, language: "th" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AIActionPreviewCard({
  preview,
  language,
  confirming = false,
  cancelling = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const copy = language === "th"
    ? {
        title: "ตรวจสอบก่อนให้ AI ดำเนินการ",
        description: "ระบบยังไม่ได้เปลี่ยนข้อมูล กรุณาตรวจสอบรายละเอียดแล้วกดยืนยัน",
        menu: "เมนู",
        before: "สถานะปัจจุบัน",
        after: "สถานะหลังยืนยัน",
        expires: "ยืนยันได้ถึง",
        warnings: "ข้อควรทราบ",
        confirm: "ยืนยันการเปลี่ยนแปลง",
        confirming: "กำลังยืนยัน...",
        cancel: "ยกเลิก",
        cancelling: "กำลังยกเลิก...",
      }
    : {
        title: "Review before AI takes action",
        description: "Nothing has changed yet. Review the details, then confirm to continue.",
        menu: "Menu item",
        before: "Current status",
        after: "Status after confirmation",
        expires: "Confirm before",
        warnings: "Important",
        confirm: "Confirm change",
        confirming: "Confirming...",
        cancel: "Cancel",
        cancelling: "Cancelling...",
      };
  const presentation = describeAIActionPreview(preview, language);
  const busy = confirming || cancelling;

  return (
    <section
      aria-label={copy.title}
      className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">{copy.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">{copy.description}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900/70 dark:bg-gray-950/70">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{copy.menu}</p>
        <p className="mt-0.5 break-words font-semibold text-gray-950 dark:text-white">{preview.target.name}</p>
        <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{presentation.summary}</p>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="rounded-md bg-gray-100 px-3 py-2 dark:bg-gray-900">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.before}</p>
            <p className="mt-0.5 font-semibold text-gray-800 dark:text-gray-100">
              {availabilityLabel(preview.current.is_available, language)}
            </p>
          </div>
          <span aria-hidden="true" className="text-amber-600 dark:text-amber-300">→</span>
          <div className="rounded-md bg-amber-100 px-3 py-2 dark:bg-amber-900/50">
            <p className="text-[11px] text-amber-700 dark:text-amber-300">{copy.after}</p>
            <p className="mt-0.5 font-semibold">
              {availabilityLabel(preview.requested.is_available, language)}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-amber-800 dark:text-amber-200/80">
        {copy.expires}: {formatExpiry(preview.expires_at, language)}
      </p>

      {presentation.warnings.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-100/80 p-2.5 dark:bg-amber-900/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold">{copy.warnings}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
              {presentation.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-800"
        >
          {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          {confirming ? copy.confirming : copy.confirm}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 px-3 py-2 text-xs font-semibold transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:hover:bg-amber-900/40"
        >
          {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
          {cancelling ? copy.cancelling : copy.cancel}
        </button>
      </div>
    </section>
  );
}
