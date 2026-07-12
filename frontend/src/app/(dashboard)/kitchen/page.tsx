"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { playBeep } from "@/src/lib/browserAudio";
import { can } from "@/src/lib/rbac";
import { kitchenQueue, updateOrderItemStatus } from "@/src/lib/order";
import type { Order, OrderItem } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { Skeleton } from "@/src/components/shared/Skeleton";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";

function minutesSince(value?: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function urgencyClass(minutes: number) {
  if (minutes >= 10) return "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-900/20";
  if (minutes >= 5) return "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-900/20";
  return "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/15";
}

function isOrderReady(order: Order) {
  const items = order.items ?? [];
  return items.length > 0 && items.every((item) => item.status === "ready");
}

function ticketKey(order: Order) {
  return order.kitchen_ticket_id ?? `${order.ID}:${order.kitchen_batch ?? 0}`;
}

function orderLocationLabel(order: Order, language: "th" | "en") {
  if (order.order_type === "takeaway") {
    const base = language === "th" ? "กลับบ้าน" : "Takeaway";
    return order.customer_name?.trim() ? `${base} · ${order.customer_name.trim()}` : base;
  }
  const tableLabel = order.table?.display_label || order.table?.table_number || (order.table_id ? String(order.table_id) : "-");
  return `${language === "th" ? "โต๊ะ" : "Table"} ${tableLabel}`;
}

function itemFulfillmentLabel(item: OrderItem, language: "th" | "en") {
  if (item.fulfillment_type === "takeaway") return language === "th" ? "กลับบ้าน" : "Takeaway";
  return language === "th" ? "ทานที่ร้าน" : "Dine-in";
}

function itemFulfillmentBadgeClass(item: OrderItem) {
  return item.fulfillment_type === "takeaway"
    ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/30 dark:text-orange-200 dark:ring-orange-900/60"
    : "bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800";
}

function shouldShowItemFulfillment(order: Order, item: OrderItem) {
  return (item.fulfillment_type ?? order.order_type) !== order.order_type;
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
  const [completingTicketIds, setCompletingTicketIds] = useState<Set<string>>(new Set());
  const [hiddenReadyTicketIds, setHiddenReadyTicketIds] = useState<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);
  const ticketIdsRef = useRef<Set<string>>(new Set());

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
        markReady: "พร้อม",
        markAllReady: "พร้อมทั้งหมด",
        completedTicket: "พร้อมเสิร์ฟทั้งออเดอร์",
        ready: "พร้อมแล้ว",
        cooking: "กำลังทำ",
        remaining: (count: number) => `เหลือ ${count} รายการ`,
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
        markReady: "Ready",
        markAllReady: "Mark all ready",
        completedTicket: "Order ready",
        ready: "Ready",
        cooking: "Cooking",
        remaining: (count: number) => `${count} items left`,
        sent_to_kitchen: "Sent",
        loadError: "Could not load kitchen queue.",
        saveError: "Could not update item status.",
      };

  const visibleOrders = useMemo(
    () => orders.filter((order) => completingTicketIds.has(ticketKey(order)) || (!isOrderReady(order) && !hiddenReadyTicketIds.has(ticketKey(order)))),
    [completingTicketIds, hiddenReadyTicketIds, orders],
  );
  const activeItems = useMemo(
    () => visibleOrders.flatMap((order) => order.items?.map((item) => ({ order, item })) ?? []),
    [visibleOrders],
  );
  const delayedCount = activeItems.filter(({ item, order }) => minutesSince(item.sent_at ?? order.kitchen_sent_at ?? order.opened_at) >= 10).length;
  const cookingCount = activeItems.filter(({ item }) => item.status === "cooking").length;
  const readyCount = activeItems.filter(({ item }) => item.status === "ready").length;

  const load = async () => {
    if (!canView) return;
    if (!hasLoadedRef.current) setLoading(true);
    setError("");
    try {
      const res = await kitchenQueue();
      const nextIds = new Set(res.data.orders.map((order) => ticketKey(order)));
      const hasNewTicket = hasLoadedRef.current && [...nextIds].some((id) => !ticketIdsRef.current.has(id));
      setOrders(res.data.orders);
      if (hasNewTicket) playBeep(740, "square", 0.04, 0.18);
      ticketIdsRef.current = nextIds;
      setLastUpdated(new Date());
      hasLoadedRef.current = true;
    } catch (error) {
      setError(apiErrorMessage(error) || copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  const completeTicketIfReady = (order: Order) => {
    if (!isOrderReady(order)) return;
    const key = ticketKey(order);
    setCompletingTicketIds((current) => new Set(current).add(key));
    window.setTimeout(() => {
      setCompletingTicketIds((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setHiddenReadyTicketIds((current) => new Set(current).add(key));
      setOrders((current) => current.filter((item) => ticketKey(item) !== key));
    }, 980);
  };

  const applyReadyResponse = (order: Order, itemId?: number) => {
    const key = ticketKey(order);
    const nextOrder = itemId
      ? {
          ...order,
          items: order.items?.map((item: OrderItem) => item.ID === itemId ? { ...item, status: "ready" as const } : item),
        }
      : order;
    setOrders((current) => current.map((item) => ticketKey(item) === key ? nextOrder : item));
    completeTicketIfReady(nextOrder);
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const markReady = async (order: Order, itemId: number) => {
    setSubmittingId(itemId);
    setError("");
    try {
      await updateOrderItemStatus(order.ID, itemId, "ready");
      applyReadyResponse(order, itemId);
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
      applyReadyResponse({
        ...order,
        items: order.items?.map((item) => item.status === "cooking" ? { ...item, status: "ready" as const } : item),
      });
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmittingId(null);
    }
  };

  if (!canView) return <PermissionDenied title={copy.denied} />;

  const lastUpdatedText = lastUpdated
    ? `${language === "th" ? "อัปเดต" : "Updated"} ${lastUpdated.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}`
    : undefined;

  return (
    <OperationalPageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      lastUpdated={lastUpdatedText}
      actions={(
        <button type="button" onClick={load} className="h-10 rounded-md border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900">
          {copy.refresh}
        </button>
      )}
      stats={[
        { label: copy.cooking, value: cookingCount, tone: "warning" },
        { label: copy.ready, value: readyCount, tone: "good" },
        { label: language === "th" ? "เกินเวลา" : "Overdue", value: delayedCount, tone: "danger" },
      ]}
    >

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : activeItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleOrders.map((order) => {
            const oldestSent = order.items?.reduce<string | null>((oldest, item) => {
              if (!item.sent_at) return oldest;
              if (!oldest || new Date(item.sent_at) < new Date(oldest)) return item.sent_at;
              return oldest;
            }, order.kitchen_sent_at ?? null);
            const elapsed = minutesSince(oldestSent ?? order.kitchen_sent_at ?? order.opened_at);
            const completing = completingTicketIds.has(ticketKey(order));
            const cookingItems = order.items?.filter((item) => item.status === "cooking") ?? [];
            return (
              <article key={ticketKey(order)} className={`relative overflow-hidden rounded-md border ${urgencyClass(elapsed)} ${completing ? "kitchen-ticket-complete" : ""}`}>
                {completing && (
                  <div className="kitchen-ticket-success absolute inset-0 z-20 grid place-items-center bg-emerald-50/95 text-emerald-700 backdrop-blur-[1px] dark:bg-emerald-950/90 dark:text-emerald-200">
                    <div className="text-center">
                      <div className="kitchen-success-icon mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 dark:bg-emerald-500 dark:text-emerald-950">
                        <CheckCircle2 className="h-12 w-12" strokeWidth={2.6} />
                      </div>
                      <p className="mt-3 text-[14px] font-semibold">{copy.completedTicket}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{orderLocationLabel(order, language)}</p>
                    <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{order.order_number}</h2>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{elapsed}</p>
                    <p className="text-[11px] text-gray-500">{copy.elapsed}</p>
                  </div>
                </div>
                <div className="flex min-h-14 items-center justify-between gap-3 border-y border-black/5 bg-white/55 px-3 py-2 dark:border-white/10 dark:bg-gray-950/35 sm:px-4">
                  <p className="text-[12px] font-medium tabular-nums text-gray-600 dark:text-gray-300">{copy.remaining(cookingItems.length)}</p>
                  {canUpdate && cookingItems.length > 0 ? (
                    <button
                      type="button"
                      disabled={submittingId === order.ID}
                      onClick={() => markAllReady(order)}
                      className="ui-press inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gray-900 px-3.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {copy.markAllReady}
                    </button>
                  ) : null}
                </div>

                <div className="divide-y divide-black/5 bg-white/45 dark:divide-white/10 dark:bg-gray-950/25">
                  {order.items?.map((item) => (
                    <div key={item.ID} className={`flex min-h-[72px] items-center gap-3 px-3 py-3 sm:px-4 ${item.status === "ready" ? "bg-emerald-50/50 dark:bg-emerald-950/15" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className={`font-semibold leading-5 ${item.status === "ready" ? "text-gray-600 dark:text-gray-300" : "text-gray-900 dark:text-white"}`}>{item.quantity}x {item.menu_name}</p>
                            {shouldShowItemFulfillment(order, item) ? (
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${itemFulfillmentBadgeClass(item)}`}>
                                {itemFulfillmentLabel(item, language)}
                              </span>
                            ) : null}
                          </div>
                          {item.selected_options?.length ? (
                            <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                              {item.selected_options.map((option) => (
                                <p key={option.ID}>{option.group_name}: {option.option_name}</p>
                              ))}
                            </div>
                          ) : null}
                          {item.note && <p className="mt-1 text-[12px] text-gray-500">{item.note}</p>}
                        </div>
                        {item.status === "ready" ? (
                          <span className="inline-flex h-11 min-w-[82px] shrink-0 items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <Check className="h-4 w-4" aria-hidden="true" />
                            {copy.ready}
                          </span>
                        ) : canUpdate ? (
                          <button
                            type="button"
                            aria-label={`${copy.markReady}: ${item.menu_name}`}
                            disabled={submittingId === item.ID}
                            onClick={() => markReady(order, item.ID)}
                            className="ui-press inline-flex h-11 min-w-[82px] shrink-0 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-[12px] font-semibold text-gray-800 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-200"
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            {copy.markReady}
                          </button>
                        ) : (
                          <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-300">{copy.cooking}</span>
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
    </OperationalPageShell>
  );
}
