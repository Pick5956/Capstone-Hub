"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { listReservations, type Reservation, type ReservationStatus } from "@/src/lib/reservation";
import { Skeleton } from "@/src/components/shared/Skeleton";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";

type StatusFilter = "all" | ReservationStatus;

const statusBadgeClass: Record<ReservationStatus, string> = {
  active: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300",
  seated: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300",
  cancelled: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300",
};

const rowGridClass =
  "grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-[14px] lg:grid-cols-[minmax(70px,0.6fr)_minmax(120px,1fr)_minmax(110px,0.9fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(110px,0.8fr)] lg:items-center";

export default function ReservationHistoryModal({
  open,
  onClose,
  language,
}: {
  open: boolean;
  onClose: () => void;
  language: "th" | "en";
}) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ReservationStatus, number>>>({});
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);

  const copy = language === "th"
    ? {
        title: "ประวัติการจอง",
        subtitle: "ดูการจองโต๊ะทั้งหมด ทั้งที่รับลูกค้าแล้วและที่ยกเลิก/ไม่มา",
        close: "ปิด",
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
        title: "Reservation history",
        subtitle: "All table bookings — seated guests and cancellations / no-shows.",
        close: "Close",
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
  }, [filter]);

  // Fetch whenever the modal is open (and on filter change while open). The
  // filter resets to "all" each time it opens so it always lands on the full list.
  useEffect(() => {
    if (!open) {
      setFilter("all");
      return;
    }
    void load();
  }, [open, load]);

  const handleClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 180);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  const backdrop = useBackdropClose(handleClose);

  if (!open && !closing) return null;

  const filters: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: copy.all },
    { value: "active", label: copy.active, count: counts.active },
    { value: "seated", label: copy.seated, count: counts.seated },
    { value: "cancelled", label: copy.cancelled, count: counts.cancelled },
  ];

  return (
    <div
      {...backdrop}
      className={`${closing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      <div className={`${closing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} relative flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900`}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.title}</h2>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{copy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={copy.close}
            className="ui-press -mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Fixed height, not content height. The panel is centred, so anything
            that changes its height moves it: the skeleton is ~190px taller than
            the empty state, so the box lurched upward the moment the fetch
            resolved - right as the entrance animation was settling. Switching a
            filter chip did it again. A constant body means the panel is placed
            once and never moves, and the list scrolls inside it. */}
        <div className="flex h-[min(32rem,calc(100dvh-12rem))] flex-col overflow-hidden p-4">
          <div className="mb-4 flex shrink-0 flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`ui-press inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  filter === item.value
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {item.label}
                {typeof item.count === "number" ? <span className="font-mono tabular-nums opacity-70">{item.count}</span> : null}
              </button>
            ))}
          </div>

          {error && <div className="mb-4 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="hidden shrink-0 grid-cols-[minmax(70px,0.6fr)_minmax(120px,1fr)_minmax(110px,0.9fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(110px,0.8fr)] gap-3 border-b border-gray-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 lg:grid">
              <span>{copy.table}</span>
              <span>{copy.name}</span>
              <span>{copy.phone}</span>
              <span>{copy.reservedAt}</span>
              <span>{copy.resolvedAt}</span>
              <span className="text-center">{copy.status}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}
              </div>
            ) : reservations.length ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-900">
                {reservations.map((reservation) => (
                  <div key={reservation.ID} className={rowGridClass}>
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
              <div className="grid h-full place-items-center px-4 text-center text-[14px] text-gray-500 dark:text-gray-400">{copy.empty}</div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
