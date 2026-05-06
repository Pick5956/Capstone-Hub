"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { addOrderItem, cancelOrder, deleteOrderItem, getOrder, getOrderBill, payOrder, sendOrderToKitchen, updateOrderItem, updateOrderItemStatus } from "@/src/lib/order";
import { listCategories, listMenuItems } from "@/src/lib/menu";
import type { Category, MenuItem } from "@/src/types/menu";
import type { Bill, Order, OrderItem } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { Skeleton } from "@/src/components/shared/Skeleton";

const terminalStatuses = ["completed", "cancelled"];

function playBeep(frequency = 880) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.value = 0.05;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.16);
}

const apiErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "";
  return String(error.response?.data?.error ?? "");
};

export default function PosOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canTake = can(activeMembership, "take_order");
  const canPay = can(activeMembership, "take_payment");
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [bill, setBill] = useState<Bill | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "promptpay_qr">("cash");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const actionInFlightRef = useRef(false);
  const readyItemIdsRef = useRef<Set<number>>(new Set());

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์รับออเดอร์",
        back: "กลับไปเลือกโต๊ะ",
        search: "ค้นหาเมนู",
        all: "ทั้งหมด",
        add: "เพิ่ม",
        quantity: "จำนวน",
        note: "หมายเหตุ",
        pending: "รอส่งครัว",
        cooking: "ครัวกำลังทำ",
        ready: "พร้อมเสิร์ฟ",
        served: "เสิร์ฟแล้ว",
        sent_to_kitchen: "ส่งเข้าครัว",
        open: "เปิดอยู่",
        completed: "ปิดแล้ว",
        cancelled: "ยกเลิก",
        cart: "รายการในออเดอร์",
        emptyCart: "ยังไม่มีรายการ",
        sendKitchen: "ส่งเข้าครัว",
        markServed: "เสิร์ฟแล้ว",
        close: "ออกบิล / รับเงิน",
        readyAlert: "มีอาหารพร้อมเสิร์ฟ",
        bill: "บิล",
        service: "Service charge",
        vat: "VAT",
        grandTotal: "ยอดสุทธิ",
        cash: "เงินสด",
        qr: "QR PromptPay",
        received: "รับเงินมา",
        change: "เงินทอน",
        print: "พิมพ์บิล",
        confirmPayment: "ยืนยันรับเงิน",
        cancelOrder: "ยกเลิกออเดอร์",
        cancelReason: "เหตุผลที่ยกเลิก",
        cancelTitle: "ยกเลิกออเดอร์นี้?",
        cancelBody: "ใช้เมื่อเปิดโต๊ะผิดหรือยังไม่ได้ส่งเข้าครัว",
        keepOrder: "เก็บออเดอร์ไว้",
        confirmCancel: "ยืนยันยกเลิก",
        remove: "ลบ",
        total: "ยอดรวม",
        loadError: "โหลดออเดอร์ไม่สำเร็จ",
        saveError: "ทำรายการไม่สำเร็จ",
        noMenu: "ยังไม่มีเมนู",
      }
    : {
        denied: "You do not have permission to take orders.",
        back: "Back to tables",
        search: "Search menu",
        all: "All",
        add: "Add",
        quantity: "Qty",
        note: "Note",
        pending: "Pending",
        cooking: "Cooking",
        ready: "Ready",
        served: "Served",
        sent_to_kitchen: "Sent",
        open: "Open",
        completed: "Completed",
        cancelled: "Cancelled",
        cart: "Order items",
        emptyCart: "No items yet",
        sendKitchen: "Send to Kitchen",
        markServed: "Served",
        close: "Bill / Pay",
        readyAlert: "Food ready to serve",
        bill: "Bill",
        service: "Service charge",
        vat: "VAT",
        grandTotal: "Grand total",
        cash: "Cash",
        qr: "QR PromptPay",
        received: "Received amount",
        change: "Change",
        print: "Print bill",
        confirmPayment: "Confirm payment",
        cancelOrder: "Cancel order",
        cancelReason: "Cancel reason",
        cancelTitle: "Cancel this order?",
        cancelBody: "Use this when the table was opened by mistake before sending to kitchen.",
        keepOrder: "Keep order",
        confirmCancel: "Confirm cancel",
        remove: "Remove",
        total: "Total",
        loadError: "Could not load order.",
        saveError: "Could not complete the action.",
        noMenu: "No menu items.",
      };

  const statusLabel = (status: string) => (copy as Record<string, string>)[status] ?? status;
  const isTerminal = order ? terminalStatuses.includes(order.status) : true;
  const hasPending = Boolean(order?.items?.some((item) => item.status === "pending"));
  const readyItems = order?.items?.filter((item) => item.status === "ready") ?? [];
  const hasReadyItems = readyItems.length > 0;
  const canCancelFromPos = Boolean(order && order.status === "open");
  const filteredMenu = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (categoryId !== "all" && item.category_id !== categoryId) return false;
      if (keyword && !item.name.toLowerCase().includes(keyword)) return false;
      return item.is_available;
    });
  }, [categoryId, menuItems, search]);

  const load = async ({ background = false }: { background?: boolean } = {}) => {
    if (!canTake || !orderId) return;
    if (background && actionInFlightRef.current) return;
    if (!background) {
      setLoading(true);
      setError("");
    }
    try {
      const [orderRes, categoryRes, menuRes] = await Promise.all([getOrder(orderId), listCategories(), listMenuItems()]);
      if (background && actionInFlightRef.current) return;
      setOrder(orderRes.data);
      setCategories(categoryRes.data.categories.filter((category) => category.is_active));
      setMenuItems(menuRes.data.menu_items.filter((item) => item.is_available));
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (order && terminalStatuses.includes(order.status)) return;
    const timer = window.setInterval(() => void load({ background: true }), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTake, orderId, order?.status]);

  useEffect(() => {
    if (!order?.items) return;
    const readyIds = new Set(order.items.filter((item) => item.status === "ready").map((item) => item.ID));
    const hasNewReady = [...readyIds].some((id) => !readyItemIdsRef.current.has(id));
    if (readyItemIdsRef.current.size && hasNewReady) playBeep(1046);
    readyItemIdsRef.current = readyIds;
  }, [order?.items]);

  const runAction = async (action: () => Promise<Order>) => {
    setSubmitting(true);
    actionInFlightRef.current = true;
    setError("");
    try {
      const next = await action();
      setOrder(next);
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      actionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const addSelectedMenu = async () => {
    if (!selectedMenu || !order) return;
    await runAction(async () => {
      const res = await addOrderItem(order.ID, { menu_id: selectedMenu.ID, quantity, note });
      setSelectedMenu(null);
      setQuantity(1);
      setNote("");
      return res.data;
    });
  };

  const bumpItem = async (item: OrderItem, nextQuantity: number) => {
    if (!order || nextQuantity < 1 || item.status !== "pending") return;
    await runAction(async () => (await updateOrderItem(order.ID, item.ID, { quantity: nextQuantity, note: item.note })).data);
  };

  const cancelSelectedOrder = async () => {
    if (!order || !cancelReason.trim()) return;
    await runAction(async () => (await cancelOrder(order.ID, cancelReason)).data);
    setCancelOpen(false);
    setCancelReason("");
  };

  const openPayment = async () => {
    if (!order) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await getOrderBill(order.ID);
      setBill(res.data);
      setReceivedAmount(String(res.data.grand_total));
      setPaymentMethod("cash");
      setPaymentOpen(true);
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPayment = async () => {
    if (!order || !bill) return;
    await runAction(async () => {
      const res = await payOrder(order.ID, {
        method: paymentMethod,
        received_amount: paymentMethod === "cash" ? Number(receivedAmount) : bill.grand_total,
      });
      setPaymentOpen(false);
      setBill(null);
      return res.data;
    });
  };

  const changeAmount = bill ? Math.max(0, Number(receivedAmount || 0) - bill.grand_total) : 0;
  const orderItemCount = order?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const mobileActionLabel = hasPending ? copy.sendKitchen : order?.status === "served" ? copy.close : hasReadyItems ? copy.readyAlert : copy.cart;
  const mobileActionDisabled = submitting || isTerminal || (!hasPending && order?.status !== "served");
  const runMobilePrimaryAction = () => {
    if (!order) return;
    if (hasPending) {
      void runAction(async () => (await sendOrderToKitchen(order.ID)).data);
      return;
    }
    if (order.status === "served") {
      void openPayment();
      return;
    }
    document.getElementById("order-cart")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!canTake) return <PermissionDenied title={copy.denied} />;

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50 px-3 py-3 pb-28 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 sm:pb-6 lg:px-8 lg:py-6">
      <div className="sticky top-14 z-20 -mx-3 mb-3 border-b border-gray-200 bg-slate-50/95 px-3 pb-3 pt-1 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:static sm:mx-0 sm:mb-4 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <button type="button" onClick={() => router.push("/pos/tables")} className="ui-press h-11 w-fit rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
            {copy.back}
          </button>
          {order && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-white">{order.table?.table_number ?? order.table_id}</span>
              <span className="rounded-md bg-gray-900 px-3 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-gray-900">{order.order_number}</span>
              <span className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">{statusLabel(order.status)}</span>
            </div>
          )}
        </div>
        {order && (
          <a href="#order-cart" className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950 lg:hidden">
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{copy.cart}</p>
              <p className="font-mono text-[18px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{order.total_amount.toLocaleString()}</p>
            </div>
            <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              {orderItemCount} {language === "th" ? "รายการ" : "items"}
            </span>
          </a>
        )}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      {hasReadyItems && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
          {copy.readyAlert}: {readyItems.length}
        </div>
      )}

      {loading && !order ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      ) : order ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_380px]">
          <section className="min-w-0 rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 p-3 dark:border-gray-800">
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button type="button" onClick={() => setCategoryId("all")} className={`ui-press h-11 shrink-0 rounded-md px-4 text-[13px] font-semibold sm:h-9 sm:px-3 sm:text-[12px] ${categoryId === "all" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"}`}>
                  {copy.all}
                </button>
                {categories.map((category) => (
                  <button key={category.ID} type="button" onClick={() => setCategoryId(category.ID)} className={`ui-press h-11 shrink-0 rounded-md px-4 text-[13px] font-semibold sm:h-9 sm:px-3 sm:text-[12px] ${categoryId === category.ID ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"}`}>
                    {category.name}
                  </button>
                ))}
              </div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="mt-2 h-12 w-full rounded-md border border-gray-200 bg-white px-3 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 sm:h-10 sm:text-[13px]" />
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredMenu.length ? filteredMenu.map((item) => (
                <button key={item.ID} type="button" disabled={isTerminal || submitting} onClick={() => { setSelectedMenu(item); setQuantity(1); setNote(""); }} className="ui-press min-h-36 rounded-md border border-gray-200 bg-white p-3 text-left hover:border-orange-200 hover:bg-orange-50/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10 sm:min-h-32 sm:hover:-translate-y-0.5">
                  <p className="line-clamp-2 text-[14px] font-semibold text-gray-900 dark:text-white">{item.name}</p>
                  <p className="mt-4 font-mono text-[18px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{item.price.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{item.category?.name ?? ""}</p>
                </button>
              )) : (
                <div className="col-span-full px-4 py-12 text-center text-[13px] text-gray-500">{copy.noMenu}</div>
              )}
            </div>
          </section>

          <aside id="order-cart" className="scroll-mt-28 flex min-h-[480px] flex-col rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 p-4 dark:border-gray-800">
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.cart}</h2>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">฿{order.total_amount.toLocaleString()}</p>
            </div>

            <div className="flex-1 divide-y divide-gray-200 overflow-auto dark:divide-gray-800">
              {order.items?.length ? order.items.map((item) => (
                <div key={item.ID} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
                      <p className="mt-1 text-[12px] text-gray-500">฿{item.unit_price.toLocaleString()} · {statusLabel(item.status)}</p>
                      {item.note && <p className="mt-1 text-[12px] text-gray-500">{item.note}</p>}
                    </div>
                    <p className="font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{item.subtotal.toLocaleString()}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.status === "pending" && (
                      <>
                        <button type="button" disabled={submitting} onClick={() => bumpItem(item, item.quantity - 1)} className="ui-press h-11 w-11 rounded-md border border-gray-200 text-[18px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900 sm:h-9 sm:w-9 sm:text-[16px]">-</button>
                        <span className="min-w-8 text-center font-mono text-[14px] font-semibold tabular-nums">{item.quantity}</span>
                        <button type="button" disabled={submitting} onClick={() => bumpItem(item, item.quantity + 1)} className="ui-press h-11 w-11 rounded-md border border-gray-200 text-[18px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900 sm:h-9 sm:w-9 sm:text-[16px]">+</button>
                        <button type="button" disabled={submitting} onClick={() => runAction(async () => (await deleteOrderItem(order.ID, item.ID)).data)} className="ui-press ml-auto h-11 rounded-md border border-red-200 px-4 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20 sm:h-9 sm:px-3 sm:text-[12px]">
                          {copy.remove}
                        </button>
                      </>
                    )}
                    {item.status === "ready" && (
                      <button type="button" disabled={submitting} onClick={() => runAction(async () => (await updateOrderItemStatus(order.ID, item.ID, "served")).data)} className="ui-press h-11 rounded-md border border-emerald-200 px-4 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/20 sm:h-9 sm:px-3 sm:text-[12px]">
                        {copy.markServed}
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="px-4 py-12 text-center text-[13px] text-gray-500">{copy.emptyCart}</div>
              )}
            </div>

            <div className="space-y-2 border-t border-gray-200 p-4 dark:border-gray-800">
              {hasPending && (
                <button type="button" disabled={submitting} onClick={() => runAction(async () => (await sendOrderToKitchen(order.ID)).data)} className="ui-press h-11 w-full rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                  {copy.sendKitchen}
                </button>
              )}
              {order.status === "served" && (
                <button type="button" disabled={submitting || !canPay} onClick={openPayment} className="ui-press h-11 w-full rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                  {copy.close}
                </button>
              )}
              {canCancelFromPos && (
                <button type="button" disabled={submitting} onClick={() => setCancelOpen(true)} className="h-11 w-full rounded-md border border-red-200 px-4 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">
                  {copy.cancelOrder}
                </button>
              )}
              <div className="flex items-center justify-between text-[12px] text-gray-500">
                <span>{copy.total}</span>
                <span className="font-mono tabular-nums">฿{order.total_amount.toLocaleString()}</span>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {order && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:hidden">
          <div className="grid grid-cols-[1fr_1.15fr] gap-2">
            <a href="#order-cart" className="flex h-12 flex-col justify-center rounded-md border border-gray-200 px-3 dark:border-gray-800">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{copy.total}</span>
              <span className="font-mono text-[16px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{order.total_amount.toLocaleString()}</span>
            </a>
            <button type="button" disabled={mobileActionDisabled} onClick={runMobilePrimaryAction} className="h-12 rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
              {mobileActionLabel}
            </button>
          </div>
        </div>
      )}

      {selectedMenu && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
          <div className="motion-bottom-sheet w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{selectedMenu.name}</h2>
              <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums">฿{selectedMenu.price.toLocaleString()}</p>
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.quantity}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="h-10 w-10 rounded-md border border-gray-200 text-lg font-semibold dark:border-gray-800">-</button>
                  <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} className="h-10 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 text-center text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                  <button type="button" onClick={() => setQuantity((current) => current + 1)} className="h-10 w-10 rounded-md border border-gray-200 text-lg font-semibold dark:border-gray-800">+</button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.note}</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button type="button" onClick={() => setSelectedMenu(null)} className="ui-press h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                {language === "th" ? "ยกเลิก" : "Cancel"}
              </button>
              <button type="button" disabled={submitting} onClick={addSelectedMenu} className="ui-press h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                {copy.add}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentOpen && bill && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
          <style jsx global>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #print-bill,
              #print-bill * {
                visibility: visible;
              }
              #print-bill {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                color: #111827;
                background: white;
              }
            }
          `}</style>
          <div className="motion-bottom-sheet max-h-[90vh] w-full max-w-lg overflow-auto rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
            <div id="print-bill" className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white">{copy.bill} #{bill.order.order_number}</h2>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{bill.order.table?.table_number ?? bill.order.table_id}</p>
                </div>
                <p className="font-mono text-xl font-semibold tabular-nums text-gray-900 dark:text-white">฿{bill.grand_total.toLocaleString()}</p>
              </div>
              <div className="mt-4 divide-y divide-gray-200 text-[12px] dark:divide-gray-800">
                {bill.items.map((item) => (
                  <div key={item.ID} className="flex justify-between gap-3 py-2">
                    <span>{item.quantity}x {item.menu_name}</span>
                    <span className="font-mono tabular-nums">฿{item.subtotal.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-[12px] dark:border-gray-800">
                <div className="flex justify-between"><span>{copy.total}</span><span className="font-mono tabular-nums">฿{bill.total_amount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>{copy.service} {bill.service_charge_enabled ? `${bill.service_charge_rate}%` : ""}</span><span className="font-mono tabular-nums">฿{bill.service_charge_amount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>{copy.vat} {bill.vat_enabled ? `${bill.vat_rate}%` : ""}</span><span className="font-mono tabular-nums">฿{bill.vat_amount.toLocaleString()}</span></div>
                <div className="flex justify-between pt-2 text-[15px] font-semibold"><span>{copy.grandTotal}</span><span className="font-mono tabular-nums">฿{bill.grand_total.toLocaleString()}</span></div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPaymentMethod("cash")} className={`h-10 rounded-md border text-[12px] font-semibold ${paymentMethod === "cash" ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900" : "border-gray-200 text-gray-600 dark:border-gray-800 dark:text-gray-300"}`}>{copy.cash}</button>
                <button type="button" onClick={() => setPaymentMethod("promptpay_qr")} className={`h-10 rounded-md border text-[12px] font-semibold ${paymentMethod === "promptpay_qr" ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900" : "border-gray-200 text-gray-600 dark:border-gray-800 dark:text-gray-300"}`}>{copy.qr}</button>
              </div>

              {paymentMethod === "cash" ? (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.received}</span>
                  <input type="number" min={0} value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                  <p className="mt-1 text-[12px] text-gray-500">{copy.change}: ฿{changeAmount.toLocaleString()}</p>
                </label>
              ) : (
                <div className="rounded-md border border-gray-200 p-3 text-center dark:border-gray-800">
                  {bill.promptpay_qr_image ? <Image src={bill.promptpay_qr_image} alt="PromptPay QR" width={176} height={176} unoptimized className="mx-auto h-44 w-44 rounded-md object-contain" /> : <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-md bg-gray-100 text-[12px] text-gray-500 dark:bg-gray-900">No QR</div>}
                  <p className="mt-2 text-[13px] font-semibold text-gray-900 dark:text-white">{bill.promptpay_name || copy.qr}</p>
                  <p className="font-mono text-lg font-semibold tabular-nums">฿{bill.grand_total.toLocaleString()}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button type="button" onClick={() => window.print()} className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.print}</button>
              <button type="button" onClick={() => setPaymentOpen(false)} className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{language === "th" ? "ยกเลิก" : "Cancel"}</button>
              <button type="button" disabled={submitting || (paymentMethod === "cash" && Number(receivedAmount || 0) < bill.grand_total)} onClick={confirmPayment} className="ui-press h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">{copy.confirmPayment}</button>
            </div>
          </div>
        </div>
      )}

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
                <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="min-h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button type="button" onClick={() => { setCancelOpen(false); setCancelReason(""); }} className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                {copy.keepOrder}
              </button>
              <button type="button" disabled={!cancelReason.trim() || submitting} onClick={cancelSelectedOrder} className="ui-press h-9 rounded-md bg-red-600 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {copy.confirmCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
