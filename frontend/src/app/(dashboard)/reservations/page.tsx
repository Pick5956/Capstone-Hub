"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { listReservations, type Reservation, type ReservationStatus } from "@/src/lib/reservation";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";
import { Skeleton } from "@/src/components/shared/Skeleton";

type StatusFilter = "all" | ReservationStatus;

const statusBadgeClass: Record<ReservationStatus, string> = {
  active: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300",
  seated: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300",
  cancelled: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300",
};

export default function ReservationsPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canView = can(activeMembership, "view_tables") || can(activeMembership, "manage_table") || can(activeMembership, "take_order");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ReservationStatus, number>>>({});
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = language === "th"
    ? {
        eyebrow: "Reservations",
        title: "ประวัติการจอง",
        subtitle: "ดูการจองโต๊ะทั้งหมด ทั้งที่รับลูกค้าแล้วและที่ยกเลิก/ไม่มา",
        denied: "ไม่มีสิทธิ์ดูประวัติการจอง",
        all: "ทั้งหมด",
        active: "กำลังจอง",
        seated: "รับลูกค้าแล้ว",
        cancelled: "ยกเลิก/ไม่มา",
        table: "โต๊ะ",
        name: "ชื่อผู้จอง",
        phone: "เบอร์โทร",
        reservedAt: "เวลาที่จอง",
        resolvedAt: "เวลาที่ปิดรายการ",
        status: "สถานะ",
        empty: "ยังไม่มีประวัติการจอง",
        loadError: "โหลดประวัติการจองไม่สำเร็จ",
        noName: "ไม่ระบุชื่อ",
      }
    : {
        eyebrow: "Reservations",
        title: "Reservation history",
        subtitle: "All table bookings — seated guests and cancellations / no-shows.",
        denied: "You do not have permission to view reservations.",
        all: "All",
        active: "Active",
        seated: "Seated",
        cancelled: "Cancelled / no-show",
        table: "Table",
        name: "Guest",
        phone: "Phone",
        reservedAt: "Reserved at",
        resolvedAt: "Closed at",
        status: "Status",
        empty: "No reservations yet.",
        loadError: "Could not load reservation history.",
        noName: "No name",
      };

  const statusText = (status: ReservationStatus) => copy[status];
  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(language === "th" ? "th-TH" : "en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const res = await listReservations(filter === "all" ? {} : { status: filter });
      setReservations(res.data.reservations ?? []);
      setCounts(res.data.counts ?? {});
    } catch (err) {
      setError(apiErrorMessage(err) || copy.loadError);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, filter]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [load]);

  if (!canView) return <PermissionDenied title={copy.denied} />;

  const filters: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: copy.all },
    { value: "active", label: copy.active, count: counts.active },
    { value: "seated", label: copy.seated, count: counts.seated },
    { value: "cancelled", label: copy.cancelled, count: counts.cancelled },
  ];

  return (
    <OperationalPageShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle}>
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`ui-press inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              filter === item.value
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
            }`}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${filter === item.value ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800"}`}>{item.count}</span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="hidden grid-cols-[minmax(70px,0.6fr)_minmax(120px,1fr)_minmax(110px,0.9fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(110px,0.8fr)] gap-3 border-b border-gray-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 lg:grid">
          <span>{copy.table}</span>
          <span>{copy.name}</span>
          <span>{copy.phone}</span>
          <span>{copy.reservedAt}</span>
          <span>{copy.resolvedAt}</span>
          <span className="text-center">{copy.status}</span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}
          </div>
        ) : reservations.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-900">
            {reservations.map((reservation) => (
              <div
                key={reservation.ID}
                className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-[14px] lg:grid-cols-[minmax(70px,0.6fr)_minmax(120px,1fr)_minmax(110px,0.9fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(110px,0.8fr)] lg:items-center"
              >
                <span className="font-semibold text-gray-950 dark:text-white">{reservation.table_label || reservation.table?.display_label || reservation.table?.table_number || "-"}</span>
                <span className="truncate text-gray-700 dark:text-gray-200">{reservation.name || copy.noName}</span>
                <span className="truncate font-mono text-[13px] text-gray-600 dark:text-gray-300">{reservation.phone || "-"}</span>
                <span className="text-[13px] tabular-nums text-gray-500 dark:text-gray-400">{formatDateTime(reservation.CreatedAt)}</span>
                <span className="text-[13px] tabular-nums text-gray-500 dark:text-gray-400">{formatDateTime(reservation.resolved_at)}</span>
                <span className="lg:text-center">
                  <span className={`inline-flex rounded-md border px-2 py-1 text-[12px] font-semibold ${statusBadgeClass[reservation.status]}`}>
                    {statusText(reservation.status)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-14 text-center text-[14px] text-gray-500 dark:text-gray-400">{copy.empty}</div>
        )}
      </div>
    </OperationalPageShell>
  );
}
