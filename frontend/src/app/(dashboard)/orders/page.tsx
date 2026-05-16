"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowUpRight, Ban, CheckCircle2, ChefHat, Clock, CreditCard, RefreshCw, Search, X } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { cancelOrder, getOrder, listOrders } from "@/src/lib/order";
import type { Order, OrderStatus } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { Skeleton } from "@/src/components/shared/Skeleton";

type StatusFilter = OrderStatus | "active" | "";
type PaymentFilter = "all" | "unpaid" | "paid";

const terminalStatuses: OrderStatus[] = ["completed", "cancelled"];
const activeStatuses: OrderStatus[] = ["open", "sent_to_kitchen", "cooking", "ready", "served"];

const statusClass: Record<OrderStatus, string> = {
  open: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-900/40",
  sent_to_kitchen: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40",
  cooking: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/40",
  served: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700",
  completed: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800",
  cancelled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/50",
};

const apiErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "";
  return String(error.response?.data?.error ?? "");
};

const money = (amount: number) => `฿${amount.toLocaleString()}`;

const tableName = (order: Order) => {
  const table = order.table;
  if (!table) return `#${order.table_id}`;
  return table.display_label || table.table_number || `#${order.table_id}`;
};

const zoneName = (order: Order) => order.table?.table_zone?.name || order.table?.zone || "";

export default function OrdersPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canView = can(activeMembership, "view_orders") || can(activeMembership, "take_order");
  const canTake = can(activeMembership, "take_order");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์ดูออเดอร์",
        eyebrow: "Orders",
        title: "ติดตามออเดอร์",
        subtitle: "ดูสถานะออเดอร์ทั้งร้าน ค้นหาโต๊ะที่ต้องตาม และส่งต่อไปหน้า POS เมื่อต้องทำรายการ",
        refresh: "รีเฟรช",
        active: "กำลังทำงาน",
        all: "ทั้งหมด",
        open: "เปิดอยู่",
        sent_to_kitchen: "ส่งเข้าครัว",
        cooking: "ครัวกำลังทำ",
        ready: "พร้อมเสิร์ฟ",
        served: "เสิร์ฟแล้ว",
        completed: "เสร็จแล้ว",
        cancelled: "ยกเลิก",
        unpaid: "ยังไม่ชำระ",
        paid: "ชำระแล้ว",
        search: "ค้นหาเลขออเดอร์ โต๊ะ หรือโซน",
        status: "สถานะ",
        payment: "การชำระเงิน",
        order: "ออเดอร์",
        table: "โต๊ะ",
        items: "รายการ",
        total: "ยอดรวม",
        opened: "เปิดเมื่อ",
        staff: "พนักงาน",
        customers: "ลูกค้า",
        note: "หมายเหตุ",
        noOrders: "ยังไม่มีออเดอร์ในเงื่อนไขนี้",
        noOrdersHint: "ลองเปลี่ยนตัวกรอง หรือไปที่หน้า POS เพื่อเปิดออเดอร์ใหม่",
        selectOrder: "เลือกออเดอร์เพื่อดูรายละเอียด",
        selectOrderHint: "หน้านี้ใช้ติดตามภาพรวม ส่วนการเพิ่มเมนูและรับเงินทำต่อใน POS",
        goPos: "ไปที่ POS",
        viewInPos: "เปิดใน POS",
        cancel: "ยกเลิกออเดอร์",
        cancelReason: "เหตุผลที่ยกเลิก",
        cancelTitle: "ยืนยันยกเลิกออเดอร์",
        cancelBody: "ระบุเหตุผลเพื่อเก็บไว้ในประวัติออเดอร์",
        keepOrder: "เก็บออเดอร์ไว้",
        confirmCancel: "ยืนยันยกเลิก",
        kitchenNow: "อยู่ในครัว",
        readyNow: "พร้อมเสิร์ฟ",
        waitingPay: "รอชำระเงิน",
        closedToday: "ปิดแล้ว",
        nextAction: "ขั้นตอนถัดไป",
        loadError: "โหลดออเดอร์ไม่สำเร็จ",
        saveError: "ทำรายการไม่สำเร็จ",
      }
    : {
        denied: "You do not have permission to view orders.",
        eyebrow: "Orders",
        title: "Order Console",
        subtitle: "Track every active order, spot stuck tables, and hand work back to POS when action is needed.",
        refresh: "Refresh",
        active: "Active",
        all: "All",
        open: "Open",
        sent_to_kitchen: "Sent",
        cooking: "Cooking",
        ready: "Ready",
        served: "Served",
        completed: "Completed",
        cancelled: "Cancelled",
        unpaid: "Unpaid",
        paid: "Paid",
        search: "Search order, table, or zone",
        status: "Status",
        payment: "Payment",
        order: "Order",
        table: "Table",
        items: "Items",
        total: "Total",
        opened: "Opened",
        staff: "Staff",
        customers: "Customers",
        note: "Note",
        noOrders: "No orders match this view",
        noOrdersHint: "Change the filters, or open a new order from POS.",
        selectOrder: "Select an order to view details.",
        selectOrderHint: "This page tracks the room. Add items and take payment in POS.",
        goPos: "Go to POS",
        viewInPos: "Open in POS",
        cancel: "Cancel order",
        cancelReason: "Cancel reason",
        cancelTitle: "Confirm order cancellation",
        cancelBody: "Add a reason so the order history stays clear.",
        keepOrder: "Keep order",
        confirmCancel: "Confirm cancel",
        kitchenNow: "In kitchen",
        readyNow: "Ready",
        waitingPay: "Waiting payment",
        closedToday: "Closed",
        nextAction: "Next action",
        loadError: "Could not load orders.",
        saveError: "Could not complete the action.",
      };

  const locale = language === "th" ? "th-TH" : "en-US";
  const statusLabel = (status: string) => (copy as Record<string, string>)[status] ?? status;
  const selectedTerminal = selectedOrder ? terminalStatuses.includes(selectedOrder.status) : true;

  const loadOrders = useCallback(async (quiet = false) => {
    if (!canView) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const res = await listOrders();
      const nextOrders = res.data.orders;
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
    const timer = window.setInterval(() => void loadOrders(true), 15000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatched = statusFilter === "active"
        ? activeStatuses.includes(order.status)
        : statusFilter
          ? order.status === statusFilter
          : true;
      const paymentMatched = paymentFilter === "all" ? true : order.payment_status === paymentFilter;
      const queryMatched = !normalizedQuery || [
        order.order_number,
        tableName(order),
        zoneName(order),
        order.staff?.nickname,
        order.staff?.first_name,
        order.staff?.last_name,
      ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
      return statusMatched && paymentMatched && queryMatched;
    });
  }, [orders, paymentFilter, query, statusFilter]);

  const summary = useMemo(() => {
    const active = orders.filter((order) => activeStatuses.includes(order.status)).length;
    const kitchen = orders.filter((order) => order.status === "sent_to_kitchen" || order.status === "cooking").length;
    const ready = orders.filter((order) => order.status === "ready").length;
    const waitingPay = orders.filter((order) => order.status === "served" && order.payment_status === "unpaid").length;
    const closed = orders.filter((order) => order.status === "completed").length;
    return { active, kitchen, ready, waitingPay, closed };
  }, [orders]);

  const statusOptions = [
    { value: "active", label: copy.active },
    { value: "", label: copy.all },
    { value: "open", label: copy.open },
    { value: "sent_to_kitchen", label: copy.sent_to_kitchen },
    { value: "cooking", label: copy.cooking },
    { value: "ready", label: copy.ready },
    { value: "served", label: copy.served },
    { value: "completed", label: copy.completed },
    { value: "cancelled", label: copy.cancelled },
  ];

  const paymentOptions = [
    { value: "all", label: copy.all },
    { value: "unpaid", label: copy.unpaid },
    { value: "paid", label: copy.paid },
  ];

  const formatTime = (value?: string | null) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value));
  };

  const itemCount = (order: Order) => order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  const nextAction = (order: Order) => {
    if (order.status === "open") return copy.goPos;
    if (order.status === "ready") return copy.served;
    if (order.status === "served" && order.payment_status === "unpaid") return copy.waitingPay;
    if (order.status === "completed") return copy.paid;
    if (order.status === "cancelled") return copy.cancelled;
    return statusLabel(order.status);
  };

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

  const cancelSelected = async () => {
    if (!selectedOrder || !cancelReason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await cancelOrder(selectedOrder.ID, cancelReason.trim());
      setSelectedOrder(res.data);
      setCancelOpen(false);
      setCancelReason("");
      await loadOrders(true);
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canView) return <PermissionDenied title={copy.denied} />;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{copy.title}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-gray-500 dark:text-gray-400">{copy.subtitle}</p>
        </div>
        <button type="button" onClick={() => void loadOrders()} className="ui-press inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 px-4 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
          <RefreshCw className="h-4 w-4" />
          {copy.refresh}
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        {[
          { label: copy.active, value: summary.active, icon: Clock },
          { label: copy.kitchenNow, value: summary.kitchen, icon: ChefHat },
          { label: copy.readyNow, value: summary.ready, icon: CheckCircle2 },
          { label: copy.waitingPay, value: summary.waitingPay, icon: CreditCard },
          { label: copy.closedToday, value: summary.closed, icon: CheckCircle2 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{item.label}</p>
                <Icon className="h-4 w-4 text-orange-500" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="border-b border-gray-200 p-3 dark:border-gray-800">
            <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_190px_170px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.search}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
              <ThemedSelect value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} options={statusOptions} placeholder={copy.status} />
              <ThemedSelect value={paymentFilter} onChange={(value) => setPaymentFilter(value as PaymentFilter)} options={paymentOptions} placeholder={copy.payment} />
            </div>
          </div>

          <div className="overflow-hidden">
            <div className="hidden grid-cols-[1fr_130px_120px_120px_150px] border-b border-gray-200 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:border-gray-800 lg:grid">
              <span>{copy.order}</span>
              <span>{copy.table}</span>
              <span>{copy.status}</span>
              <span>{copy.total}</span>
              <span>{copy.nextAction}</span>
            </div>

            <div className="max-h-[620px] overflow-auto">
              {loading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              ) : filteredOrders.length ? (
                filteredOrders.map((order) => (
                  <button
                    key={order.ID}
                    type="button"
                    onClick={() => void selectOrder(order.ID)}
                    className={`grid w-full gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 dark:border-gray-900 lg:grid-cols-[1fr_130px_120px_120px_150px] lg:items-center ${selectedOrderId === order.ID ? "bg-orange-50/60 dark:bg-orange-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-900/60"}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-semibold text-gray-900 dark:text-white">{order.order_number}</p>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold lg:hidden ${statusClass[order.status]}`}>{statusLabel(order.status)}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{formatTime(order.opened_at)} · {itemCount(order)} {copy.items}</p>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{tableName(order)}</p>
                      {zoneName(order) && <p className="mt-0.5 text-[11px] text-gray-500">{zoneName(order)}</p>}
                    </div>
                    <span className={`hidden w-fit rounded-md border px-2 py-1 text-[11px] font-semibold lg:inline-flex ${statusClass[order.status]}`}>{statusLabel(order.status)}</span>
                    <p className="font-mono text-[14px] font-semibold tabular-nums text-gray-900 dark:text-white">{money(order.grand_total || order.total_amount)}</p>
                    <p className="text-[12px] font-semibold text-gray-600 dark:text-gray-300">{nextAction(order)}</p>
                  </button>
                ))
              ) : (
                <div className="px-4 py-16 text-center">
                  <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.noOrders}</p>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.noOrdersHint}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 xl:sticky xl:top-4 xl:self-start">
          {selectedOrder ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{tableName(selectedOrder)}</p>
                  <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{selectedOrder.order_number}</h2>
                  <p className="mt-1 text-[12px] text-gray-500">{formatTime(selectedOrder.opened_at)}</p>
                </div>
                <button type="button" onClick={() => { setSelectedOrderId(null); setSelectedOrder(null); }} className="ui-press grid h-9 w-9 place-items-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900" aria-label="Close order detail">
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
                    <div className="flex items-start justify-between gap-3">
                      <span className={`inline-flex rounded-md border px-2.5 py-1 text-[12px] font-semibold ${statusClass[selectedOrder.status]}`}>{statusLabel(selectedOrder.status)}</span>
                      <div className="text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{copy.total}</p>
                        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{money(selectedOrder.grand_total || selectedOrder.total_amount)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                        <p className="text-gray-500">{copy.customers}</p>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">{selectedOrder.customer_count}</p>
                      </div>
                      <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                        <p className="text-gray-500">{copy.payment}</p>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">{statusLabel(selectedOrder.payment_status)}</p>
                      </div>
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
                              <div>
                                <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
                                {item.selected_options?.length ? (
                                  <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                                    {item.selected_options.map((option) => (
                                      <p key={option.ID}>{option.group_name}: {option.option_name}{option.price_delta ? ` +${money(option.price_delta)}` : ""}</p>
                                    ))}
                                  </div>
                                ) : null}
                                <p className="mt-1 text-[12px] text-gray-500">x{item.quantity} · {money(item.unit_price)}{item.note ? ` · ${item.note}` : ""}</p>
                              </div>
                              <span className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 dark:border-gray-800">{statusLabel(item.status)}</span>
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

              <div className="flex flex-col gap-2 border-t border-gray-200 p-4 dark:border-gray-800">
                <Link href={`/pos/orders/${selectedOrder.ID}`} className="ui-press inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">
                  {copy.viewInPos}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                {canTake && !selectedTerminal && (
                  <button type="button" disabled={submitting} onClick={() => setCancelOpen(true)} className="ui-press inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 px-4 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">
                    <Ban className="h-4 w-4" />
                    {copy.cancel}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center px-4 py-12 text-center">
              <div>
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.selectOrder}</p>
                <p className="mt-1 text-[12px] text-gray-500">{copy.selectOrderHint}</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {cancelOpen && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
          <div className="motion-bottom-sheet w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
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
              <button type="button" onClick={() => { setCancelOpen(false); setCancelReason(""); }} className="ui-press h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                {copy.keepOrder}
              </button>
              <button type="button" disabled={!cancelReason.trim() || submitting} onClick={cancelSelected} className="ui-press h-9 rounded-md bg-red-600 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {copy.confirmCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
