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
import { useToast } from "@/src/components/shared/FeedbackProvider";

const terminalStatuses = ["completed", "cancelled"];

function menuCategoryIds(item: MenuItem) {
  const ids = new Set<number>();
  if (item.category_id) ids.add(item.category_id);
  for (const link of item.categories ?? []) {
    if (link.category_id) ids.add(link.category_id);
  }
  return Array.from(ids);
}

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

type OrderItemGroup = {
  key: string;
  firstItem: OrderItem;
  items: OrderItem[];
  quantity: number;
  subtotal: number;
  statusQuantities: Record<OrderItem["status"], number>;
  pendingItems: OrderItem[];
  readyItems: OrderItem[];
};

const groupOrderItems = (items: OrderItem[] = []) => {
  const groups = new Map<string, OrderItemGroup>();

  for (const item of items) {
    const optionKey = [...(item.selected_options ?? [])]
      .sort((first, second) => first.menu_option_id - second.menu_option_id)
      .map((option) => `${option.option_group_id}:${option.menu_option_id}:${option.price_delta}`)
      .join("|");
    const key = [item.menu_id, item.menu_name, item.unit_price, item.options_total, item.note ?? "", optionKey].join("::");
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
      existing.quantity += item.quantity;
      existing.subtotal += item.subtotal;
      existing.statusQuantities[item.status] = (existing.statusQuantities[item.status] ?? 0) + item.quantity;
      if (item.status === "pending") existing.pendingItems.push(item);
      if (item.status === "ready") existing.readyItems.push(item);
      continue;
    }

    groups.set(key, {
      key,
      firstItem: item,
      items: [item],
      quantity: item.quantity,
      subtotal: item.subtotal,
      statusQuantities: {
        pending: item.status === "pending" ? item.quantity : 0,
        cooking: item.status === "cooking" ? item.quantity : 0,
        ready: item.status === "ready" ? item.quantity : 0,
        served: item.status === "served" ? item.quantity : 0,
        cancelled: item.status === "cancelled" ? item.quantity : 0,
      },
      pendingItems: item.status === "pending" ? [item] : [],
      readyItems: item.status === "ready" ? [item] : [],
    });
  }

  return Array.from(groups.values()).sort((first, second) => {
    const firstUpdated = first.items.at(-1)?.UpdatedAt ?? first.items.at(-1)?.CreatedAt ?? "";
    const secondUpdated = second.items.at(-1)?.UpdatedAt ?? second.items.at(-1)?.CreatedAt ?? "";
    return secondUpdated.localeCompare(firstUpdated);
  });
};

const apiErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "";
  return String(error.response?.data?.error ?? "");
};

export default function PosOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const canTake = can(activeMembership, "take_order");
  const canPay = can(activeMembership, "take_payment");
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [selectedMenuClosing, setSelectedMenuClosing] = useState(false);
  const [allItemsOpen, setAllItemsOpen] = useState(false);
  const [allItemsClosing, setAllItemsClosing] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelClosing, setCancelClosing] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentClosing, setPaymentClosing] = useState(false);
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
        options: "ตัวเลือก",
        requiredOption: "ต้องเลือก",
        chooseRequiredOptions: "เลือกตัวเลือกให้ครบก่อนเพิ่มรายการ",
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
        options: "Options",
        requiredOption: "Required",
        chooseRequiredOptions: "Choose required options before adding.",
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
  const serveAllLabel = language === "th" ? "เสิร์ฟทั้งหมด" : "Serve all ready";
  const billLockedTitle = language === "th" ? "คิดเงินได้เมื่อเสิร์ฟครบแล้ว" : "Bill after all items are served";
  const billLockedDetail = language === "th" ? "ถ้ามีอาหารพร้อมแล้วให้กดเสิร์ฟก่อน แล้วปุ่มออกบิลจะขึ้นตรงนี้" : "Serve ready food first, then the bill button will appear here.";
  const noPaymentPermission = language === "th" ? "บัญชีนี้ไม่มีสิทธิ์รับเงิน" : "This account cannot take payment.";
  const servedToastTitle = language === "th" ? "เสิร์ฟรายการพร้อมทั้งหมดแล้ว" : "Ready items served";
  const paidToastTitle = language === "th" ? "รับเงินเรียบร้อยแล้ว" : "Payment recorded";
  const currentCartLabel = language === "th" ? "รายการรอบนี้" : "Current round";
  const tableItemsLabel = language === "th" ? "รายการทั้งหมดของโต๊ะ" : "All table items";
  const viewAllItemsLabel = language === "th" ? "ดูรายการทั้งหมด" : "View all items";
  const sentItemsLabel = language === "th" ? "รายการที่ส่งแล้ว" : "Sent items";
  const emptyCurrentCart = language === "th" ? "ยังไม่มีรายการในรอบนี้" : "No items in this round";
  const emptyCurrentCartHint = language === "th" ? "เลือกเมนูเพื่อเพิ่มเข้าตะกร้า หรือเปิดรายการทั้งหมดเพื่อดูอาหารที่ส่งครัวแล้ว" : "Add menu items here, or open all items to review food already sent to kitchen.";
  const isTerminal = order ? terminalStatuses.includes(order.status) : true;
  const hasPending = Boolean(order?.items?.some((item) => item.status === "pending"));
  const readyItems = order?.items?.filter((item) => item.status === "ready") ?? [];
  const hasReadyItems = readyItems.length > 0;
  const pendingGroupedOrderItems = useMemo(() => groupOrderItems((order?.items ?? []).filter((item) => item.status === "pending")), [order?.items]);
  const sentGroupedOrderItems = useMemo(() => groupOrderItems((order?.items ?? []).filter((item) => item.status !== "pending")), [order?.items]);
  const menuOrderQuantities = useMemo(() => {
    const quantities = new Map<number, number>();
    for (const item of order?.items ?? []) {
      if (item.status !== "pending") continue;
      quantities.set(item.menu_id, (quantities.get(item.menu_id) ?? 0) + item.quantity);
    }
    return quantities;
  }, [order?.items]);
  const canCancelFromPos = Boolean(order && order.status === "open");
  const filteredMenu = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (categoryId !== "all" && !menuCategoryIds(item).includes(categoryId)) return false;
      if (keyword && !item.name.toLowerCase().includes(keyword)) return false;
      return item.is_available;
    });
  }, [categoryId, menuItems, search]);
  const selectedOptionsTotal = selectedMenu?.option_groups?.reduce((sum, group) => {
    const selected = (group.options ?? []).filter((option) => selectedOptionIds.includes(option.ID));
    return sum + selected.reduce((optionSum, option) => optionSum + option.price_delta, 0);
  }, 0) ?? 0;
  const requiredOptionsMissing = Boolean(selectedMenu?.option_groups?.some((group) => {
    if (!group.is_active) return false;
    const minSelect = group.required ? Math.max(1, group.min_select || 0) : group.min_select || 0;
    if (minSelect <= 0) return false;
    const selectedCount = (group.options ?? []).filter((option) => option.is_active && selectedOptionIds.includes(option.ID)).length;
    return selectedCount < minSelect;
  }));

  const openMenuPicker = (item: MenuItem) => {
    const defaultOptionIds = (item.option_groups ?? []).flatMap((group) => (group.options ?? []).filter((option) => option.is_active && option.is_default).map((option) => option.ID));
    setSelectedMenuClosing(false);
    setSelectedMenu(item);
    setSelectedOptionIds(defaultOptionIds);
    setQuantity(1);
    setNote("");
  };

  const closeMenuPicker = () => {
    if (selectedMenuClosing) return;
    setSelectedMenuClosing(true);
    window.setTimeout(() => {
      setSelectedMenu(null);
      setSelectedOptionIds([]);
      setSelectedMenuClosing(false);
    }, 180);
  };

  const closeAllItemsDrawer = () => {
    if (allItemsClosing) return;
    setAllItemsClosing(true);
    window.setTimeout(() => {
      setAllItemsOpen(false);
      setAllItemsClosing(false);
    }, 180);
  };

  const closePaymentModal = () => {
    if (paymentClosing) return;
    setPaymentClosing(true);
    window.setTimeout(() => {
      setPaymentOpen(false);
      setPaymentClosing(false);
    }, 180);
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

  const toggleOption = (groupOptionIds: number[], optionId: number, maxSelect: number) => {
    setSelectedOptionIds((current) => {
      const withoutGroup = current.filter((id) => !groupOptionIds.includes(id));
      if (current.includes(optionId)) return withoutGroup;
      if (maxSelect <= 1) return [...withoutGroup, optionId];
      const currentInGroup = current.filter((id) => groupOptionIds.includes(id));
      if (currentInGroup.length >= maxSelect) return [...withoutGroup, ...currentInGroup.slice(1), optionId];
      return [...current, optionId];
    });
  };

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
    if (requiredOptionsMissing) {
      setError(copy.chooseRequiredOptions);
      return;
    }
    await runAction(async () => {
      const res = await addOrderItem(order.ID, { menu_id: selectedMenu.ID, quantity, note, selected_option_ids: selectedOptionIds });
      closeMenuPicker();
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
    closeCancelModal();
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
      setPaymentClosing(false);
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
      closePaymentModal();
      showToast({ title: paidToastTitle });
      return res.data;
    });
  };

  const serveReadyItems = async (itemsToServe = readyItems) => {
    if (!order || !itemsToServe.length) return;
    await runAction(async () => {
      let nextOrder = order;
      for (const item of itemsToServe) {
        const res = await updateOrderItemStatus(order.ID, item.ID, "served");
        nextOrder = res.data;
      }
      showToast({ title: servedToastTitle });
      return nextOrder;
    });
  };

  const changeAmount = bill ? Math.max(0, Number(receivedAmount || 0) - bill.grand_total) : 0;
  const orderItemCount = order?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const pendingItemCount = order?.items?.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const pendingTotal = order?.items?.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.subtotal, 0) ?? 0;
  const statusToneClass = (status: OrderItem["status"]) => {
    if (status === "pending") return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-300";
    if (status === "cooking") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300";
    if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300";
    if (status === "served") return "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300";
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300";
  };
  const mobileActionLabel = hasPending ? copy.sendKitchen : hasReadyItems ? serveAllLabel : order?.status === "served" ? copy.close : viewAllItemsLabel;
  const mobileActionDisabled = submitting || isTerminal;
  const runMobilePrimaryAction = () => {
    if (!order) return;
    if (hasPending) {
      void runAction(async () => (await sendOrderToKitchen(order.ID)).data);
      return;
    }
    if (hasReadyItems) {
      void serveReadyItems();
      return;
    }
    if (order.status === "served") {
      void openPayment();
      return;
    }
    setAllItemsClosing(false);
    setAllItemsOpen(true);
  };

  const renderOrderItemGroup = (group: OrderItemGroup) => {
    if (!order) return null;
    const item = group.firstItem;
    const singlePendingItem = group.pendingItems.length === 1 ? group.pendingItems[0] : null;

    return (
      <div key={group.key} className="p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-300">x{group.quantity}</span>
            </div>
            <p className="mt-1 text-[12px] text-gray-500">฿{item.unit_price.toLocaleString()}{group.quantity > 1 ? ` × ${group.quantity}` : ""}</p>
            {item.selected_options?.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
                {item.selected_options.map((option) => (
                  <span key={option.ID} className="rounded-md bg-gray-100 px-2 py-0.5 dark:bg-gray-900">
                    {option.group_name}: {option.option_name}{option.price_delta ? ` +฿${option.price_delta.toLocaleString()}` : ""}
                  </span>
                ))}
              </div>
            ) : null}
            {item.note && <p className="mt-1 text-[12px] text-gray-500">{item.note}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["pending", "cooking", "ready", "served", "cancelled"] as OrderItem["status"][]).map((status) => {
                const statusQuantity = group.statusQuantities[status] ?? 0;
                if (!statusQuantity) return null;
                return (
                  <span key={status} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusToneClass(status)}`}>
                    {statusLabel(status)} x{statusQuantity}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <p className="mr-auto font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white sm:mr-0">฿{group.subtotal.toLocaleString()}</p>
            {group.readyItems.length > 0 && (
              <button type="button" disabled={submitting} onClick={() => serveReadyItems(group.readyItems)} className="ui-press h-9 rounded-md border border-emerald-200 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                {copy.markServed}
              </button>
            )}
            {singlePendingItem && (
              <>
                <button type="button" disabled={submitting} onClick={() => bumpItem(singlePendingItem, singlePendingItem.quantity - 1)} className="ui-press h-9 w-9 rounded-md border border-gray-200 text-[16px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900">-</button>
                <span className="min-w-8 text-center font-mono text-[14px] font-semibold tabular-nums">{singlePendingItem.quantity}</span>
                <button type="button" disabled={submitting} onClick={() => bumpItem(singlePendingItem, singlePendingItem.quantity + 1)} className="ui-press h-9 w-9 rounded-md border border-gray-200 text-[16px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900">+</button>
                <button type="button" disabled={submitting} onClick={() => runAction(async () => (await deleteOrderItem(order.ID, singlePendingItem.ID)).data)} className="ui-press h-9 rounded-md border border-red-200 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">
                  {copy.remove}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!canTake) return <PermissionDenied title={copy.denied} />;

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50 px-3 py-3 pb-28 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 sm:pb-6 lg:px-8 lg:py-6">
      <div className="-mx-3 mb-3 border-b border-gray-200 bg-slate-50 px-3 pb-3 pt-1 dark:border-gray-800 dark:bg-gray-950 sm:mx-0 sm:mb-4 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <button type="button" onClick={() => router.push("/pos/tables")} className="ui-press h-11 w-fit rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
            {copy.back}
          </button>
          {order && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-white">{order.table?.table_number ?? order.table_id}</span>
              <span className="rounded-md bg-gray-900 px-3 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-gray-900">{order.order_number}</span>
            </div>
          )}
        </div>
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
        <div className="grid flex-1 items-start gap-4 lg:grid-cols-[1fr_380px]">
          <section className="min-w-0 rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 p-3 dark:border-gray-800">
              <div className="soft-scrollbar-hide min-w-0 flex snap-x gap-2 overflow-x-auto pb-2">
                <button type="button" onClick={() => setCategoryId("all")} className={`ui-press min-h-12 min-w-[72px] shrink-0 snap-start rounded-md px-4 text-[14px] font-semibold sm:min-h-9 sm:min-w-0 sm:px-3 sm:text-[12px] ${categoryId === "all" ? "bg-gray-900 text-white shadow-md shadow-gray-950/10 dark:bg-white dark:text-gray-900 dark:shadow-black/30" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"}`}>
                  {copy.all}
                </button>
                {categories.map((category) => (
                  <button key={category.ID} type="button" onClick={() => setCategoryId(category.ID)} className={`ui-press min-h-12 min-w-[92px] shrink-0 snap-start rounded-md px-4 text-[14px] font-semibold sm:min-h-9 sm:min-w-0 sm:px-3 sm:text-[12px] ${categoryId === category.ID ? "bg-gray-900 text-white shadow-md shadow-gray-950/10 dark:bg-white dark:text-gray-900 dark:shadow-black/30" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"}`}>
                    {category.name}
                  </button>
                ))}
              </div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="mt-2 h-12 w-full rounded-md border border-gray-200 bg-white px-3 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 sm:h-10 sm:text-[13px]" />
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredMenu.length ? filteredMenu.map((item) => {
                const orderedQuantity = menuOrderQuantities.get(item.ID) ?? 0;

                return (
                  <button key={item.ID} type="button" disabled={isTerminal || submitting} onClick={() => openMenuPicker(item)} className={`ui-press relative flex min-h-[214px] flex-col overflow-hidden rounded-md border bg-white text-left transition-[border-color,background-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-950 sm:hover:-translate-y-0.5 ${orderedQuantity > 0 ? "border-orange-300 shadow-[0_0_0_1px_rgba(249,115,22,0.18)] hover:bg-orange-50/30 dark:border-orange-700/70 dark:shadow-[0_0_0_1px_rgba(251,146,60,0.18)] dark:hover:bg-orange-900/10" : "border-gray-200 hover:border-orange-200 hover:bg-orange-50/20 dark:border-gray-800 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10"}`}>
                    {orderedQuantity > 0 && (
                      <span className="absolute right-2 top-2 z-10 rounded-md bg-orange-500 px-2 py-1 text-[11px] font-semibold text-white shadow-md shadow-orange-950/10 dark:bg-orange-400 dark:text-gray-950 dark:shadow-black/30">
                        {language === "th" ? "เพิ่มแล้ว" : "Added"} x{orderedQuantity}
                      </span>
                    )}
                    <div
                      className="aspect-[4/3] bg-gray-100 bg-cover bg-center dark:bg-gray-900"
                      style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                      aria-label={item.image_url ? `${language === "th" ? "รูปเมนู" : "Menu image"} ${item.name}` : undefined}
                    >
                      {!item.image_url && <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-gray-400">{language === "th" ? "ไม่มีรูป" : "No image"}</div>}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col border-t border-gray-100 p-3 dark:border-gray-800">
                      <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{item.name}</p>
                      <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{item.price.toLocaleString()}</p>
                      <p className="mt-2 truncate text-[11px] text-gray-400">{item.category?.name ?? ""}</p>
                    </div>
                  </button>
                );
              }) : (
                <div className="col-span-full px-4 py-12 text-center text-[13px] text-gray-500">{copy.noMenu}</div>
              )}
            </div>
          </section>

          <aside id="order-cart" className="hidden scroll-mt-28 flex-col rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:max-h-[calc(100vh-3rem)] lg:min-h-[420px] lg:overflow-hidden">
            <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{currentCartLabel}</h2>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">฿{pendingTotal.toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="w-fit rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                    {pendingItemCount} {language === "th" ? "รายการใหม่" : "new items"}
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    <button type="button" onClick={() => { setAllItemsClosing(false); setAllItemsOpen(true); }} className="ui-press h-11 w-full rounded-md border border-gray-200 px-4 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
                      {viewAllItemsLabel} ({orderItemCount})
                    </button>
                    {hasPending && (
                      <button type="button" disabled={submitting} onClick={() => runAction(async () => (await sendOrderToKitchen(order.ID)).data)} className="ui-press h-11 w-full rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                        {copy.sendKitchen}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-gray-800 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
              {pendingGroupedOrderItems.length ? pendingGroupedOrderItems.map((group) => {
                const item = group.firstItem;
                const singlePendingItem = group.pendingItems.length === 1 ? group.pendingItems[0] : null;

                return (
                  <div key={group.key} className="p-3">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                            x{group.quantity}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-gray-500">
                          ฿{item.unit_price.toLocaleString()}{group.quantity > 1 ? ` × ${group.quantity}` : ""}
                        </p>
                        {item.selected_options?.length ? (
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
                            {item.selected_options.map((option) => (
                              <span key={option.ID} className="rounded-md bg-gray-100 px-2 py-0.5 dark:bg-gray-900">
                                {option.group_name}: {option.option_name}{option.price_delta ? ` +฿${option.price_delta.toLocaleString()}` : ""}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {item.note && <p className="mt-1 text-[12px] text-gray-500">{item.note}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(["pending", "cooking", "ready", "served", "cancelled"] as OrderItem["status"][]).map((status) => {
                            const statusQuantity = group.statusQuantities[status] ?? 0;
                            if (!statusQuantity) return null;
                            return (
                              <span key={status} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusToneClass(status)}`}>
                                {statusLabel(status)} x{statusQuantity}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <p className="mr-auto font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white lg:mr-0">฿{group.subtotal.toLocaleString()}</p>
                        {group.readyItems.length > 0 && (
                          <button type="button" disabled={submitting} onClick={() => serveReadyItems(group.readyItems)} className="ui-press h-9 rounded-md border border-emerald-200 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                            {copy.markServed}
                          </button>
                        )}
                        {singlePendingItem && (
                          <>
                            <button type="button" disabled={submitting} onClick={() => bumpItem(singlePendingItem, singlePendingItem.quantity - 1)} className="ui-press h-9 w-9 rounded-md border border-gray-200 text-[16px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900">-</button>
                            <span className="min-w-8 text-center font-mono text-[14px] font-semibold tabular-nums">{singlePendingItem.quantity}</span>
                            <button type="button" disabled={submitting} onClick={() => bumpItem(singlePendingItem, singlePendingItem.quantity + 1)} className="ui-press h-9 w-9 rounded-md border border-gray-200 text-[16px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900">+</button>
                            <button type="button" disabled={submitting} onClick={() => runAction(async () => (await deleteOrderItem(order.ID, singlePendingItem.ID)).data)} className="ui-press h-9 rounded-md border border-red-200 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">
                              {copy.remove}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="px-4 py-12 text-center text-[13px] text-gray-500">
                  <p className="font-semibold text-gray-700 dark:text-gray-300">{emptyCurrentCart}</p>
                  <p className="mt-1 leading-5">{emptyCurrentCartHint}</p>
                </div>
              )}
            </div>

          </aside>
        </div>
      ) : null}

      {order && (
        <div className="fixed inset-x-3 bottom-3 z-30 rounded-md border border-gray-200 bg-white/95 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.2)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 dark:shadow-black/40 sm:hidden">
          <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-2">
            <button type="button" onClick={() => document.getElementById("order-cart")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="min-w-0 rounded-md border border-gray-200 px-3 py-2 text-left dark:border-gray-800">
              <span className="block text-[10px] font-medium text-gray-500 dark:text-gray-400">{currentCartLabel}</span>
              <span className="mt-0.5 block truncate font-mono text-[16px] font-semibold tabular-nums text-gray-900 dark:text-white">
                ฿{pendingTotal.toLocaleString()} · {pendingItemCount} {language === "th" ? "รายการ" : "items"}
              </span>
            </button>
            <button type="button" onClick={() => { setAllItemsClosing(false); setAllItemsOpen(true); }} className="h-full rounded-md border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-200">
              {language === "th" ? "ทั้งหมด" : "All"} {orderItemCount}
            </button>
          </div>
          <button type="button" disabled={mobileActionDisabled} onClick={runMobilePrimaryAction} className="h-12 w-full rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
            {mobileActionLabel}
          </button>
        </div>
      )}

      {allItemsOpen && order && (
        <div className={`${allItemsClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:justify-end sm:px-4`} onClick={closeAllItemsDrawer}>
          <div className={`${allItemsClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} flex max-h-[calc(100vh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950 sm:h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-2rem)]`} onClick={(event) => event.stopPropagation()}>
            <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{tableItemsLabel}</h2>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">฿{order.total_amount.toLocaleString()}</p>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{orderItemCount} {language === "th" ? "รายการทั้งหมด" : "items total"}</p>
                </div>
                <button type="button" onClick={closeAllItemsDrawer} className="ui-press h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                  {language === "th" ? "ปิด" : "Close"}
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {hasReadyItems && (
                  <button type="button" disabled={submitting} onClick={() => serveReadyItems()} className="ui-press h-11 rounded-md border border-emerald-200 px-4 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                    {serveAllLabel}
                  </button>
                )}
                {order.status === "served" && (
                  <button type="button" disabled={submitting || !canPay} onClick={openPayment} className="ui-press h-11 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                    {copy.close}
                  </button>
                )}
                {canCancelFromPos && (
                  <button type="button" disabled={submitting} onClick={() => { setCancelClosing(false); setCancelOpen(true); }} className="h-11 rounded-md border border-red-200 px-4 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">
                    {copy.cancelOrder}
                  </button>
                )}
              </div>
              {order.status !== "served" && !isTerminal && (
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
                  <p className="font-semibold text-gray-900 dark:text-white">{billLockedTitle}</p>
                  <p>{billLockedDetail}</p>
                </div>
              )}
              {order.status === "served" && !canPay && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                  {noPaymentPermission}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {pendingGroupedOrderItems.length ? (
                <section>
                  <div className="sticky top-0 z-10 border-b border-orange-200 bg-orange-50 px-3 py-2 text-[12px] font-semibold text-orange-800 dark:border-orange-900/50 dark:bg-orange-950 dark:text-orange-200">
                    {currentCartLabel} ({pendingItemCount})
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {pendingGroupedOrderItems.map(renderOrderItemGroup)}
                  </div>
                </section>
              ) : null}

              {sentGroupedOrderItems.length ? (
                <section>
                  <div className="sticky top-0 z-10 border-y border-gray-200 bg-gray-50 px-3 py-2 text-[12px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                    {sentItemsLabel} ({orderItemCount - pendingItemCount})
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {sentGroupedOrderItems.map(renderOrderItemGroup)}
                  </div>
                </section>
              ) : null}

              {!pendingGroupedOrderItems.length && !sentGroupedOrderItems.length ? (
                <div className="px-4 py-12 text-center text-[13px] text-gray-500">{copy.emptyCart}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {selectedMenu && (
        <div className={`${selectedMenuClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-3 backdrop-blur-sm sm:p-4`} onClick={closeMenuPicker}>
          <div className={`${selectedMenuClosing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100vh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950 sm:max-h-[calc(100vh-2rem)]`} onClick={(event) => event.stopPropagation()}>
            <div className="aspect-[4/3] rounded-t-md bg-gray-100 bg-cover bg-center dark:bg-gray-900" style={selectedMenu.image_url ? { backgroundImage: `url(${selectedMenu.image_url})` } : undefined}>
              {!selectedMenu.image_url && <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-gray-400">{language === "th" ? "ไม่มีรูป" : "No image"}</div>}
            </div>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{selectedMenu.name}</h2>
              <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums">฿{(selectedMenu.price + selectedOptionsTotal).toLocaleString()}</p>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              {selectedMenu.option_groups?.length ? (
                <div className="space-y-3">
                  {selectedMenu.option_groups.filter((group) => group.is_active).map((group) => {
                    const options = (group.options ?? []).filter((option) => option.is_active);
                    const maxSelect = Math.max(1, group.max_select || 1);
                    return (
                      <div key={group.ID}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{group.name}</span>
                          {group.required && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">{copy.requiredOption}</span>}
                        </div>
                        <div className="grid gap-2">
                          {options.map((option) => (
                            <button key={option.ID} type="button" onClick={() => toggleOption(options.map((current) => current.ID), option.ID, maxSelect)} className={`grid min-h-10 grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 text-left text-[12px] ${selectedOptionIds.includes(option.ID) ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900" : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"}`}>
                              <span>{option.name}</span>
                              <span className="font-mono tabular-nums">{option.price_delta ? `+฿${option.price_delta.toLocaleString()}` : ""}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
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
              <button type="button" onClick={closeMenuPicker} className="ui-press h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                {language === "th" ? "ยกเลิก" : "Cancel"}
              </button>
              <button type="button" disabled={submitting || requiredOptionsMissing} onClick={addSelectedMenu} className="ui-press h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                {copy.add}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentOpen && bill && (
        <div className={`${paymentClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={closePaymentModal}>
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
          <div className={`${paymentClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} max-h-[90vh] w-full max-w-lg overflow-auto rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
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
                  <div key={item.ID} className="grid grid-cols-[1fr_auto] gap-3 py-2">
                    <div>
                      <span>{item.quantity}x {item.menu_name}</span>
                      {item.selected_options?.length ? (
                        <div className="mt-0.5 space-y-0.5 text-[11px] text-gray-500">
                          {item.selected_options.map((option) => (
                            <p key={option.ID}>{option.group_name}: {option.option_name}{option.price_delta ? ` +฿${option.price_delta.toLocaleString()}` : ""}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
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
              <button type="button" onClick={closePaymentModal} className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{language === "th" ? "ยกเลิก" : "Cancel"}</button>
              <button type="button" disabled={submitting || (paymentMethod === "cash" && Number(receivedAmount || 0) < bill.grand_total)} onClick={confirmPayment} className="ui-press h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">{copy.confirmPayment}</button>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div className={`${cancelClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={closeCancelModal}>
          <div className={`${cancelClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
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
              <button type="button" onClick={closeCancelModal} className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
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
