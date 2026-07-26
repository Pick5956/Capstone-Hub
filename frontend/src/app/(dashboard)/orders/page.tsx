"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Printer,
  Search,
} from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { can } from "@/src/lib/rbac";
import { getOrderBill, listOrders } from "@/src/lib/order";
import type { OrderListSummary } from "@/src/lib/order";
import type { Bill, Order } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import DashboardTopBarPortal from "@/src/components/shared/DashboardTopBarPortal";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";
import { Skeleton } from "@/src/components/shared/Skeleton";
import PaidReceiptDialog from "@/src/components/orders/PaidReceiptDialog";
import { orderPosHref } from "@/src/lib/orderNavigation";
import { canReprintReceipt, itemCount, orderTime, statusClass, tableName, zoneName } from "./ordersPageUtils";

type StatusFilter = "all" | "active" | "completed" | "cancelled";

const ORDERS_PAGE_SIZE = 25;
const emptyOrderSummary: OrderListSummary = {
  total: 0,
  active: 0,
  closed: 0,
  statuses: {
    open: 0,
    sent_to_kitchen: 0,
    cooking: 0,
    ready: 0,
    served: 0,
    completed: 0,
    cancelled: 0,
  },
};

export default function OrdersPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canView = can(activeMembership, "view_orders") || can(activeMembership, "take_order");
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [summary, setSummary] = useState<OrderListSummary>(emptyOrderSummary);
  const [error, setError] = useState("");
  const [receiptBill, setReceiptBill] = useState<Bill | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<number | null>(null);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const requestVersionRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์ดูคลังออเดอร์",
        eyebrow: "Order archive",
        title: "คลังออเดอร์",
        subtitle: "สำหรับผู้จัดการตรวจสอบออเดอร์ย้อนหลัง ดูสถานะ ยอดเงิน รายการอาหาร และประวัติการปิดงาน",
        all: "ทั้งหมด",
        active: "กำลังใช้งาน",
        open: "เปิดโต๊ะ",
        sent_to_kitchen: "ส่งเข้าครัว",
        cooking: "ครัวกำลังทำ",
        ready: "เสร็จแล้ว",
        served: "เสร็จแล้ว",
        completed: "เสร็จสิ้น",
        cancelled: "ยกเลิก",
        unpaid: "ยังไม่ชำระ",
        paid: "ชำระแล้ว",
        search: "ค้นหาเลขออเดอร์ โต๊ะ โซน หรือลูกค้า",
        status: "สถานะ",
        payment: "ชำระเงิน",
        order: "ออเดอร์",
        table: "โต๊ะ",
        zone: "โซน",
        dateTime: "วันเวลา",
        items: "รายการ",
        total: "ยอดรวม",
        noOrders: "ไม่พบออเดอร์ในเงื่อนไขนี้",
        noOrdersHint: "ลองเปลี่ยนคำค้นหาหรือหมวดหมู่",
        openOrder: "เปิดออเดอร์",
        reprintReceipt: "ดูใบเสร็จ / พิมพ์ซ้ำ",
        receiptLoadError: "โหลดใบเสร็จไม่สำเร็จ",
      }
    : {
        denied: "You do not have permission to view the order archive.",
        eyebrow: "Order archive",
        title: "Order archive",
        subtitle: "A manager view for reviewing past and current orders, payment status, item snapshots, and closing history.",
        all: "All",
        active: "Active",
        open: "Open table",
        sent_to_kitchen: "Sent",
        cooking: "Cooking",
        ready: "Done",
        served: "Done",
        completed: "Completed",
        cancelled: "Cancelled",
        unpaid: "Unpaid",
        paid: "Paid",
        search: "Search order, table, zone, or customer",
        status: "Status",
        payment: "Payment",
        order: "Order",
        table: "Table",
        zone: "Zone",
        dateTime: "Date / time",
        items: "Items",
        total: "Total",
        noOrders: "No orders match this view",
        noOrdersHint: "Try another search or category.",
        openOrder: "Open order",
        reprintReceipt: "View / reprint receipt",
        receiptLoadError: "Could not load the receipt.",
      };

  const locale = language === "th" ? "th-TH" : "en-US";
  const actionLabel = language === "th" ? "จัดการ" : "Action";
  const statusLabel = (status: string) => (copy as Record<string, string>)[status] ?? status;
  const money = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 0,
    }).format(amount);

  const formatTime = (value?: string | null) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value));
  };

  const ordersLoadError = language === "th" ? "โหลดออเดอร์ไม่สำเร็จ" : "Could not load orders.";
  const ordersLoadMoreError = language === "th" ? "โหลดออเดอร์หน้าถัดไปไม่สำเร็จ" : "Could not load more orders.";

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchOrdersPage = useCallback(async (pageToLoad: number, append: boolean) => {
    if (!canView) return;
    if (append && loadingMoreRef.current) return;

    const requestVersion = append ? requestVersionRef.current : requestVersionRef.current + 1;
    if (!append) {
      requestVersionRef.current = requestVersion;
      setLoading(true);
      setOrders([]);
      setSummary(emptyOrderSummary);
      setPage(1);
      setHasMore(false);
    } else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    setError("");

    try {
      const response = await listOrders({
        status: statusFilter === "all" ? "" : statusFilter,
        search: debouncedQuery || undefined,
        include_summary: true,
        page: pageToLoad,
        limit: ORDERS_PAGE_SIZE,
      });
      if (requestVersion !== requestVersionRef.current) return;

      const nextOrders = response.data.orders ?? [];
      setOrders((current) => {
        if (!append) return nextOrders;
        const existingIds = new Set(current.map((order) => order.ID));
        return [...current, ...nextOrders.filter((order) => !existingIds.has(order.ID))];
      });
      setPage(pageToLoad);
      setHasMore(response.data.pagination?.has_more ?? nextOrders.length === ORDERS_PAGE_SIZE);
      setSummary(response.data.summary ?? emptyOrderSummary);
    } catch {
      if (requestVersion === requestVersionRef.current) {
        setError(append ? ordersLoadMoreError : ordersLoadError);
      }
    } finally {
      if (!append && requestVersion === requestVersionRef.current) setLoading(false);
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [canView, debouncedQuery, ordersLoadError, ordersLoadMoreError, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listViewportRef.current?.scrollTo({ top: 0 });
      void fetchOrdersPage(1, false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchOrdersPage]);

  useEffect(() => {
    const root = listViewportRef.current;
    const target = loadMoreSentinelRef.current;
    if (!root || !target || loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchOrdersPage(page + 1, true);
    }, { root, rootMargin: "240px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchOrdersPage, hasMore, loading, loadingMore, page]);

  const statusFilters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: copy.all, count: summary.total },
    { value: "active", label: copy.active, count: summary.active },
    { value: "completed", label: copy.completed, count: summary.statuses.completed },
    { value: "cancelled", label: copy.cancelled, count: summary.statuses.cancelled },
  ];

  const openReceipt = async (order: Order) => {
    if (!canReprintReceipt(order)) return;
    setReceiptLoadingId(order.ID);
    setError("");
    try {
      const response = await getOrderBill(order.ID);
      setReceiptBill(response.data);
    } catch (error) {
      setError(apiErrorMessage(error) || copy.receiptLoadError);
    } finally {
      setReceiptLoadingId(null);
    }
  };

  const renderArchiveToolbar = (placement: "desktop" | "mobile") => (
    <div className={placement === "desktop" ? "w-full max-w-lg min-w-0 pr-2" : "shrink-0 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 lg:hidden"}>
      <label className="relative block w-full min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search}
          aria-label={copy.search}
          className="h-10 w-full rounded-md border border-[#dfe3e8] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-[#253142] dark:bg-gray-900"
        />
      </label>
    </div>
  );

  if (!canView) return <PermissionDenied title={copy.denied} />;

  return (
    <OperationalPageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      showHeader={false}
      edgeToEdge
    >
      <DashboardTopBarPortal>
        {renderArchiveToolbar("desktop")}
      </DashboardTopBarPortal>

      <section className="flex min-h-0 flex-1 flex-col border-b border-gray-200 bg-slate-50 dark:border-gray-800 dark:bg-gray-950">
        <h1 className="sr-only">{copy.title}</h1>
        {error && (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        {renderArchiveToolbar("mobile")}

        <div role="group" aria-label={copy.status} className="soft-scrollbar-hide flex max-w-full shrink-0 gap-2 overflow-x-auto border-b border-gray-200 bg-slate-50 px-3 pb-3 pt-2 dark:border-gray-800 dark:bg-gray-950">
          {statusFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={statusFilter === item.value}
              onClick={() => setStatusFilter(item.value)}
              className={`relative inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-[14.4px] font-semibold transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out ${
                statusFilter === item.value
                  ? "border-transparent bg-orange-50 text-orange-700 shadow-[0_0_6px_rgba(15,23,42,0.18)] active:shadow-[0_0_3px_rgba(15,23,42,0.16)] dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200 dark:shadow-[0_0_7px_rgba(249,115,22,0.24)] dark:active:shadow-[0_0_3px_rgba(249,115,22,0.18)]"
                  : "border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 active:translate-y-px dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
              }`}
            >
              <span>{item.label}</span>
              <span className={`min-w-5 text-right font-mono text-[13.2px] tabular-nums ${statusFilter === item.value ? "text-orange-600 dark:text-orange-300" : "text-gray-400 dark:text-gray-500"}`}>
                {new Intl.NumberFormat(locale).format(item.count)}
              </span>
            </button>
          ))}
        </div>

        <div
          ref={listViewportRef}
          aria-busy={loading || loadingMore}
          className="min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]"
        >
          <div className="min-w-0 lg:min-w-[1060px]">
            <div className="sticky top-0 z-10 hidden border-b border-gray-200 bg-slate-100/95 px-4 py-2 text-center text-[13.2px] font-semibold uppercase tracking-[0.12em] text-gray-500 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 dark:text-gray-400 lg:grid lg:grid-cols-[minmax(90px,0.8fr)_minmax(80px,0.7fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(90px,0.8fr)_minmax(90px,0.8fr)_minmax(80px,0.7fr)_minmax(100px,0.9fr)_minmax(170px,1.4fr)] lg:items-center lg:gap-3">
              <span>{copy.order}</span>
              <span>{copy.table}</span>
              <span>{copy.zone}</span>
              <span>{copy.dateTime}</span>
              <span>{copy.status}</span>
              <span>{copy.payment}</span>
              <span>{copy.items}</span>
              <span>{copy.total}</span>
              <span>{actionLabel}</span>
            </div>

            {loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-20" />
                ))}
              </div>
            ) : orders.length ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-900">
                {orders.map((order, index) => (
                  <div
                    key={order.ID}
                    className={`grid w-full gap-3 px-4 py-3 text-left transition-colors lg:grid-cols-[minmax(90px,0.8fr)_minmax(80px,0.7fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(90px,0.8fr)_minmax(90px,0.8fr)_minmax(80px,0.7fr)_minmax(100px,0.9fr)_minmax(170px,1.4fr)] lg:items-center ${
                      index % 2 === 0
                        ? "bg-white hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-800/70"
                        : "bg-slate-100/70 hover:bg-slate-200/70 dark:bg-gray-900/55 dark:hover:bg-gray-800/80"
                    }`}
                  >
                    <div className="min-w-0 lg:w-full lg:text-center">
                      <div className="flex min-w-0 items-center gap-2 lg:justify-center">
                        <p className="truncate font-mono text-[18px] font-semibold text-gray-950 dark:text-white">{order.order_number}</p>
                        <span className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[12px] font-semibold lg:hidden ${statusClass[order.status]}`}>
                          {statusLabel(order.status)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.4px] text-gray-500 dark:text-gray-400 lg:hidden">
                        <span className="font-semibold text-gray-700 dark:text-gray-200">{tableName(order, language)}</span>
                        {zoneName(order) && <span>{zoneName(order)}</span>}
                        <span>{formatTime(orderTime(order))}</span>
                      </div>
                    </div>
                    <span className="hidden truncate text-center text-[14.4px] font-semibold text-gray-700 dark:text-gray-200 lg:block">
                      {tableName(order, language)}
                    </span>
                    <span className="hidden truncate text-center text-[14.4px] text-gray-500 dark:text-gray-400 lg:block">
                      {zoneName(order) || "-"}
                    </span>
                    <span className="hidden whitespace-nowrap text-center text-[14.4px] tabular-nums text-gray-500 dark:text-gray-400 lg:block">
                      {formatTime(orderTime(order))}
                    </span>
                    <span className={`hidden w-fit justify-self-center rounded-md border px-2 py-1 text-[13.2px] font-semibold lg:inline-flex ${statusClass[order.status]}`}>
                      {statusLabel(order.status)}
                    </span>
                    <span className="text-[14.4px] font-semibold text-gray-600 dark:text-gray-300 lg:text-center">{statusLabel(order.payment_status)}</span>
                    <span className="text-[14.4px] text-gray-500 lg:text-center">{itemCount(order)} {copy.items}</span>
                    <span className="font-mono text-[16.8px] font-semibold tabular-nums text-gray-950 dark:text-white lg:text-center">
                      {money(order.grand_total || order.total_amount)}
                    </span>
                    <div className="flex justify-end lg:justify-center">
                      {canReprintReceipt(order) ? (
                        <button
                          type="button"
                          disabled={receiptLoadingId === order.ID}
                          onClick={() => { void openReceipt(order); }}
                          className="ui-press inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 text-[14.4px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 lg:w-auto"
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          {copy.reprintReceipt}
                        </button>
                      ) : (
                        <Link
                          href={orderPosHref(order)}
                          className="ui-press inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[14.4px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900 lg:w-auto"
                        >
                          {copy.openOrder}
                          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center px-4 py-12 text-center">
                <div>
                  <Archive className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-700" />
                  <p className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-white">{copy.noOrders}</p>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.noOrdersHint}</p>
                </div>
              </div>
            )}
            {loadingMore ? (
              <div className="space-y-2 border-t border-gray-100 p-3 dark:border-gray-900">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-20" />
                ))}
              </div>
            ) : null}
            <div ref={loadMoreSentinelRef} className="h-px" aria-hidden="true" />
          </div>
        </div>
      </section>

      {receiptBill ? (
        <PaidReceiptDialog
          bill={receiptBill}
          language={language}
          locationLabel={tableName(receiptBill.order, language)}
          restaurant={activeMembership?.restaurant}
          onClose={() => setReceiptBill(null)}
        />
      ) : null}

    </OperationalPageShell>
  );
}
