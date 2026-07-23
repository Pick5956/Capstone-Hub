"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bell, CheckCircle2, Clock3, MapPin, Minus, Plus, Printer, ReceiptText, Search, UtensilsCrossed, WalletCards, X } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { playBeep } from "@/src/lib/browserAudio";
import { menuCategoryIds, menuOptionLimits } from "@/src/lib/menuUtils";
import { groupOrderItems, type OrderItemGroup } from "@/src/lib/orderItemGroups";
import { canCloseEmptyTableOrder } from "@/src/lib/orderNavigation";
import { printThermalReceipt } from "@/src/lib/thermalReceiptPrint";
import { can } from "@/src/lib/rbac";
import { addOrderItem, closeEmptyTableOrder, deleteOrderItem, getOrder, getOrderBill, payOrder, sendOrderToKitchen, updateOrderItem } from "@/src/lib/order";
import { listCategories, listMenuItems } from "@/src/lib/menu";
import type { Category, MenuItem } from "@/src/types/menu";
import type { Bill, Order, OrderItem, OrderPayment } from "@/src/types/order";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { Skeleton } from "@/src/components/shared/Skeleton";
import { useConfirm, useToast } from "@/src/components/shared/FeedbackProvider";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import DashboardAccountMenu from "@/src/components/shared/DashboardAccountMenu";
import RealtimeConnectionNotice from "@/src/components/shared/RealtimeConnectionNotice";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import { useOrderEvents } from "@/src/hooks/useOrderEvents";
import { useVisiblePolling } from "@/src/hooks/useVisiblePolling";
import ThermalReceipt from "@/src/components/orders/ThermalReceipt";

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

type FulfillmentSection = {
  key: "dine_in" | "takeaway";
  groups: OrderItemGroup[];
  quantity: number;
  subtotal: number;
};

type SentStatusSection = {
  status: OrderItem["status"];
  groups: OrderItemGroup[];
  quantity: number;
};

type SentFulfillmentSection = {
  key: "dine_in" | "takeaway";
  statuses: SentStatusSection[];
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

function sentFulfillmentStatusSections(items: OrderItem[]): SentFulfillmentSection[] {
  const statusOrder = ["ready", "cooking", "served", "cancelled"] as OrderItem["status"][];

  return (["dine_in", "takeaway"] as const)
    .map((key) => {
      const fulfillmentItems = items.filter((item) => itemFulfillmentType(item) === key);
      const statuses = statusOrder
        .map((status) => {
          const statusItems = fulfillmentItems.filter((item) => item.status === status);
          return {
            status,
            groups: groupOrderItems(statusItems),
            quantity: statusItems.reduce((sum, item) => sum + item.quantity, 0),
          };
        })
        .filter((section) => section.quantity > 0);
      return { key, statuses };
    })
    .filter((section) => section.statuses.length > 0);
}



export default function PosOrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const router = useRouter();
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canTake = can(activeMembership, "take_order");
  const canPay = can(activeMembership, "take_payment");
  const orderNumber = params.orderNumber?.toUpperCase() ?? "";
  const [order, setOrder] = useState<Order | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [selectedMenuClosing, setSelectedMenuClosing] = useState(false);

  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [selectedFulfillment, setSelectedFulfillment] = useState<"dine_in" | "takeaway">("dine_in");
  const [billViewOpen, setBillViewOpen] = useState(false);
  const [billViewClosing, setBillViewClosing] = useState(false);
  const [orderSummaryOpen, setOrderSummaryOpen] = useState(false);
  const [orderSummaryClosing, setOrderSummaryClosing] = useState(false);

  const [bill, setBill] = useState<Bill | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "promptpay_qr">("cash");
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [lastPayment, setLastPayment] = useState<OrderPayment | null>(null);

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
      tableLabel: "โต๊ะ",
      orderLabel: "ออเดอร์",
      itemsLabel: "รายการ",
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
      print: "พิมพ์บิล",
      confirmPayment: "ยืนยันรับเงิน",
      paymentMethod: "วิธีรับเงิน",
      allItems: "รายการทั้งหมด",
      closeEmptyTable: "ปิดโต๊ะ",
      closeEmptyTableTitle: "ปิดโต๊ะที่เปิดผิด?",
      closeEmptyTableBody: "โต๊ะนี้ยังไม่มีรายการอาหาร ระบบจะยกเลิกออเดอร์ว่างและเปลี่ยนโต๊ะกลับเป็นว่าง",
      keepTableOpen: "เปิดโต๊ะไว้",
      tableClosed: "ปิดโต๊ะแล้ว",
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
      tableLabel: "Table",
      orderLabel: "Order",
      itemsLabel: "Items",
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
      print: "Print bill",
      confirmPayment: "Confirm payment",
      paymentMethod: "Payment method",
      allItems: "All items",
      closeEmptyTable: "Close table",
      closeEmptyTableTitle: "Close this table opened by mistake?",
      closeEmptyTableBody: "This table has no items. The empty order will be cancelled and the table will become available again.",
      keepTableOpen: "Keep table open",
      tableClosed: "Table closed",
      remove: "Remove",
      total: "Total",
      loadError: "Could not load order.",
      saveError: "Could not complete the action.",
      noMenu: "No menu items.",
    };

  const paidToastTitle = language === "th" ? "รับเงินเรียบร้อยแล้ว" : "Payment recorded";
  const receiptCopy = language === "th"
    ? {
      printReceipt: "พิมพ์ใบเสร็จให้ลูกค้า",
      paymentComplete: "รับเงินเรียบร้อย",
      paymentCompleteHint: "พิมพ์ใบเสร็จส่งมอบให้ลูกค้าได้เลย",
    }
    : {
      printReceipt: "Print customer receipt",
      paymentComplete: "Payment recorded",
      paymentCompleteHint: "Print the receipt and hand it to the customer.",
    };
  const orderSummaryCopy = language === "th"
    ? {
      title: "ตรวจสอบรายการ",
      pending: "รายการรอบนี้",
      sent: "รายการที่ส่งแล้ว",
      empty: "ไม่มีรายการรอส่งครัว",
      close: "ปิด",
    }
    : {
      title: "Review order",
      pending: "Current round",
      sent: "Sent items",
      empty: "No items waiting for the kitchen.",
      close: "Close",
    };

  const fulfillmentTitle = language === "th" ? "รูปแบบรายการ" : "Item type";
  const dineInItemLabel = fulfillmentLabel("dine_in", language);
  const takeawayItemLabel = fulfillmentLabel("takeaway", language);
  const optionLimitLabel = (selected: number, minSelect: number, maxSelect: number) => {
    if (maxSelect <= 1) return selected ? (language === "th" ? "เลือกแล้ว" : "Selected") : (language === "th" ? "เลือก 1 อย่าง" : "Choose 1");
    const range = minSelect > 0 && minSelect !== maxSelect ? `${minSelect}-${maxSelect}` : String(maxSelect);
    return language === "th" ? `เลือก ${selected}/${range}` : `${selected}/${range} selected`;
  };
  const isTerminal = order ? terminalStatuses.includes(order.status) : true;
  const readyItems = order?.items?.filter((item) => item.status === "ready") ?? [];
  const hasReadyItems = readyItems.length > 0;
  const pendingItems = useMemo(() => (order?.items ?? []).filter((item) => item.status === "pending"), [order?.items]);
  const pendingItemCount = pendingItems.reduce((sum, item) => sum + item.quantity, 0);
  const pendingGroupedOrderItems = useMemo(() => groupOrderItems(pendingItems), [pendingItems]);
  const sentItems = useMemo(() => (order?.items ?? []).filter((item) => item.status !== "pending"), [order?.items]);
  const pendingFulfillmentSections = useMemo(() => fulfillmentSections(pendingGroupedOrderItems), [pendingGroupedOrderItems]);
  const sentStatusFulfillmentSections = useMemo(() => sentFulfillmentStatusSections(sentItems), [sentItems]);
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

  const openOrderSummary = () => {
    setOrderSummaryClosing(false);
    setOrderSummaryOpen(true);
  };
  const closeOrderSummary = () => {
    if (orderSummaryClosing) return;
    setOrderSummaryClosing(true);
    window.setTimeout(() => {
      setOrderSummaryOpen(false);
      setOrderSummaryClosing(false);
    }, 180);
  };
  const menuPickerBackdrop = useBackdropClose(closeMenuPicker);
  const closeBillModal = () => {
    if (billViewClosing) return;
    setBillViewClosing(true);
    window.setTimeout(() => {
      setBillViewOpen(false);
      setBill(null);
      setPaymentComplete(false);
      setLastPayment(null);
      setBillViewClosing(false);
    }, 180);
  };
  const paymentBackdrop = useBackdropClose(closeBillModal);
  const orderSummaryBackdrop = useBackdropClose(closeOrderSummary);
  const modalScrollLocked = Boolean(selectedMenu || billViewOpen || orderSummaryOpen);

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
    if (!canTake || !orderNumber) return;
    if (background && actionInFlightRef.current) return;
    if (!background) {
      setLoading(true);
      setError("");
    }
    try {
      const [orderRes, categoryRes, menuRes] = await Promise.all([getOrder(orderNumber), listCategories(), listMenuItems()]);
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
    const loadTimer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTake, orderNumber, order?.status]);
  const realtimeStatus = useOrderEvents(() => load({ background: true }), {
    enabled: canTake && Boolean(orderNumber) && !Boolean(order && terminalStatuses.includes(order.status)),
    restaurantId: activeMembership?.restaurant_id,
    eventFilter: { kind: "order", orderId: order?.ID },
  });
  useVisiblePolling(() => load({ background: true }), {
    enabled: canTake && Boolean(orderNumber) && !Boolean(order && terminalStatuses.includes(order.status)),
    intervalMs: 60_000,
    runImmediately: false,
  });

  useEffect(() => {
    if (!order?.items) return;
    const readyIds = new Set(order.items.filter((item) => item.status === "ready").map((item) => item.ID));
    const hasNewReady = [...readyIds].some((id) => !readyItemIdsRef.current.has(id));
    if (readyItemIdsRef.current.size && hasNewReady) playBeep(1046);
    readyItemIdsRef.current = readyIds;
  }, [order?.items]);


  useEffect(() => {
    if (!modalScrollLocked) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const scrollKeys = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);
    const isInsideModalScroll = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("[data-pos-modal-scroll]"));
    const restoreScroll = () => {
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
    };
    const preventOutsideScroll = (event: WheelEvent | TouchEvent) => {
      if (!isInsideModalScroll(event.target)) event.preventDefault();
    };
    const preventOutsideKeyScroll = (event: KeyboardEvent) => {
      if (scrollKeys.has(event.key) && !isInsideModalScroll(event.target)) event.preventDefault();
    };

    window.addEventListener("scroll", restoreScroll, { passive: true });
    document.addEventListener("wheel", preventOutsideScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", preventOutsideScroll, { capture: true, passive: false });
    document.addEventListener("keydown", preventOutsideKeyScroll, { capture: true });

    return () => {
      window.removeEventListener("scroll", restoreScroll);
      document.removeEventListener("wheel", preventOutsideScroll, { capture: true });
      document.removeEventListener("touchmove", preventOutsideScroll, { capture: true });
      document.removeEventListener("keydown", preventOutsideKeyScroll, { capture: true });
      window.scrollTo(scrollX, scrollY);
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

  const requestCloseEmptyTable = async () => {
    if (!order || !canCloseEmptyTableOrder(order)) return;
    const confirmed = await confirm({
      title: copy.closeEmptyTableTitle,
      message: copy.closeEmptyTableBody,
      confirmLabel: copy.closeEmptyTable,
      cancelLabel: copy.keepTableOpen,
      tone: "warning",
    });
    if (!confirmed) return;

    setSubmitting(true);
    actionInFlightRef.current = true;
    setError("");
    try {
      await closeEmptyTableOrder(order.ID);
      showToast({ title: copy.tableClosed });
      router.replace("/pos/tables");
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      actionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const sendToKitchen = async () => {
    if (!order || pendingItemCount === 0) return;
    await runAction(async () => {
      const res = await sendOrderToKitchen(order.ID);
      showToast({ title: language === "th" ? "ส่งเข้าครัวแล้ว" : "Sent to kitchen" });
      closeOrderSummary();
      return res.data;
    });
  };

  const adjustPendingGroup = async (group: OrderItemGroup, delta: -1 | 1) => {
    if (!order || !group.pendingItems.length) return;
    const item = group.pendingItems[0];
    await runAction(async () => {
      if (delta < 0 && item.quantity === 1) {
        return (await deleteOrderItem(order.ID, item.ID)).data;
      }
      return (await updateOrderItem(order.ID, item.ID, {
        quantity: item.quantity + delta,
        note: item.note,
      })).data;
    });
  };

  const statusLabel = (status: string) => (copy as Record<string, string>)[status] ?? status;
  const statusHeaderClass = (status: OrderItem["status"]) => {
    if (status === "cooking") return "bg-amber-50 text-amber-900 dark:bg-amber-950/35 dark:text-amber-200";
    if (status === "ready") return "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-200";
    if (status === "served") return "bg-gray-50 text-gray-800 dark:bg-gray-900/70 dark:text-gray-200";
    return "bg-red-50 text-red-900 dark:bg-red-950/35 dark:text-red-200";
  };
  const statusBorderClass = (status: OrderItem["status"]) => {
    if (status === "cooking") return "border-amber-200 dark:border-amber-900/70";
    if (status === "ready") return "border-emerald-200 dark:border-emerald-900/70";
    if (status === "served") return "border-gray-200 dark:border-gray-800";
    return "border-red-200 dark:border-red-900/70";
  };
  const statusHeaderIcon = (status: OrderItem["status"]) => {
    const Icon = status === "cooking" ? Clock3 : status === "ready" ? Bell : status === "cancelled" ? X : CheckCircle2;
    return <Icon className="h-4 w-4" aria-hidden="true" />;
  };
  const renderOrderItemGroup = (group: OrderItemGroup, variant: "card" | "row" = "card") => {
    const item = group.firstItem;
    const canAdjustQuantity = group.pendingItems.length === group.items.length;

    return (
      <div key={group.key} className={variant === "row" ? "bg-white px-3 py-3 dark:bg-gray-950" : "rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950"}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="min-w-0 text-[14px] font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
            {item.selected_options?.length ? <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(" · ")}</p> : null}
            {item.note ? <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{item.note}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <p className="mr-auto font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white sm:mr-0">฿{group.subtotal.toLocaleString()}</p>
            {canAdjustQuantity ? (
              <div className="inline-grid grid-cols-[2.25rem_2.5rem_2.25rem] overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
                <button type="button" disabled={submitting} onClick={() => { void adjustPendingGroup(group, -1); }} aria-label={group.quantity === 1 ? (language === "th" ? "ลบรายการ" : "Remove item") : (language === "th" ? "ลดจำนวน" : "Decrease quantity")} className="ui-press inline-flex h-9 items-center justify-center border-r border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"><Minus className="h-4 w-4" aria-hidden="true" /></button>
                <span className="inline-flex h-9 items-center justify-center font-mono text-[13px] font-semibold tabular-nums text-gray-900 dark:text-white">{group.quantity}</span>
                <button type="button" disabled={submitting} onClick={() => { void adjustPendingGroup(group, 1); }} aria-label={language === "th" ? "เพิ่มจำนวน" : "Increase quantity"} className="ui-press inline-flex h-9 items-center justify-center border-l border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"><Plus className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            ) : <span className="font-mono text-[12px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">x{group.quantity}</span>}
          </div>
        </div>
      </div>
    );
  };
  const renderSentStatusSection = (section: SentStatusSection) => (
    <section key={section.status} className={`overflow-hidden rounded-md border ${statusBorderClass(section.status)}`}>
      <div className={`flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 ${statusHeaderClass(section.status)}`}>
        <h4 className="inline-flex items-center gap-2 text-[15px] font-bold">
          {statusHeaderIcon(section.status)}
          {statusLabel(section.status)}
        </h4>
        <span className="font-mono text-[12px] font-bold tabular-nums">{section.quantity} {language === "th" ? "รายการ" : "items"}</span>
      </div>
      <div className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-950">{section.groups.map((group) => renderOrderItemGroup(group, "row"))}</div>
    </section>
  );
  const renderFulfillmentSection = (section: FulfillmentSection, tone: "highlight" | "plain" = "plain", showLabel = true) => (
    <section key={section.key} className="space-y-2">
      {showLabel ? <div className={`px-1 text-[12px] font-semibold ${tone === "highlight" ? "text-sky-900 dark:text-sky-100" : "text-gray-700 dark:text-gray-200"}`}>{fulfillmentLabel(section.key, language)}</div> : null}
      <div className="space-y-2">{section.groups.map((group) => renderOrderItemGroup(group))}</div>
    </section>
  );

  const loadBill = async () => {
    if (!order) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await getOrderBill(order.ID);
      const latestPayment = res.data.payments.at(-1) ?? null;
      setBill(res.data);
      setPaymentMethod(latestPayment?.method ?? "cash");
      setPaymentComplete(res.data.payment_status === "paid");
      setLastPayment(latestPayment);
      setBillViewClosing(false);
      setBillViewOpen(true);
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
        received_amount: bill.grand_total,
      });
      const latestPayment = res.data.payments?.at(-1) ?? null;
      showToast({ title: paidToastTitle });
      setLastPayment(latestPayment);
      setBill((current) => current ? { ...current, order: res.data, payment_status: "paid", payments: res.data.payments ?? current.payments } : current);
      setPaymentComplete(true);
      return res.data;
    });
  };

  const orderItemCount = order?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const canCloseTable = order ? canCloseEmptyTableOrder(order) : false;
  const notificationLabel = language === "th" ? "การแจ้งเตือน" : "Notifications";





  const headerNoticeCount = (error ? 1 : 0) + (hasReadyItems ? 1 : 0);
  const posHeaderSpacerClass = headerNoticeCount === 0
    ? "h-[102px] lg:h-[62px]"
    : headerNoticeCount === 1
      ? "h-[152px] lg:h-[112px]"
      : "h-[202px] lg:h-[162px]";

  if (!canTake) return <PermissionDenied title={copy.denied} />;

  return (
    <div className="min-h-screen w-full bg-slate-50 pb-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="fixed inset-x-0 top-14 z-20 bg-slate-50/95 backdrop-blur dark:bg-gray-950/95 lg:left-[var(--sidebar-w)] lg:top-0 transition-[left] duration-300 ease-in-out">
        <div className="dashboard-shell-border-b grid gap-1.5 px-3 py-2 sm:px-4 lg:h-[var(--dashboard-shell-row)] lg:min-h-[var(--dashboard-shell-row)] lg:grid-cols-[2.5rem_minmax(8rem,13rem)_minmax(12rem,0.7fr)_auto_minmax(0,1fr)_auto] lg:items-center lg:px-5">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-1.5 lg:contents">
            <button type="button" onClick={() => router.push("/pos/tables")} aria-label={copy.back} title={copy.back} className="ui-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#dfe3e8] bg-white text-gray-600 transition-[border-color,background-color] hover:border-[#d6dbe2] hover:bg-gray-50 dark:border-[#253142] dark:bg-gray-950 dark:text-gray-300 dark:hover:border-[#2c3848] dark:hover:bg-gray-900 lg:order-1">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {order && (
              <div className="flex min-w-0 items-center justify-end gap-1.5 lg:order-4">
                <button type="button" onClick={openOrderSummary} aria-label={orderSummaryCopy.title} className="ui-press flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-md border border-[#dfe3e8] bg-white text-left text-[12px] font-semibold text-gray-700 transition-[border-color,background-color] hover:border-gray-300 hover:bg-gray-50 dark:border-[#253142] dark:bg-gray-950 dark:text-gray-200 dark:hover:border-[#2c3848] dark:hover:bg-gray-900 lg:flex-none">
                  <span className="flex min-w-0 items-center gap-1.5 px-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden="true" />
                    <span className="hidden xl:inline">{copy.tableLabel}</span>
                    <span className="truncate">{orderLocationLabel(order, language)}</span>
                  </span>
                  <span className="h-4 w-px shrink-0 bg-gray-200 dark:bg-gray-800" aria-hidden="true" />
                  <span className="flex min-w-0 items-center gap-1.5 px-2">
                    <ReceiptText className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                    <span className="hidden xl:inline">{copy.orderLabel}</span>
                    <span className="truncate">{order.order_number}</span>
                  </span>
                  <span className="h-4 w-px shrink-0 bg-gray-200 dark:bg-gray-800" aria-hidden="true" />
                  <span className="flex shrink-0 items-center gap-1.5 px-2">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    <span className="hidden xl:inline">{copy.itemsLabel}</span>
                    <span className="font-mono tabular-nums">{orderItemCount}</span>
                  </span>
                </button>
                {canCloseTable ? (
                  <button type="button" disabled={submitting} onClick={() => { void requestCloseEmptyTable(); }} className="ui-press h-10 shrink-0 rounded-md border border-gray-300 bg-white px-3 text-[12px] font-semibold text-gray-700 transition-[border-color,background-color,opacity] hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-900">
                    {copy.closeEmptyTable}
                  </button>
                ) : null}
                {pendingItemCount === 0 && order.status === "served" ? (
                  <button type="button" disabled={submitting} onClick={() => { void loadBill(); }} className="ui-press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white transition-[background-color,opacity] hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200">
                    <WalletCards className="h-4 w-4" aria-hidden="true" />
                    {copy.close}
                  </button>
                ) : null}
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
              <div className="relative min-w-0 lg:order-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} aria-label={copy.search} className="h-10 w-full min-w-0 rounded-md border border-[#dfe3e8] bg-white pl-10 pr-3 text-[15px] outline-none placeholder:text-[15px] focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-[#253142] dark:bg-gray-900" />
              </div>
            </div>
          )}
          <div aria-hidden="true" className="hidden lg:order-5 lg:block" />
          {order && (
            <div className="hidden items-center gap-1.5 justify-self-end lg:order-6 lg:flex">
              <button
                type="button"
                aria-label={notificationLabel}
                className="ui-press inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                <Bell className="h-4 w-4" strokeWidth={2} />
              </button>
              <DashboardAccountMenu />
            </div>
          )}
        </div>
        {(error || hasReadyItems) && (
          <div className="space-y-2 px-3 py-2 sm:px-4 lg:px-5">
            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
            {hasReadyItems && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                {copy.readyAlert}: {readyItems.length}
              </div>
            )}
          </div>
        )}
      </div>
      <div aria-hidden="true" className={posHeaderSpacerClass} />

      {realtimeStatus === "reconnecting" ? (
        <div className="px-3 pt-3 sm:px-4 lg:px-5">
          <RealtimeConnectionNotice language={language} status={realtimeStatus} />
        </div>
      ) : null}

      {loading && !order ? (
        <div className="grid gap-4 px-3 py-4 sm:px-4 lg:px-5">
          <Skeleton className="h-[520px]" />
        </div>
      ) : order ? (
        // ── Menu grid (normal order-taking mode) ─────────────────────────────
        <div className="px-3 py-3 sm:px-4 lg:px-5">
          <section className="min-w-0">
            <div className="grid auto-rows-max grid-cols-2 content-start items-start gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {filteredMenu.length ? filteredMenu.map((item) => {
                const orderedQuantity = menuOrderQuantities.get(item.ID) ?? 0;

                return (
                  <button key={item.ID} type="button" disabled={isTerminal || submitting} onClick={() => openMenuPicker(item)} className={`ui-press relative flex min-h-[214px] flex-col overflow-hidden rounded-md border bg-white text-left transition-[border-color,background-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-950 sm:hover:-translate-y-0.5 ${orderedQuantity > 0 ? "border-orange-300 shadow-[0_0_0_1px_rgba(249,115,22,0.18)] hover:bg-orange-50/30 dark:border-orange-700/70 dark:shadow-[0_0_0_1px_rgba(251,146,60,0.18)] dark:hover:bg-orange-900/10" : "border-gray-200 hover:border-orange-200 hover:bg-orange-50/20 dark:border-gray-800 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10"}`}>
                    {orderedQuantity > 0 && (
                      <span className="absolute right-2 top-2 z-10 rounded-md bg-orange-500 px-2 py-1 text-[11px] font-semibold text-white shadow-md shadow-orange-950/10 dark:bg-orange-400 dark:text-orange-950 dark:shadow-black/30">
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
            <div data-pos-modal-scroll className="space-y-3 overflow-y-auto p-4">
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
                      className={`h-10 rounded-md border px-3 text-[12px] font-semibold transition-colors ${selectedFulfillment === value
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
      {orderSummaryOpen && order && (
        <div {...orderSummaryBackdrop} className={`${orderSummaryClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-3 backdrop-blur-sm sm:p-4`}>
          <div role="dialog" aria-modal="true" aria-labelledby="order-summary-title" className={`${orderSummaryClosing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-gray-200 bg-slate-50 shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950 sm:max-h-[calc(100vh-2rem)]`}>
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{orderLocationLabel(order, language)} · {order.order_number}</p>
                  <h2 id="order-summary-title" className="mt-0.5 text-[16px] font-semibold text-gray-950 dark:text-white">{orderSummaryCopy.title}</h2>
                </div>
                <button type="button" onClick={closeOrderSummary} className="ui-press h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">{orderSummaryCopy.close}</button>
              </div>
            </div>
            <div data-pos-modal-scroll className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {pendingGroupedOrderItems.length ? (
                <section className="rounded-md border border-sky-300 bg-sky-50/70 p-3 shadow-[0_1px_0_rgba(14,165,233,0.08)] ring-1 ring-sky-100 dark:border-sky-800 dark:bg-sky-950/25 dark:ring-sky-900/40">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[14px] font-bold text-sky-950 dark:text-sky-100">{orderSummaryCopy.pending}</h3>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-bold leading-5 text-sky-950 dark:text-sky-100">{pendingFulfillmentSummary.quantity} {language === "th" ? "รายการ" : "items"}</p>
                      <p className="font-mono text-[15px] font-extrabold leading-5 tabular-nums text-sky-950 dark:text-sky-50">฿{pendingFulfillmentSummary.subtotal.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="space-y-2">{pendingFulfillmentSections.map((section) => renderFulfillmentSection(section, "highlight", pendingFulfillmentSections.length > 1 || section.key === "takeaway" || order.order_type === "takeaway"))}</div>
                </section>
              ) : null}
              {sentItems.length ? (
                <section className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="mb-3">
                    <h3 className="text-[14px] font-bold text-gray-950 dark:text-white">{orderSummaryCopy.sent}</h3>
                  </div>
                  <div className="space-y-5">
                    {sentStatusFulfillmentSections.map((section) => (
                      <section key={section.key} className="space-y-3.5">
                        {sentStatusFulfillmentSections.length > 1 || section.key === "takeaway" || order.order_type === "takeaway" ? <h4 className="px-1 text-[13px] font-bold text-gray-800 dark:text-gray-100">{fulfillmentLabel(section.key, language)}</h4> : null}
                        <div className="space-y-3">{section.statuses.map(renderSentStatusSection)}</div>
                      </section>
                    ))}
                  </div>
                </section>
              ) : null}
              {!pendingGroupedOrderItems.length && !sentItems.length ? <p className="px-4 py-12 text-center text-[13px] text-gray-500">{orderSummaryCopy.empty}</p> : null}
            </div>
            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="mr-auto min-w-0">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{copy.total}</p>
                <p className="font-mono text-[16px] font-extrabold tabular-nums text-gray-950 dark:text-white">฿{order.total_amount.toLocaleString()}</p>
              </div>
              {pendingItemCount > 0 && <button type="button" disabled={submitting || isTerminal} onClick={() => { void sendToKitchen(); }} className="ui-press h-10 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900">{copy.sendKitchen}</button>}
              </div>
            </div>
          </div>
        </div>
      )}
      {billViewOpen && bill && (() => {
        const billGroups = groupOrderItems(bill.items);
        const billSections = fulfillmentSections(billGroups);
        const billItemCount = billGroups.reduce((sum, group) => sum + group.quantity, 0);

        const renderBillGroup = (group: OrderItemGroup) => {
          const item = group.firstItem;
          return (
            <div data-bill-item key={group.key} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
                  {item.selected_options?.length ? <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(" · ")}</p> : null}
                  {item.note ? <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{item.note}</p> : null}
                </div>
                <div className="text-right">
                  <p className="font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{group.subtotal.toLocaleString()}</p>
                  <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">x{group.quantity}</p>
                </div>
              </div>
            </div>
          );
        };

        return (
          <div data-print-overlay {...paymentBackdrop} className={`${billViewClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-3 backdrop-blur-sm sm:p-4`}>
            <style jsx global>{`
              @media print {
                #print-bill { position: static !important; width: 48mm !important; margin: 0 auto !important; padding: 3mm 0 !important; color: #111827; background: white; display: block !important; height: auto !important; max-height: none !important; overflow: visible !important; transform: none !important; }
                #print-bill [data-receipt-scroll] { overflow: visible !important; }
                #print-bill [data-receipt-section] { display: block !important; }
                #print-bill .dark\\:text-white, #print-bill .dark\\:text-gray-300, #print-bill .dark\\:text-gray-400 { color: #111827 !important; }
                #print-bill .dark\\:bg-gray-950 { background: #fff !important; }
                #print-bill .dark\\:border-gray-800 { border-color: #d1d5db !important; }
                #print-bill [data-screen-only] { display: none !important; }
                #print-bill [data-screen-receipt] { display: none !important; }
                #print-bill [data-print-only] { display: block !important; }
                #print-bill [data-bill-item] { border: 0 !important; border-bottom: 1px solid #e5e7eb !important; border-radius: 0 !important; padding: 2mm 0 !important; }
              }
            `}</style>
            <div data-print-dialog role="dialog" aria-modal="true" aria-labelledby="bill-view-title" className={`${billViewClosing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-gray-200 bg-slate-50 shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950 sm:max-h-[calc(100vh-2rem)]`}>
              <div id="print-bill" className="flex min-h-0 flex-1 flex-col">
                <div data-screen-receipt className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
                  <div data-screen-only className="min-w-0">
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{orderLocationLabel(bill.order, language)} · {bill.order.order_number}</p>
                    <h2 id="bill-view-title" className="mt-0.5 text-[16px] font-semibold text-gray-950 dark:text-white">{copy.close}</h2>
                  </div>
                  <div data-print-only className="hidden">
                    <h2 className="text-[16px] font-semibold text-gray-900">{copy.bill} #{bill.order.order_number}</h2>
                    <p className="mt-0.5 text-[12px] text-gray-600">{orderLocationLabel(bill.order, language)}</p>
                  </div>
                  <button data-screen-only type="button" onClick={closeBillModal} className="ui-press h-9 shrink-0 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">{orderSummaryCopy.close}</button>
                </div>
                <div data-screen-receipt data-receipt-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                  <section className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{copy.allItems}</h3>
                      <p className="font-mono text-[12px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">{billItemCount} {language === "th" ? "รายการ" : "items"}</p>
                    </div>
                    <div className="space-y-3">
                      {billSections.map((section) => (
                        <div data-receipt-section key={section.key} className="space-y-2">
                          {billSections.length > 1 || section.key === "takeaway" || bill.order.order_type === "takeaway" ? <p className="px-1 text-[12px] font-semibold text-gray-700 dark:text-gray-200">{fulfillmentLabel(section.key, language)}</p> : null}
                          <div className="space-y-2">
                            {section.groups.map(renderBillGroup)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <div data-screen-receipt className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 text-[12px] dark:border-gray-800 dark:bg-gray-950 sm:px-5">
                  <div className="space-y-1.5 text-gray-600 dark:text-gray-300">
                    <div className="flex justify-between gap-4"><span>{copy.total}</span><span className="font-mono tabular-nums text-gray-900 dark:text-white">฿{bill.total_amount.toLocaleString()}</span></div>
                    <div className="flex justify-between gap-4"><span>{copy.service} {bill.service_charge_enabled ? `${bill.service_charge_rate}%` : ""}</span><span className="font-mono tabular-nums text-gray-900 dark:text-white">฿{bill.service_charge_amount.toLocaleString()}</span></div>
                    <div className="flex justify-between gap-4"><span>{copy.vat} {bill.vat_enabled ? `${bill.vat_rate}%` : ""}</span><span className="font-mono tabular-nums text-gray-900 dark:text-white">฿{bill.vat_amount.toLocaleString()}</span></div>
                    <div className="mt-2 flex items-end justify-between gap-4 border-t border-gray-200 pt-2.5 dark:border-gray-800">
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{copy.grandTotal}</span>
                      <span className="font-mono text-[20px] font-extrabold tabular-nums text-gray-950 dark:text-white">฿{bill.grand_total.toLocaleString()}</span>
                    </div>
                    {paymentComplete && lastPayment ? (
                      <div className="mt-2 space-y-1.5 border-t border-dashed border-gray-300 pt-2.5 dark:border-gray-700">
                        <div className="flex justify-between gap-4"><span>{copy.paymentMethod}</span><span className="font-semibold text-gray-900 dark:text-white">{lastPayment.method === "cash" ? copy.cash : copy.qr}</span></div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <ThermalReceipt bill={bill} language={language} locationLabel={orderLocationLabel(bill.order, language)} restaurant={activeMembership?.restaurant} />
              </div>

              {!paymentComplete ? (
                <div className="shrink-0 space-y-3 border-t border-gray-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-gray-950 sm:px-4">
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">{copy.paymentMethod}</p>
                    <div className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-md border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-950 sm:w-auto sm:min-w-[220px]">
                      <button type="button" onClick={() => setPaymentMethod("cash")} className={`h-9 rounded-[4px] px-3 text-[12px] font-semibold ${paymentMethod === "cash" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"}`}>{copy.cash}</button>
                      <button type="button" onClick={() => setPaymentMethod("promptpay_qr")} className={`h-9 rounded-[4px] px-3 text-[12px] font-semibold ${paymentMethod === "promptpay_qr" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"}`}>{copy.qr}</button>
                    </div>
                  </div>
                  {paymentMethod === "promptpay_qr" ? (
                    <div className="rounded-md border border-gray-200 bg-white p-3 text-center dark:border-gray-800 dark:bg-gray-950">
                      {bill.promptpay_qr_image ? <Image src={bill.promptpay_qr_image} alt="PromptPay QR" width={176} height={176} unoptimized className="mx-auto h-44 w-44 rounded-md object-contain" /> : <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-md bg-gray-100 text-[12px] text-gray-500 dark:bg-gray-900">No QR</div>}
                      <p className="mt-2 text-[13px] font-semibold text-gray-900 dark:text-white">{bill.promptpay_name || copy.qr}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
                {paymentComplete ? (
                  <div className="mr-auto flex min-w-0 items-center gap-2 text-[12px] text-emerald-700 dark:text-emerald-400">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span><strong>{receiptCopy.paymentComplete}</strong><span className="hidden sm:inline"> · {receiptCopy.paymentCompleteHint}</span></span>
                  </div>
                ) : null}
                <button type="button" onClick={() => printThermalReceipt("print-bill")} className={paymentComplete ? "ui-press inline-flex h-10 items-center gap-2 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200" : "h-10 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"}>{paymentComplete ? <><Printer className="h-4 w-4" aria-hidden="true" />{receiptCopy.printReceipt}</> : copy.print}</button>
                {!paymentComplete ? <button type="button" disabled={submitting || !canPay} onClick={confirmPayment} className="ui-press h-10 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">{copy.confirmPayment}</button> : null}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
