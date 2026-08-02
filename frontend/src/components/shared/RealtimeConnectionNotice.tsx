"use client";

import { WifiOff } from "lucide-react";

import type { RealtimeConnectionStatus } from "../../lib/orderEvents";

export default function RealtimeConnectionNotice({
  language,
  status,
  className = "",
}: {
  language: "th" | "en";
  status: RealtimeConnectionStatus;
  className?: string;
}) {
  if (status !== "reconnecting") return null;

  const message = language === "th"
    ? "กำลังเชื่อมต่อข้อมูลสดใหม่ ข้อมูลจะยังอัปเดตสำรองอัตโนมัติ"
    : "Reconnecting live updates. Backup refresh remains active.";

  return (
    <div
      role="status"
      aria-live="polite"
      data-realtime-status="reconnecting"
      className={`flex w-fit max-w-full items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 ${className}`}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
