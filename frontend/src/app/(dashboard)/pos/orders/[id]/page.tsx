"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { playBeep } from "@/src/lib/browserAudio";
import { menuCategoryIds, menuOptionLimits } from "@/src/lib/menuUtils";
import { groupOrderItems, type OrderItemGroup } from "@/src/lib/orderItemGroups";
import { can } from "@/src/lib/rbac";
import { addOrderItem, cancelOrder, deleteOrderItem, getOrder, getOrderBill, payOrder, sendOrderToKitchen, updateOrderItem, updateOrderItemStatus } from "@/src/lib/order";
import { listCategories, listMenuItems } from "@/src/lib/menu";
import type { Category, MenuItem } from "@/src/types/menu";
import type { Bill, Order, OrderItem } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { Skeleton } from "@/src/components/shared/Skeleton";
import { useToast } from "@/src/components/shared/FeedbackProvider";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";

const terminalStatuses = ["completed", "cancelled"];

function orderLocationLabel(order: Order, language: "th" | "en") {
  if (order.order_type === "takeaway") {
    const base = language === "th" ? "กลับบ้าน" : "Takeaway";
    return order.customer_name?.trim() ? `${base} · ${order.customer_name.trim()}` : base;
  }
  return order.table?.display_label || order.table?.table_number || (order.table_id ? String(order.table_id) : "-");
}

function itemFulfillmentType(item: OrderItem) {
  return item.fulfillment_type === "takeaway" ? "takeaway" : "dine_in";
}

function fulfillmentLabel(value: "dine_in" | "takeaway", language: "th" | "en") {
  if (value === "takeaway") return language === "th" ? "กลับบ้าน" : "Takeaway";
  return language === "th" ? "ทานที่ร้าน" : "Dine-in";
}

function fulfillmentBadgeClass(value: "dine_in" | "takeaway") {
  return value === "takeaway"
    ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-200 dark:ring-cyan-900/60"
    : "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800";
}

type FulfillmentSection = {
  key: "dine_in" | "takeaway";
  groups: OrderItemGroup[];
  quantity: number;
  subtotal: number;
};

function fulfillmentSections(groups: OrderItemGroup[]): FulfillmentSection[] {
  return (["dine_in", "takeaway"] as const)
    .map((key) => {
      const sectionGroups = groups.filter((group) => itemFulfillmentType(group.firstItem) === key);
      return {
        key,
        groups: sectionGroups,
        quantity: sectionGroups.reduce((sum, group) => sum + group.quantity, 0),
        subtotal: sectionGroups.reduce((sum, group) => sum + group.subtotal, 0),
      };
    })
    .filter((section) => section.groups.length > 0);
}

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
  const [selectedFulfillment, setSelectedFulfillment] = useState<"dine_in" | "takeaway">("dine_in");
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
        back: "กลับไปหน้า POS",
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
        cancelBody: "ใช้เมื่อเปิดออเดอร์ผิดหรือยังไม่ได้ส่งเข้าครัว",
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
        back: "Back to POS",
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
        cancelBody: "Use this when the order was opened by mistake before sending to kitchen.",
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
  const noPaymentPermission = language === "th" ? "บัญชีนี้ไม่มีสิทธิ์รับเงิน" : "This account cannot take payment.";
  const servedToastTitle = language === "th" ? "เสิร์ฟรายการพร้อมทั้งหมดแล้ว" : "Ready items served";
  const paidToastTitle = language === "th" ? "รับเงินเรียบร้อยแล้ว" : "Payment recorded";
  const currentCartLabel = language === "th" ? "รายการรอบนี้" : "Current round";
  const fulfillmentTitle = language === "th" ? "รูปแบบรายการ" : "Item type";
  const dineInItemLabel = fulfillmentLabel("dine_in", language);
  const takeawayItemLabel = fulfillmentLabel("takeaway", language);
  const optionLimitLabel = (selected: number, minSelect: number, maxSelect: number) => {
    if (maxSelect <= 1) return selected ? (language === "th" ? "เลือกแล้ว" : "Selected") : (language === "th" ? "เลือก 1 อย่าง" : "Choose 1");
    const range = minSelect > 0 && minSelect !== maxSelect ? `${minSelect}-${maxSelect}` : String(maxSelect);
    return language === "th" ? `เลือก ${selected}/${range}` : `${selected}/${range} selected`;
  };
  const sectionMeta = (key: "dine_in" | "takeaway") => ({
    label: fulfillmentLabel(key, language),
  });
  const tableItemsLabel = order?.order_type === "takeaway"
    ? language === "th" ? "รายการทั้งหมดของออเดอร์" : "All order items"
    : language === "th" ? "รายการทั้งหมดของโต๊ะ" : "All table items";
  const viewAllItemsLabel = language === "th" ? "ดูรายการทั้งหมด" : "View all items";
  const sentItemsLabel = language === "th" ? "รายการที่ส่งแล้ว" : "Sent items";
  const isTerminal = order ? terminalStatuses.includes(order.status) : true;
  const hasPending = Boolean(order?.items?.some((item) => item.status === "pending"));
  const readyItems = order?.items?.filter((item) => item.status === "ready") ?? [];
  const hasReadyItems = readyItems.length > 0;
  const pendingGroupedOrderItems = useMemo(() => groupOrderItems((order?.items ?? []).filter((item) => item.status === "pending")), [order?.items]);
  const sentGroupedOrderItems = useMemo(() => groupOrderItems((order?.items ?? []).filter((item) => item.status !== "pending")), [order?.items]);
  const pendingFulfillmentSections = useMemo(() => fulfillmentSections(pendingGroupedOrderItems), [pendingGroupedOrderItems]);
  const sentFulfillmentSections = useMemo(() => fulfillmentSections(sentGroupedOrderItems), [sentGroupedOrderItems]);
  const pendingFulfillmentSummary = useMemo(() => ({
    quantity: pendingFulfillmentSections.reduce((sum, section) => sum + section.quantity, 0),
    subtotal: pendingFulfillmentSections.reduce((sum, section) => sum + section.subtotal, 0),
  }), [pendingFulfillmentSections]);
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
  const categoryOptions = useMemo(() => [
    { value: "all", label: copy.all },
    ...categories.map((category) => ({ value: String(category.ID), label: category.name })),
  ], [categories, copy.all]);
  const selectedOptionsTotal = selectedMenu?.option_groups?.reduce((sum, group) => {
    const selected = (group.options ?? []).filter((option) => selectedOptionIds.includes(option.ID));
    return sum + selected.reduce((optionSum, option) => optionSum + option.price_delta, 0);
  }, 0) ?? 0;
  const requiredOptionsMissing = Boolean(selectedMenu?.option_groups?.some((group) => {
    if (!group.is_active) return false;
    const { minSelect } = menuOptionLimits(group);
    if (minSelect <= 0) return false;
    const selectedCount = (group.options ?? []).filter((option) => option.is_active && selectedOptionIds.includes(option.ID)).length;
    return selectedCount < minSelect;
  }));

  const openMenuPicker = (item: MenuItem) => {
    const defaultOptionIds = (item.option_groups ?? []).flatMap((group) => {
      const { maxSelect } = menuOptionLimits(group);
      return (group.options ?? [])
        .filter((option) => option.is_active && option.is_default)
        .slice(0, maxSelect)
        .map((option) => option.ID);
    });
    setSelectedMenuClosing(false);
    setSelectedMenu(item);
    setSelectedOptionIds(defaultOptionIds);
    setSelectedFulfillment(order?.order_type === "takeaway" ? "takeaway" : "dine_in");
    setQuantity(1);
    setNote("");
  };

  const closeMenuPicker = () => {
    if (selectedMenuClosing) return;
    setSelectedMenuClosing(true);
    window.setTimeout(() => {
      setSelectedMenu(null);
      setSelectedOptionIds([]);
      setSelectedFulfillment(order?.order_type === "takeaway" ? "takeaway" : "dine_in");
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
  const allItemsBackdrop = useBackdropClose(closeAllItemsDrawer);
  const menuPickerBackdrop = useBackdropClose(closeMenuPicker);
  const paymentBackdrop = useBackdropClose(closePaymentModal);
  const cancelBackdrop = useBackdropClose(closeCancelModal);
  const modalScrollLocked = Boolean(allItemsOpen || selectedMenu || paymentOpen || cancelOpen);

  const toggleOption = (groupOptionIds: number[], optionId: number, minSelect: number, maxSelect: number) => {
    setSelectedOptionIds((current) => {
      const selectedInGroup = current.filter((id) => groupOptionIds.includes(id));
      const withoutGroup = current.filter((id) => !groupOptionIds.includes(id));
      if (selectedInGroup.includes(optionId)) {
        if (selectedInGroup.length <= minSelect) return current;
        return [...withoutGroup, ...selectedInGroup.filter((id) => id !== optionId)];
      }
      if (maxSelect <= 1) return [...withoutGroup, optionId];
      if (selectedInGroup.length >= maxSelect) return current;
      return [...withoutGroup, ...selectedInGroup, optionId];
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

  useEffect(() => {
    if (!modalScrollLocked) return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    const previousBodyStyles = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    const previousHtmlStyles = {
      overflow: html.style.overflow,
      overscrollBehavior: html.style.overscrollBehavior,
    };

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyStyles.overflow;
      body.style.paddingRight = previousBodyStyles.paddingRight;
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.width = previousBodyStyles.width;
      html.style.overflow = previousHtmlStyles.overflow;
      html.style.overscrollBehavior = previousHtmlStyles.overscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [modalScrollLocked]);

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
      const res = await addOrderItem(order.ID, { menu_id: selectedMenu.ID, quantity, note, fulfillment_type: selectedFulfillment, selected_option_ids: selectedOptionIds });
      closeMenuPicker();
      setQuantity(1);
      setNote("");
      setSelectedFulfillment(order.order_type === "takeaway" ? "takeaway" : "dine_in");
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
  const statusToneClass = (status: OrderItem["status"]) => {
    if (status === "pending") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300";
    if (status === "cooking") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300";
    if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300";
    if (status === "served") return "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300";
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300";
  };
  const hasPrimaryOrderAction = hasPending || hasReadyItems || order?.status === "served";
  const primaryActionLabel = hasPending ? copy.sendKitchen : hasReadyItems ? serveAllLabel : copy.close;
  const compactPrimaryActionLabel = hasPending
    ? language === "th" ? "ส่งครัว" : "Send"
    : hasReadyItems
      ? language === "th" ? "เสิร์ฟ" : "Serve"
      : language === "th" ? "รับเงิน" : "Pay";
  const mobileActionDisabled = submitting || isTerminal || (order?.status === "served" && !canPay);
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
    const statusBadges = (["pending", "cooking", "ready", "served", "cancelled"] as OrderItem["status"][])
      .map((status) => ({ status, quantity: group.statusQuantities[status] ?? 0 }))
      .filter(({ status, quantity }) => quantity && !(status === "pending" && group.pendingItems.length === group.quantity));

    return (
      <div key={group.key} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 text-[14px] font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-300">x{group.quantity}</span>
            </div>
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
            {statusBadges.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {statusBadges.map(({ status, quantity }) => (
                  <span key={status} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusToneClass(status)}`}>
                    {statusLabel(status)} x{quantity}
                  </span>
                ))}
              </div>
            ) : null}
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

  const renderFulfillmentSection = (section: FulfillmentSection, tone: "highlight" | "plain" = "plain") => {
    const meta = sectionMeta(section.key);

    return (
      <section key={section.key} className="space-y-2">
        <div className={`px-1 text-[12px] font-semibold ${tone === "highlight" ? "text-blue-900 dark:text-blue-100" : "text-gray-700 dark:text-gray-200"}`}>
          <span>{meta.label}</span>
        </div>
        <div className="space-y-2">
          {section.groups.map(renderOrderItemGroup)}
        </div>
      </section>
    );
  };

  const headerNoticeCount = (error ? 1 : 0) + (hasReadyItems ? 1 : 0);
  const posHeaderSpacerClass = headerNoticeCount === 0
    ? "h-[102px] lg:h-[56px]"
    : headerNoticeCount === 1
      ? "h-[144px] lg:h-[98px]"
      : "h-[186px] lg:h-[140px]";

  if (!canTake) return <PermissionDenied title={copy.denied} />;

  return (
    <div className="min-h-screen w-full bg-slate-50 pb-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="fixed inset-x-0 top-14 z-20 border-b border-gray-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:px-4 lg:left-[var(--sidebar-w)] lg:top-0 lg:px-5">
        <div className="grid gap-1.5 lg:grid-cols-[2.5rem_minmax(8rem,13rem)_minmax(12rem,1fr)_auto] lg:items-center">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-1.5 lg:contents">
            <button type="button" onClick={() => router.push("/pos/tables")} aria-label={copy.back} title={copy.back} className="ui-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-[border-color,background-color] hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900 lg:order-1">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {order && (
              <div className="flex min-w-0 items-center justify-end gap-1.5 lg:order-4">
                <button type="button" onClick={() => { setAllItemsClosing(false); setAllItemsOpen(true); }} aria-label={viewAllItemsLabel} className="ui-press h-10 min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-white px-2.5 text-[12px] font-semibold text-gray-700 transition-[border-color,background-color] hover:border-orange-200 hover:bg-orange-50/30 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-orange-900/60 dark:hover:bg-orange-950/20 lg:flex-none">
                  {`${orderLocationLabel(order, language)} · ${order.order_number} · ${language === "th" ? "รายการ" : "Items"} ${orderItemCount}`}
                </button>
                {hasPrimaryOrderAction && (
                  <button type="button" disabled={mobileActionDisabled} onClick={runMobilePrimaryAction} aria-label={primaryActionLabel} className="ui-press h-10 shrink-0 rounded-md bg-gray-900 px-2.5 text-[12px] font-semibold text-white transition-[background-color,opacity] hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200">
                    {compactPrimaryActionLabel}
                  </button>
                )}
              </div>
            )}
          </div>
          {order && (
            <div className="grid grid-cols-[minmax(7.5rem,10rem)_minmax(0,1fr)] gap-1.5 lg:contents">
              <ThemedSelect
                className="lg:order-2"
                value={categoryId === "all" ? "all" : String(categoryId)}
                onChange={(next) => setCategoryId(next === "all" ? "all" : Number(next))}
                options={categoryOptions}
              />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="h-10 min-w-0 rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 lg:order-3" />
            </div>
          )}
        </div>
        {error && <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        {hasReadyItems && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
            {copy.readyAlert}: {readyItems.length}
          </div>
        )}
      </div>
      <div aria-hidden="true" className={posHeaderSpacerClass} />

      {loading && !order ? (
        <div className="grid gap-4 px-3 py-4 sm:px-4 lg:px-5">
          <Skeleton className="h-[520px]" />
        </div>
      ) : order ? (
        <div className="px-3 py-3 sm:px-4 lg:px-5">
          <section className="min-w-0">
            <div className="grid auto-rows-max grid-cols-2 content-start items-start gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
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
                      className="aspect-[4/3] shrink-0 bg-gray-100 bg-cover bg-center dark:bg-gray-900"
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

        </div>
      ) : null}

      {allItemsOpen && order && (
        <div {...allItemsBackdrop} className={`${allItemsClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-3 backdrop-blur-sm sm:p-4`}>
          <div className={`${allItemsClosing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-gray-200 bg-slate-50 shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950 sm:max-h-[calc(100dvh-2rem)]`}>
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{orderLocationLabel(order, language)} · {order.order_number}</p>
                  <h2 className="mt-0.5 text-[16px] font-semibold text-gray-950 dark:text-white">{tableItemsLabel}</h2>
                </div>
                <button type="button" onClick={closeAllItemsDrawer} className="ui-press h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 transition-[background-color,border-color] hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
                  {language === "th" ? "ปิด" : "Close"}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {pendingGroupedOrderItems.length ? (
                <section className="rounded-md border border-blue-300 border-l-4 bg-blue-50/70 p-3 shadow-[0_1px_0_rgba(37,99,235,0.08)] dark:border-blue-800 dark:bg-blue-950/25">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[14px] font-bold text-blue-950 dark:text-blue-100">{currentCartLabel}</h3>
                      <p className="mt-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">{language === "th" ? "ยังไม่ส่งเข้าครัว" : "Not sent to kitchen yet"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-bold leading-5 text-blue-950 dark:text-blue-100">
                        {pendingFulfillmentSummary.quantity} {language === "th" ? "รายการ" : "items"}
                      </p>
                      <p className="font-mono text-[15px] font-extrabold leading-5 tabular-nums text-gray-950 dark:text-white">฿{pendingFulfillmentSummary.subtotal.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {pendingFulfillmentSections.map((section) => renderFulfillmentSection(section, "highlight"))}
                  </div>
                </section>
              ) : null}

              {sentGroupedOrderItems.length ? (
                <section className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="mb-3">
                    <div>
                      <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{sentItemsLabel}</h3>
                      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{language === "th" ? "ติดตามสถานะอาหารที่ส่งแล้ว" : "Track items already sent"}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {sentFulfillmentSections.map((section) => renderFulfillmentSection(section))}
                  </div>
                </section>
              ) : null}

              {!pendingGroupedOrderItems.length && !sentGroupedOrderItems.length ? (
                <div className="px-4 py-12 text-center text-[13px] text-gray-500">{copy.emptyCart}</div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="mr-auto min-w-24">
                  <p className="text-[10px] font-bold leading-4 text-gray-500 dark:text-gray-400">{copy.total}</p>
                  <p className="font-mono text-[16px] font-extrabold leading-5 tabular-nums text-gray-950 dark:text-white">฿{order.total_amount.toLocaleString()}</p>
                </div>
                {order.status === "served" && !canPay && (
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{noPaymentPermission}</p>
                )}
                {hasPending && (
                  <button type="button" disabled={submitting} onClick={() => runAction(async () => (await sendOrderToKitchen(order.ID)).data)} className="ui-press h-10 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                    {copy.sendKitchen}
                  </button>
                )}
                {hasReadyItems && (
                  <button type="button" disabled={submitting} onClick={() => serveReadyItems()} className="ui-press h-10 rounded-md border border-emerald-200 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                    {serveAllLabel}
                  </button>
                )}
                {order.status === "served" && (
                  <button type="button" disabled={submitting || !canPay} onClick={openPayment} className="ui-press h-10 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                    {copy.close}
                  </button>
                )}
                {canCancelFromPos && (
                  <button type="button" disabled={submitting} onClick={() => { setCancelClosing(false); setCancelOpen(true); }} className="h-10 rounded-md border border-red-200 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">
                    {copy.cancelOrder}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedMenu && (
        <div {...menuPickerBackdrop} className={`${selectedMenuClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-3 backdrop-blur-sm sm:p-4`}>
          <div className={`${selectedMenuClosing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100vh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950 sm:max-h-[calc(100vh-2rem)]`}>
            <div className="relative aspect-[4/3] rounded-t-md bg-gray-100 bg-cover bg-center dark:bg-gray-900" style={selectedMenu.image_url ? { backgroundImage: `url(${selectedMenu.image_url})` } : undefined}>
              <button type="button" aria-label={language === "th" ? "ปิด" : "Close"} onClick={closeMenuPicker} className="ui-press absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/70 bg-white/95 text-gray-700 shadow-md shadow-gray-950/15 hover:bg-white dark:border-gray-700 dark:bg-gray-950/90 dark:text-gray-200 dark:shadow-black/30">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              {!selectedMenu.image_url && <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-gray-400">{language === "th" ? "ไม่มีรูป" : "No image"}</div>}
            </div>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <h2 className="min-w-0 text-[15px] font-semibold text-gray-900 dark:text-white">{selectedMenu.name}</h2>
                <p className="shrink-0 text-right font-mono text-[16px] font-semibold tabular-nums">฿{(selectedMenu.price + selectedOptionsTotal).toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              {selectedMenu.option_groups?.length ? (
                <div className="space-y-3">
                  {selectedMenu.option_groups.filter((group) => group.is_active).map((group) => {
                    const options = (group.options ?? []).filter((option) => option.is_active);
                    const { minSelect, maxSelect } = menuOptionLimits(group);
                    const selectedCount = options.filter((option) => selectedOptionIds.includes(option.ID)).length;
                    return (
                      <div key={group.ID}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{group.name}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                              {optionLimitLabel(selectedCount, minSelect, maxSelect)}
                            </span>
                            {group.required && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">{copy.requiredOption}</span>}
                          </div>
                        </div>
                        <div className="grid gap-2">
                          {options.map((option) => {
                            const selected = selectedOptionIds.includes(option.ID);
                            const limitReached = maxSelect > 1 && selectedCount >= maxSelect && !selected;
                            return (
                              <button key={option.ID} type="button" disabled={limitReached} aria-pressed={selected} onClick={() => toggleOption(options.map((current) => current.ID), option.ID, minSelect, maxSelect)} className={`grid min-h-10 grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 text-left text-[12px] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900" : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"}`}>
                                <span>{option.name}</span>
                                <span className="font-mono tabular-nums">{option.price_delta ? `+฿${option.price_delta.toLocaleString()}` : ""}</span>
                              </button>
                            );
                          })}
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
              <div>
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{fulfillmentTitle}</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["dine_in", "takeaway"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelectedFulfillment(value)}
                      className={`h-10 rounded-md border px-3 text-[12px] font-semibold transition-colors ${
                        selectedFulfillment === value
                          ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                      }`}
                    >
                      {value === "takeaway" ? takeawayItemLabel : dineInItemLabel}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.note}</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
              </label>
            </div>
            <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button type="button" disabled={submitting || requiredOptionsMissing} onClick={addSelectedMenu} className="ui-press h-11 w-full rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                {copy.add}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentOpen && bill && (
        <div {...paymentBackdrop} className={`${paymentClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
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
          <div className={`${paymentClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} max-h-[90vh] w-full max-w-lg overflow-auto rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div id="print-bill" className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white">{copy.bill} #{bill.order.order_number}</h2>
                <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{orderLocationLabel(bill.order, language)}</p>
              </div>
              <div className="mt-4 divide-y divide-gray-200 text-[12px] dark:divide-gray-800">
                {bill.items.map((item) => (
                  <div key={item.ID} className="grid grid-cols-[1fr_auto] gap-3 py-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{item.quantity}x {item.menu_name}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${fulfillmentBadgeClass(itemFulfillmentType(item))}`}>
                          {fulfillmentLabel(itemFulfillmentType(item), language)}
                        </span>
                      </div>
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
        <div {...cancelBackdrop} className={`${cancelClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
          <div className={`${cancelClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
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
