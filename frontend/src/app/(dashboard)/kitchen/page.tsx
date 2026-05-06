"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { kitchenQueue, updateOrderItemStatus } from "@/src/lib/order";
import type { Order } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { Skeleton } from "@/src/components/shared/Skeleton";

function minutesSince(value?: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function urgencyClass(minutes: number) {
  if (minutes >= 10) return "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-900/20";
  if (minutes >= 5) return "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-900/20";
  return "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/15";
}

function apiErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return "";
  return String(error.response?.data?.error ?? "");
}

function playBeep() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 740;
  oscillator.type = "square";
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
}

export default function KitchenPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canView = can(activeMembership, "view_kitchen");
  const canUpdate = can(activeMembership, "update_order_status");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasLoadedRef = useRef(false);
  const ticketIdsRef = useRef<Set<number>>(new Set());

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์ดูจอครัว",
        eyebrow: "Kitchen",
        title: "จอครัว",
        subtitle: "ดูออเดอร์ที่ส่งเข้าครัวและอัปเดตเมนูที่พร้อมเสิร์ฟ",
        refresh: "รีเฟรช",
        emptyTitle: "ยังไม่มีงานในครัว",
        emptyHint: "เมื่อพนักงานส่งออเดอร์เข้าครัว รายการจะแสดงที่นี่",
        table: "โต๊ะ",
        elapsed: "นาที",
        markReady: "พร้อมเสิร์ฟ",
        markAllReady: "พร้อมทั้งออเดอร์",
        ready: "พร้อมแล้ว",
        cooking: "กำลังทำ",
        sent_to_kitchen: "ส่งเข้าครัว",
        loadError: "โหลดคิวครัวไม่สำเร็จ",
        saveError: "อัปเดตสถานะไม่สำเร็จ",
      }
    : {
        denied: "You do not have permission to view the kitchen.",
        eyebrow: "Kitchen",
        title: "Kitchen Display",
        subtitle: "Track sent orders and mark items ready for service.",
        refresh: "Refresh",
        emptyTitle: "No kitchen tickets",
        emptyHint: "Orders will appear here after staff send them to the kitchen.",
        table: "Table",
        elapsed: "min",
        markReady: "Mark Ready",
        markAllReady: "Mark all ready",
        ready: "Ready",
        cooking: "Cooking",
        sent_to_kitchen: "Sent",
        loadError: "Could not load kitchen queue.",
        saveError: "Could not update item status.",
      };

  const activeItems = useMemo(
    () => orders.flatMap((order) => order.items?.map((item) => ({ order, item })) ?? []),
    [orders],
  );
  const delayedCount = activeItems.filter(({ item, order }) => minutesSince(item.sent_at ?? order.opened_at) >= 10).length;
  const cookingCount = activeItems.filter(({ item }) => item.status === "cooking").length;
  const readyCount = activeItems.filter(({ item }) => item.status === "ready").length;

  const load = async () => {
    if (!canView) return;
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    try {
      const res = await kitchenQueue();
      const nextIds = new Set(res.data.orders.map((order) => order.ID));
      const hasNewTicket = hasLoadedRef.current && [...nextIds].some((id) => !ticketIdsRef.current.has(id));
      setOrders(res.data.orders);
      if (hasNewTicket) playBeep();
      ticketIdsRef.current = nextIds;
      setLastUpdated(new Date());
      hasLoadedRef.current = true;
    } catch (error) {
      setError(apiErrorMessage(error) || copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const markReady = async (orderId: number, itemId: number) => {
    setSubmittingId(itemId);
    setError("");
    try {
      await updateOrderItemStatus(orderId, itemId, "ready");
      await load();
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmittingId(null);
    }
  };

  const markAllReady = async (order: Order) => {
    const cookingItems = order.items?.filter((item) => item.status === "cooking") ?? [];
    if (!cookingItems.length) return;
    setSubmittingId(order.ID);
    setError("");
    try {
      await Promise.all(cookingItems.map((item) => updateOrderItemStatus(order.ID, item.ID, "ready")));
      await load();
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmittingId(null);
    }
  };

  if (!canView) return <PermissionDenied title={copy.denied} />;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">{copy.subtitle}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {lastUpdated ? (
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              {language === "th" ? "อัปเดต" : "Updated"} {lastUpdated.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : null}
          <button type="button" onClick={load} className="h-10 rounded-md border border-gray-200 px-4 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
            {copy.refresh}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800">
        <div className="bg-white px-3 py-3 dark:bg-gray-950">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.cooking}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">{cookingCount}</p>
        </div>
        <div className="bg-white px-3 py-3 dark:bg-gray-950">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.ready}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{readyCount}</p>
        </div>
        <div className="bg-white px-3 py-3 dark:bg-gray-950">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{language === "th" ? "เกินเวลา" : "Overdue"}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-red-700 dark:text-red-300">{delayedCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : activeItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const oldestSent = order.items?.reduce<string | null>((oldest, item) => {
              if (!item.sent_at) return oldest;
              if (!oldest || new Date(item.sent_at) < new Date(oldest)) return item.sent_at;
              return oldest;
            }, null);
            const elapsed = minutesSince(oldestSent ?? order.opened_at);
            return (
              <article key={order.ID} className={`rounded-md border p-4 ${urgencyClass(elapsed)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{copy.table} {order.table?.table_number ?? order.table_id}</p>
                    <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{order.order_number}</h2>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{elapsed}</p>
                    <p className="text-[11px] text-gray-500">{copy.elapsed}</p>
                  </div>
                </div>
                {canUpdate && order.items?.some((item) => item.status === "cooking") && (
                  <button type="button" disabled={submittingId === order.ID} onClick={() => markAllReady(order)} className="mt-4 h-9 w-full rounded-md border border-emerald-200 bg-white/70 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-gray-950/45 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                    {copy.markAllReady}
                  </button>
                )}

                <div className="mt-4 space-y-2">
                  {order.items?.map((item) => (
                    <div key={item.ID} className="rounded-md border border-black/5 bg-white/70 p-3 dark:border-white/10 dark:bg-gray-950/45">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{item.quantity}x {item.menu_name}</p>
                          {item.note && <p className="mt-1 text-[12px] text-gray-500">{item.note}</p>}
                        </div>
                        <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                          {item.status === "ready" ? copy.ready : copy.cooking}
                        </span>
                      </div>
                      {canUpdate && item.status === "cooking" && (
                        <button type="button" disabled={submittingId === item.ID} onClick={() => markReady(order.ID, item.ID)} className="mt-3 h-9 w-full rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                          {copy.markReady}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-white px-4 py-14 text-center dark:border-gray-800 dark:bg-gray-950">
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.emptyTitle}</p>
          <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.emptyHint}</p>
        </div>
      )}
    </div>
  );
}
