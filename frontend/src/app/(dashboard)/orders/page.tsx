"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock3,
  CreditCard,
  ReceiptText,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { can } from "@/src/lib/rbac";
import { cancelOrder, getOrder, listOrders } from "@/src/lib/order";
import type { Order, OrderStatus } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";
import { Skeleton } from "@/src/components/shared/Skeleton";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import { itemCount, itemFulfillmentLabel, itemFulfillmentType, orderTime, statusClass, tableName, zoneName } from "./ordersPageUtils";

type StatusFilter = "all" | "active" | "closed" | OrderStatus;
type PaymentFilter = "all" | "unpaid" | "paid";

const terminalStatuses: OrderStatus[] = ["completed", "cancelled"];
const activeStatuses: OrderStatus[] = ["open", "sent_to_kitchen", "cooking", "ready", "served"];

export default function OrdersPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canView = can(activeMembership, "view_orders") || can(activeMembership, "take_order");
  const canTake = can(activeMembership, "take_order");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelClosing, setCancelClosing] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

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
        search: "ค้นหาเลขออเดอร์ โต๊ะ โซน หรือพนักงาน",
        status: "สถานะ",
        payment: "ชำระเงิน",
        order: "ออเดอร์",
        table: "โต๊ะ",
        items: "รายการ",
        total: "ยอดรวม",
        opened: "เปิดเมื่อ",
        closedAt: "ปิดเมื่อ",
        customers: "ลูกค้า",
        note: "หมายเหตุ",
        staff: "พนักงาน",
        noOrders: "ไม่พบออเดอร์ในเงื่อนไขนี้",
        noOrdersHint: "ลองเปลี่ยนคำค้นหา สถานะ หรือเงื่อนไขการชำระเงิน",
        selectOrder: "เลือกออเดอร์เพื่อดูรายละเอียด",
        selectOrderHint: "รายละเอียดจะแสดงรายการอาหาร ยอดเงิน และข้อมูลที่ผู้จัดการต้องตรวจสอบ",
        viewInPos: "เปิดหน้า POS",
        cancel: "ยกเลิกออเดอร์",
        cancelReason: "เหตุผลที่ยกเลิก",
        cancelTitle: "ยืนยันยกเลิกออเดอร์",
        cancelBody: "ระบุเหตุผลเพื่อเก็บไว้ในประวัติออเดอร์",
        keepOrder: "เก็บออเดอร์ไว้",
        confirmCancel: "ยืนยันยกเลิก",
        loadError: "โหลดออเดอร์ไม่สำเร็จ",
        saveError: "ทำรายการไม่สำเร็จ",
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
        search: "Search order, table, zone, or staff",
        status: "Status",
        payment: "Payment",
        order: "Order",
        table: "Table",
        items: "Items",
        total: "Total",
        opened: "Opened",
        closedAt: "Closed",
        customers: "Guests",
        note: "Note",
        staff: "Staff",
        noOrders: "No orders match this view",
        noOrdersHint: "Try another search, status, or payment filter.",
        selectOrder: "Select an order to review details.",
        selectOrderHint: "Details show item snapshots, totals, and manager review information.",
        viewInPos: "Open POS",
        cancel: "Cancel order",
        cancelReason: "Cancel reason",
        cancelTitle: "Confirm order cancellation",
        cancelBody: "Add a reason so the order history stays clear.",
        keepOrder: "Keep order",
        confirmCancel: "Confirm cancel",
        loadError: "Could not load orders.",
        saveError: "Could not complete the action.",
        revenue: "Paid revenue",
        activeOrders: "Still open",
        closedOrders: "Closed orders",
        managerView: "Manager view",
        latestFirst: "Newest first",
      };

  const locale = language === "th" ? "th-TH" : "en-US";
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
      if (selectedOrderId && nextOrders.some((order) => order.ID === selectedOrderId)) {
        const detail = await getOrder(selectedOrderId);
        setSelectedOrder(detail.data);
      } else if (selectedOrderId) {
        setSelectedOrderId(null);
        setSelectedOrder(null);
      }
    } catch {
      if (!quiet) setError(copy.loadError);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [canView, copy.loadError, selectedOrderId]);

  useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => void loadOrders(true), 30_000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

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
          order.staff?.nickname,
          order.staff?.first_name,
          order.staff?.last_name,
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

  const selectOrder = async (orderId: number) => {
    setSelectedOrderId(orderId);
    setDetailLoading(true);
    setError("");
    try {
      const detail = await getOrder(orderId);
      setSelectedOrder(detail.data);
    } catch {
      setError(copy.loadError);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeCancelModal = () => {
    if (cancelClosing) return;
    setCancelClosing(true);
    window.setTimeout(() => {
      setCancelOpen(false);
      setCancelReason("");
      setCancelClosing(false);
    }, 180);
  };
  const cancelBackdrop = useBackdropClose(closeCancelModal);

  const cancelSelected = async () => {
    if (!selectedOrder || !cancelReason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await cancelOrder(selectedOrder.ID, cancelReason.trim());
      setSelectedOrder(res.data);
      closeCancelModal();
      await loadOrders(true);
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmitting(false);
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

        <div className="grid min-h-[520px] gap-0 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="hidden border-b border-gray-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:border-gray-800 lg:grid lg:grid-cols-[minmax(160px,1.25fr)_110px_110px_90px_120px]">
              <span>{copy.order}</span>
              <span>{copy.status}</span>
              <span>{copy.payment}</span>
              <span>{copy.items}</span>
              <span className="text-right">{copy.total}</span>
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
                  <button
                    key={order.ID}
                    type="button"
                    onClick={() => void selectOrder(order.ID)}
                    className={`ui-press grid w-full gap-3 px-4 py-3 text-left transition-colors lg:grid-cols-[minmax(160px,1.25fr)_110px_110px_90px_120px] lg:items-center ${
                      selectedOrderId === order.ID
                        ? "bg-orange-50/70 dark:bg-orange-950/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-900/60"
                    }`}
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
                  </button>
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

          <aside className="border-t border-gray-200 dark:border-gray-800 2xl:border-l 2xl:border-t-0">
            {selectedOrder ? (
              <div className="2xl:sticky 2xl:top-4">
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{tableName(selectedOrder, language)}</p>
                    <h2 className="mt-1 truncate font-mono text-2xl font-semibold text-gray-900 dark:text-white">{selectedOrder.order_number}</h2>
                    <p className="mt-1 text-[12px] text-gray-500">{formatTime(selectedOrder.opened_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(null);
                      setSelectedOrder(null);
                    }}
                    className="ui-press grid h-9 w-9 place-items-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                    aria-label="Close order detail"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  {detailLoading ? (
                    <>
                      <Skeleton className="h-24" />
                      <Skeleton className="h-40" />
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                            <ReceiptText className="h-3.5 w-3.5" />
                            {copy.status}
                          </p>
                          <span className={`mt-2 inline-flex rounded-md border px-2 py-1 text-[12px] font-semibold ${statusClass[selectedOrder.status]}`}>
                            {statusLabel(selectedOrder.status)}
                          </span>
                        </div>
                        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                            <CreditCard className="h-3.5 w-3.5" />
                            {copy.total}
                          </p>
                          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                            {money(selectedOrder.grand_total || selectedOrder.total_amount)}
                          </p>
                        </div>
                        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                          <p className="text-[11px] font-semibold text-gray-500">{copy.customers}</p>
                          <p className="mt-2 text-[14px] font-semibold text-gray-900 dark:text-white">{selectedOrder.customer_count}</p>
                        </div>
                        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                          <p className="text-[11px] font-semibold text-gray-500">{copy.payment}</p>
                          <p className="mt-2 text-[14px] font-semibold text-gray-900 dark:text-white">{statusLabel(selectedOrder.payment_status)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-[12px] text-gray-500 sm:grid-cols-2 2xl:grid-cols-1">
                        <p className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
                          <Clock3 className="h-3.5 w-3.5" />
                          {copy.opened}: <span className="font-medium text-gray-800 dark:text-gray-200">{formatTime(selectedOrder.opened_at)}</span>
                        </p>
                        <p className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {copy.closedAt}: <span className="font-medium text-gray-800 dark:text-gray-200">{formatTime(selectedOrder.closed_at)}</span>
                        </p>
                      </div>

                      {selectedOrder.note && (
                        <div className="rounded-md border border-gray-200 p-3 text-[13px] dark:border-gray-800">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{copy.note}</p>
                          <p className="text-gray-700 dark:text-gray-200">{selectedOrder.note}</p>
                        </div>
                      )}

                      <div>
                        <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{copy.items}</h3>
                        <div className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                          {selectedOrder.items?.length ? selectedOrder.items.map((item) => (
                            <div key={item.ID} className="p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
                                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                      itemFulfillmentType(item) === "takeaway"
                                        ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-200"
                                        : "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300"
                                    }`}>
                                      {itemFulfillmentLabel(item, language)}
                                    </span>
                                  </div>
                                  {item.selected_options?.length ? (
                                    <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                                      {item.selected_options.map((option) => (
                                        <p key={option.ID}>{option.group_name}: {option.option_name}{option.price_delta ? ` +${money(option.price_delta)}` : ""}</p>
                                      ))}
                                    </div>
                                  ) : null}
                                  <p className="mt-1 text-[12px] text-gray-500">x{item.quantity} · {money(item.unit_price)}{item.note ? ` · ${item.note}` : ""}</p>
                                </div>
                                <span className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 dark:border-gray-800">{statusLabel(item.status)}</span>
                              </div>
                            </div>
                          )) : (
                            <div className="p-3 text-[12px] text-gray-500">{copy.noOrders}</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-gray-200 p-4 dark:border-gray-800 sm:flex-row 2xl:flex-col">
                  <Link href={`/pos/orders/${selectedOrder.order_number}`} className="ui-press inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">
                    {copy.viewInPos}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  {canTake && !terminalStatuses.includes(selectedOrder.status) && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setCancelClosing(false);
                        setCancelOpen(true);
                      }}
                      className="ui-press inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-red-200 px-4 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20"
                    >
                      <Ban className="h-4 w-4" />
                      {copy.cancel}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center px-4 py-12 text-center">
                <div>
                  <Archive className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-700" />
                  <p className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-white">{copy.selectOrder}</p>
                  <p className="mt-1 max-w-sm text-[12px] text-gray-500">{copy.selectOrderHint}</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>

      {cancelOpen && (
        <div {...cancelBackdrop} className={`${cancelClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
          <div className={`${cancelClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.cancelTitle}</h2>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.cancelBody}</p>
            </div>
            <div className="p-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.cancelReason}</span>
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  className="min-h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button
                type="button"
                onClick={() => {
                  closeCancelModal();
                }}
                className="ui-press h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                {copy.keepOrder}
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim() || submitting}
                onClick={cancelSelected}
                className="ui-press h-9 rounded-md bg-red-600 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {copy.confirmCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </OperationalPageShell>
  );
}
