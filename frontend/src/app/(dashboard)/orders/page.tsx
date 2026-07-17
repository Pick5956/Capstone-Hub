"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { can } from "@/src/lib/rbac";
import { getOrderBill, listOrders } from "@/src/lib/order";
import type { Bill, Order, OrderStatus } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";
import { Skeleton } from "@/src/components/shared/Skeleton";
import PaidReceiptDialog from "@/src/components/orders/PaidReceiptDialog";
import { orderPosHref } from "@/src/lib/orderNavigation";
import { canReprintReceipt, itemCount, orderTime, statusClass, tableName, zoneName } from "./ordersPageUtils";
import { useVisiblePolling } from "@/src/hooks/useVisiblePolling";

type StatusFilter = "all" | "active" | "closed" | OrderStatus;
type PaymentFilter = "all" | "unpaid" | "paid";

const terminalStatuses: OrderStatus[] = ["completed", "cancelled"];
const activeStatuses: OrderStatus[] = ["open", "sent_to_kitchen", "cooking", "ready", "served"];

export default function OrdersPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canView = can(activeMembership, "view_orders") || can(activeMembership, "take_order");
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptBill, setReceiptBill] = useState<Bill | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<number | null>(null);

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์ดูคลังออเดอร์",
        eyebrow: "Order archive",
        title: "คลังออเดอร์",
        subtitle: "สำหรับผู้จัดการตรวจสอบออเดอร์ย้อนหลัง ดูสถานะ ยอดเงิน รายการอาหาร และประวัติการปิดงาน",
        refresh: "รีเฟรช",
        all: "ทั้งหมด",
        active: "กำลังเปิดอยู่",
        closed: "ปิดงานแล้ว",
        open: "เปิดโต๊ะ",
        sent_to_kitchen: "ส่งเข้าครัว",
        cooking: "ครัวกำลังทำ",
        ready: "พร้อมเสิร์ฟ",
        served: "เสิร์ฟแล้ว",
        completed: "เสร็จแล้ว",
        cancelled: "ยกเลิก",
        unpaid: "ยังไม่ชำระ",
        paid: "ชำระแล้ว",
        search: "ค้นหาเลขออเดอร์ โต๊ะ โซน หรือลูกค้า",
        status: "สถานะ",
        payment: "ชำระเงิน",
        order: "ออเดอร์",
        table: "โต๊ะ",
        items: "รายการ",
        total: "ยอดรวม",
        noOrders: "ไม่พบออเดอร์ในเงื่อนไขนี้",
        noOrdersHint: "ลองเปลี่ยนคำค้นหา สถานะ หรือเงื่อนไขการชำระเงิน",
        viewInPos: "เปิดหน้า POS",
        reprintReceipt: "ดูใบเสร็จ / พิมพ์ซ้ำ",
        loadError: "โหลดออเดอร์ไม่สำเร็จ",
        receiptLoadError: "โหลดใบเสร็จไม่สำเร็จ",
        revenue: "ยอดชำระแล้ว",
        activeOrders: "ออเดอร์ยังเปิด",
        closedOrders: "ออเดอร์ปิดแล้ว",
        managerView: "มุมมองผู้จัดการ",
        latestFirst: "เรียงล่าสุดก่อน",
      }
    : {
        denied: "You do not have permission to view the order archive.",
        eyebrow: "Order archive",
        title: "Order archive",
        subtitle: "A manager view for reviewing past and current orders, payment status, item snapshots, and closing history.",
        refresh: "Refresh",
        all: "All",
        active: "Open work",
        closed: "Closed work",
        open: "Open table",
        sent_to_kitchen: "Sent",
        cooking: "Cooking",
        ready: "Ready",
        served: "Served",
        completed: "Completed",
        cancelled: "Cancelled",
        unpaid: "Unpaid",
        paid: "Paid",
        search: "Search order, table, zone, or customer",
        status: "Status",
        payment: "Payment",
        order: "Order",
        table: "Table",
        items: "Items",
        total: "Total",
        noOrders: "No orders match this view",
        noOrdersHint: "Try another search, status, or payment filter.",
        viewInPos: "Open POS",
        reprintReceipt: "View / reprint receipt",
        loadError: "Could not load orders.",
        receiptLoadError: "Could not load the receipt.",
        revenue: "Paid revenue",
        activeOrders: "Still open",
        closedOrders: "Closed orders",
        managerView: "Manager view",
        latestFirst: "Newest first",
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

  const loadOrders = useCallback(async (quiet = false) => {
    if (!canView) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const res = await listOrders();
      const nextOrders = res.data.orders ?? [];
      setOrders(nextOrders);
    } catch {
      if (!quiet) setError(copy.loadError);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [canView, copy.loadError]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);
  useVisiblePolling(() => loadOrders(true), {
    enabled: canView,
    intervalMs: 30_000,
    runImmediately: false,
  });

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders
      .filter((order) => {
        const statusMatched =
          statusFilter === "all"
            ? true
            : statusFilter === "active"
              ? activeStatuses.includes(order.status)
              : statusFilter === "closed"
                ? terminalStatuses.includes(order.status)
                : order.status === statusFilter;
        const paymentMatched = paymentFilter === "all" || order.payment_status === paymentFilter;
        const queryMatched = !normalizedQuery || [
          order.order_number,
          tableName(order, language),
          zoneName(order),
          order.customer_name,
          order.customer_phone,
        ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
        return statusMatched && paymentMatched && queryMatched;
      })
      .sort((a, b) => new Date(orderTime(b) || 0).getTime() - new Date(orderTime(a) || 0).getTime());
  }, [language, orders, paymentFilter, query, statusFilter]);

  const summary = useMemo(() => {
    const active = orders.filter((order) => activeStatuses.includes(order.status)).length;
    const closed = orders.filter((order) => terminalStatuses.includes(order.status)).length;
    const paidRevenue = orders
      .filter((order) => order.payment_status === "paid" || order.status === "completed")
      .reduce((sum, order) => sum + (order.grand_total || order.total_amount || 0), 0);
    return { active, closed, paidRevenue, total: orders.length };
  }, [orders]);

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: copy.all },
    { value: "active", label: copy.active },
    { value: "closed", label: copy.closed },
    { value: "open", label: copy.open },
    { value: "ready", label: copy.ready },
    { value: "completed", label: copy.completed },
    { value: "cancelled", label: copy.cancelled },
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

  if (!canView) return <PermissionDenied title={copy.denied} />;

  return (
    <OperationalPageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      actions={(
        <button
          type="button"
          onClick={() => void loadOrders()}
          className="ui-press inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          <RefreshCw className="h-4 w-4" />
          {copy.refresh}
        </button>
      )}
      stats={[
        { label: copy.all, value: summary.total, helper: copy.managerView, tone: "neutral" },
        { label: copy.activeOrders, value: summary.active, helper: copy.latestFirst, tone: "warning" },
        { label: copy.closedOrders, value: summary.closed, helper: copy.closed, tone: "good" },
        { label: copy.revenue, value: money(summary.paidRevenue), helper: copy.paid, tone: "info" },
      ]}
    >
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="grid gap-3 border-b border-gray-200 p-3 dark:border-gray-800 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.search}
              className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(["all", "unpaid", "paid"] as PaymentFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPaymentFilter(filter)}
                className={`h-9 rounded-md px-3 text-[12px] font-semibold transition-colors ${
                  paymentFilter === filter
                    ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
                }`}
              >
                {filter === "all" ? copy.all : statusLabel(filter)}
              </button>
            ))}
          </div>
        </div>

        <div className="soft-scrollbar-hide flex gap-2 overflow-x-auto border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          {statusFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatusFilter(item.value)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                statusFilter === item.value
                  ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-[520px]">
          <div className="min-w-0">
            <div className="hidden border-b border-gray-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:border-gray-800 lg:grid lg:grid-cols-[minmax(160px,1.25fr)_110px_110px_90px_120px_190px] lg:items-center">
              <span>{copy.order}</span>
              <span>{copy.status}</span>
              <span>{copy.payment}</span>
              <span>{copy.items}</span>
              <span className="text-right">{copy.total}</span>
              <span className="text-right">{actionLabel}</span>
            </div>

            {loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-20" />
                ))}
              </div>
            ) : filteredOrders.length ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-900">
                {filteredOrders.map((order) => (
                  <div
                    key={order.ID}
                    className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/60 lg:grid-cols-[minmax(160px,1.25fr)_110px_110px_90px_120px_190px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-mono text-[15px] font-semibold text-gray-950 dark:text-white">{order.order_number}</p>
                        <span className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold lg:hidden ${statusClass[order.status]}`}>
                          {statusLabel(order.status)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-gray-700 dark:text-gray-200">{tableName(order, language)}</span>
                        {zoneName(order) && <span>{zoneName(order)}</span>}
                        <span>{formatTime(orderTime(order))}</span>
                      </div>
                    </div>
                    <span className={`hidden w-fit rounded-md border px-2 py-1 text-[11px] font-semibold lg:inline-flex ${statusClass[order.status]}`}>
                      {statusLabel(order.status)}
                    </span>
                    <span className="text-[12px] font-semibold text-gray-600 dark:text-gray-300">{statusLabel(order.payment_status)}</span>
                    <span className="text-[12px] text-gray-500">{itemCount(order)} {copy.items}</span>
                    <span className="font-mono text-[14px] font-semibold tabular-nums text-gray-950 dark:text-white lg:text-right">
                      {money(order.grand_total || order.total_amount)}
                    </span>
                    <div className="flex justify-end">
                      {canReprintReceipt(order) ? (
                        <button
                          type="button"
                          disabled={receiptLoadingId === order.ID}
                          onClick={() => { void openReceipt(order); }}
                          className="ui-press inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 lg:w-auto"
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          {copy.reprintReceipt}
                        </button>
                      ) : (
                        <Link
                          href={orderPosHref(order)}
                          className="ui-press inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900 lg:w-auto"
                        >
                          {copy.viewInPos}
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
