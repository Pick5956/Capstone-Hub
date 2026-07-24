"use client";

import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, MapPin, ReceiptText, Search, ShoppingBag, Users, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { can } from "@/src/lib/rbac";
import { createOrder, listOrders, updateOrderItemStatus } from "@/src/lib/order";
import { orderPosHref } from "@/src/lib/orderNavigation";
import { createPosTableNavigationGuard } from "@/src/lib/posTableNavigation";
import { listTables, updateTableStatus } from "@/src/lib/table";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import type { Order, OrderItem } from "@/src/types/order";
import type { RestaurantTable, TableStatus } from "@/src/types/table";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { Skeleton } from "@/src/components/shared/Skeleton";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";
import DashboardAccountMenu from "@/src/components/shared/DashboardAccountMenu";
import RealtimeConnectionNotice from "@/src/components/shared/RealtimeConnectionNotice";
import { useOrderEvents } from "@/src/hooks/useOrderEvents";
import { useVisiblePolling } from "@/src/hooks/useVisiblePolling";

const activeOrderStatuses = ["open", "sent_to_kitchen", "cooking", "ready", "served"];
const tableRefreshIntervalMs = 60_000;
const tagBadgeClass = "border-2 border-gray-950 bg-white text-gray-950 shadow-none dark:border-white dark:bg-gray-950 dark:text-white";
type TableSheetMode = "open" | "reserved";

type ReadyTableSummary = {
  order: Order;
  tableLabel: string;
  readyCount: number;
  oldestReadyAt: string;
  items: OrderItem[];
  itemSummary: string;
};

const hasValidPhone = (value: string) => value.replace(/\D/g, "").length >= 9;

function orderLocationLabel(order: Order, tables: RestaurantTable[], language: "th" | "en") {
  if (order.order_type === "takeaway") {
    const base = language === "th" ? "กลับบ้าน" : "Takeaway";
    return order.customer_name?.trim() ? `${base} · ${order.customer_name.trim()}` : base;
  }
  const table = tables.find((item) => item.ID === order.table_id);
  return order.table?.display_label || order.table?.table_number || table?.display_label || table?.table_number || (order.table_id ? String(order.table_id) : "-");
}

function itemSummaryLabel(item: OrderItem, language: "th" | "en") {
  const prefix = item.fulfillment_type === "takeaway"
    ? language === "th" ? "[กลับบ้าน] " : "[Takeaway] "
    : "";
  return `${prefix}${item.quantity}x ${item.menu_name}`;
}

function tableAccentClass(status: TableStatus, readyCount: number) {
  if (readyCount > 0) return "bg-emerald-500";
  if (status === "inactive") return "bg-gray-400";
  if (status === "occupied") return "bg-amber-500";
  if (status === "reserved") return "bg-sky-500";
  return "bg-emerald-500";
}

function tableStatusPillClass(status: TableStatus, readyCount: number) {
  if (readyCount > 0) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-200 dark:ring-emerald-900/70";
  if (status === "inactive") return "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700";
  if (status === "occupied") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/35 dark:text-amber-200 dark:ring-amber-900/70";
  if (status === "reserved") return "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/35 dark:text-sky-200 dark:ring-sky-900/70";
  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-200 dark:ring-emerald-900/70";
}

export default function PosTablesPage() {
  const router = useRouter();
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canTake = can(activeMembership, "take_order");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [takeawayOpen, setTakeawayOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<TableSheetMode>("open");
  const [sheetClosing, setSheetClosing] = useState(false);
  const [customerCount, setCustomerCount] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [reservationName, setReservationName] = useState("");
  const [reservationPhone, setReservationPhone] = useState("");
  const [reservationDraftOpen, setReservationDraftOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [servingOrderId, setServingOrderId] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationPending, startNavigationTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheetError, setSheetError] = useState("");
  const refreshInFlight = useRef(false);
  const navigationGuardRef = useRef(createPosTableNavigationGuard());
  const navigationTransitionSeenRef = useRef(false);

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์รับออเดอร์",
        eyebrow: "รับออเดอร์",
        title: "เลือกโต๊ะ",
        subtitle: "แตะโต๊ะว่างเพื่อเปิดออเดอร์ หรือแตะโต๊ะที่ใช้งานเพื่อทำรายการต่อ",
        search: "ค้นหาโต๊ะ",
        table: "โต๊ะ",
        takeaway: "สั่งกลับบ้าน",
        openTakeaway: "เปิดออเดอร์กลับบ้าน",
        takeawayHelp: "ใช้สำหรับลูกค้าที่ไม่ได้นั่งโต๊ะ",
        customerName: "ชื่อลูกค้า (ไม่บังคับ)",
        customerNamePlaceholder: "เช่น คุณแนน",
        customerPhone: "เบอร์ลูกค้า (ไม่บังคับ)",
        customerPhonePlaceholder: "เช่น 081-234-5678",
        confirmTakeaway: "เปิดออเดอร์",
        noSearchResults: "ไม่พบโต๊ะที่ตรงกับคำค้นหา",
        openOrder: "เปิดออเดอร์",
        reserveTable: "จองไว้",
        confirmReservation: "ยืนยันจอง",
        reservationName: "ชื่อเล่นที่จอง",
        reservationNameOptional: "ชื่อเล่นที่จอง (ไม่บังคับ)",
        reservationNamePlaceholder: "เช่น คุณแนน",
        reservationPhone: "เบอร์ที่จอง",
        reservationPhonePlaceholder: "เช่น 081-234-5678",
        reservationPhoneRequired: "กรุณาใส่เบอร์ลูกค้าที่จองอย่างน้อย 9 หลัก",
        reservationInfo: "เบอร์จอง",
        acceptReservation: "รับลูกค้าเข้าโต๊ะ",
        cancelReservation: "ยกเลิกจอง",
        reservationCancelled: "ยกเลิกการจองแล้ว",
        customerCount: "จำนวนลูกค้า",
        note: "หมายเหตุ",
        cancel: "ยกเลิก",
        confirm: "เปิดโต๊ะ",
        free: "ว่าง",
        occupied: "ใช้งาน",
        reserved: "จอง",
        inactive: "ปิดใช้งาน",
        ready: "พร้อมเสิร์ฟ",
        readyBannerTitle: "อาหารพร้อมเสิร์ฟ",
        readyBannerHelp: "ดูรายการที่ครัวทำเสร็จและกดเสิร์ฟได้จากตรงนี้",
        readyItems: "รายการ",
        serveAll: "เสิร์ฟทั้งหมด",
        serving: "กำลังเสิร์ฟ...",
        openingTable: "กำลังเปิดโต๊ะ",
        openingTakeaway: "กำลังเปิดออเดอร์กลับบ้าน",
        noZone: "ไม่มีโซน",
        total: "ยอดรวม",
        seats: "ที่นั่ง",
        elapsed: "นาที",
        loadError: "โหลดผังโต๊ะไม่สำเร็จ",
        saveError: "เปิดออเดอร์ไม่สำเร็จ",
        reservedNotice: "โต๊ะนี้ถูกจองไว้ ยังเปิดออเดอร์จากหน้านี้ไม่ได้",
        inactiveNotice: "โต๊ะนี้ปิดใช้งานอยู่ เปิดออเดอร์ไม่ได้",
        reservedSuccess: "จองโต๊ะไว้แล้ว",
      }
    : {
        denied: "You do not have permission to take orders.",
        eyebrow: "Order taking",
        title: "Select table",
        subtitle: "Tap a free table to open an order, or continue an active table.",
        search: "Search tables",
        table: "Table",
        takeaway: "Takeaway",
        openTakeaway: "Open takeaway order",
        takeawayHelp: "Use this for customers who are not seated at a table.",
        customerName: "Customer name (optional)",
        customerNamePlaceholder: "For example, Nan",
        customerPhone: "Customer phone (optional)",
        customerPhonePlaceholder: "For example, 081-234-5678",
        confirmTakeaway: "Open order",
        noSearchResults: "No tables match your search.",
        openOrder: "Open order",
        reserveTable: "Reserve",
        confirmReservation: "Confirm",
        reservationName: "Reservation nickname",
        reservationNameOptional: "Reservation nickname (optional)",
        reservationNamePlaceholder: "For example, Nan",
        reservationPhone: "Reservation phone",
        reservationPhonePlaceholder: "For example, 081-234-5678",
        reservationPhoneRequired: "Enter the customer's phone number with at least 9 digits.",
        reservationInfo: "Reserved phone",
        acceptReservation: "Seat guests",
        cancelReservation: "Cancel reservation",
        reservationCancelled: "Reservation cancelled.",
        customerCount: "Customers",
        note: "Note",
        cancel: "Cancel",
        confirm: "Open table",
        free: "Free",
        occupied: "Active order",
        reserved: "Reserved",
        inactive: "Inactive",
        ready: "Ready to serve",
        readyBannerTitle: "Ready to serve",
        readyBannerHelp: "Review finished kitchen items and serve them from here.",
        readyItems: "items",
        serveAll: "Serve all",
        serving: "Serving...",
        openingTable: "Opening table",
        openingTakeaway: "Opening takeaway order",
        noZone: "No zone",
        total: "Total",
        seats: "seats",
        elapsed: "min",
        loadError: "Could not load table layout.",
        saveError: "Could not open order.",
        reservedNotice: "This table is reserved and cannot start an order yet.",
        inactiveNotice: "This table is inactive and cannot open orders.",
        reservedSuccess: "Table reserved.",
      };

  const inactiveNoticeLabel = copy.inactiveNotice;

  useEffect(() => {
    if (navigationPending) {
      navigationTransitionSeenRef.current = true;
      return;
    }
    if (!navigationTransitionSeenRef.current || !isNavigating) return;

    const resetTimer = window.setTimeout(() => {
      navigationTransitionSeenRef.current = false;
      navigationGuardRef.current.reset();
      setIsNavigating(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [isNavigating, navigationPending]);

  const navigateToOrder = useCallback((order: Order) => {
    if (!navigationGuardRef.current.tryStart(order.ID)) return;

    setIsNavigating(true);
    setError("");
    startNavigationTransition(() => router.push(orderPosHref(order)));
  }, [router, startNavigationTransition]);

  const notificationLabel = language === "th" ? "การแจ้งเตือน" : "Notifications";

  const activeOrderByTable = useMemo(() => {
    const map = new Map<number, Order>();
    orders
      .filter((order) => activeOrderStatuses.includes(order.status) && order.table_id)
      .forEach((order) => map.set(order.table_id as number, order));
    return map;
  }, [orders]);

  const readyTables = useMemo<ReadyTableSummary[]>(() => {
    return orders
      .filter((order) => activeOrderStatuses.includes(order.status))
      .map((order) => {
        const readyItems = order.items?.filter((item) => item.status === "ready") ?? [];
        const oldestReadyAt = readyItems.reduce<string>((oldest, item) => {
          const value = item.ready_at || item.UpdatedAt || item.CreatedAt || order.opened_at;
          return !oldest || new Date(value) < new Date(oldest) ? value : oldest;
        }, "");
        return {
          order,
          tableLabel: orderLocationLabel(order, tables, language),
          readyCount: readyItems.reduce((sum, item) => sum + item.quantity, 0),
          oldestReadyAt,
          items: readyItems,
          itemSummary: readyItems.map((item) => itemSummaryLabel(item, language)).join(" · "),
        };
      })
      .filter((item) => item.readyCount > 0)
      .sort((a, b) => new Date(a.oldestReadyAt || a.order.opened_at).getTime() - new Date(b.oldestReadyAt || b.order.opened_at).getTime());
  }, [language, orders, tables]);

  const readyCountByOrderId = useMemo(() => {
    const map = new Map<number, number>();
    readyTables.forEach((item) => map.set(item.order.ID, item.readyCount));
    return map;
  }, [readyTables]);

  const groupedTables = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const groups = new Map<string, { label: string; tables: RestaurantTable[] }>();
    tables.filter((table) => {
      if (!keyword) return true;
      return [
        table.table_number,
        table.display_label,
        table.table_zone?.name,
        table.zone,
        ...(table.tags?.map((tag) => tag.name) ?? []),
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
    }).forEach((table) => {
      const key = table.zone_id ? String(table.zone_id) : "none";
      if (!groups.has(key)) groups.set(key, { label: table.table_zone?.name || table.zone || copy.noZone, tables: [] });
      groups.get(key)?.tables.push(table);
    });
    return Array.from(groups.values());
  }, [copy.noZone, search, tables]);

  // When the restaurant has no zones at all, drop the zone chrome entirely so the
  // floor reads as a plain, sequential list instead of a single "No zone" bucket.
  const hasAnyZone = useMemo(() => tables.some((table) => table.zone_id), [tables]);

  const load = useCallback(async (showLoading = true) => {
    if (!canTake) return;
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [tableRes, orderRes] = await Promise.all([listTables(), listOrders()]);
      setTables(tableRes.data.tables);
      setOrders(orderRes.data.orders);
    } catch {
      setError(copy.loadError);
    } finally {
      if (showLoading) setLoading(false);
      refreshInFlight.current = false;
    }
  }, [canTake, copy.loadError]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [load]);
  const realtimeStatus = useOrderEvents(() => load(false), {
    enabled: canTake,
    restaurantId: activeMembership?.restaurant_id,
  });
  useVisiblePolling(() => load(false), {
    enabled: canTake,
    intervalMs: tableRefreshIntervalMs,
    runImmediately: false,
  });

  const openTakeawaySheet = () => {
    if (isNavigating) return;
    setNotice("");
    setSheetError("");
    setSelectedTable(null);
    setTakeawayOpen(true);
    setSheetMode("open");
    setSheetClosing(false);
    setCustomerCount(1);
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
    setReservationName("");
    setReservationPhone("");
    setReservationDraftOpen(false);
  };

  const openOrder = async () => {
    if (isNavigating || (!selectedTable && !takeawayOpen)) return;
    // Capture at call time to prevent race if sheet state changes mid-flight
    const capturedTable = selectedTable;
    const tableID = capturedTable?.ID;
    if (!takeawayOpen && !tableID) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await createOrder(takeawayOpen
        ? {
            order_type: "takeaway",
            customer_count: customerCount,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            note,
          }
        : {
            table_id: tableID,
            order_type: "dine_in",
            customer_count: customerCount,
            note,
          });
      navigateToOrder(res.data);
    } catch (error) {
      const message = apiErrorMessage(error);
      if (capturedTable && tableID && message.includes("table already has an open order")) {
        // Fetch with table_id filter to get the precise active order for this table
        const orderRes = await listOrders({ table_id: tableID });
        const activeOrder = orderRes.data.orders.find(
          (order) => order.table_id === tableID && activeOrderStatuses.includes(order.status)
        );
        if (activeOrder) {
          navigateToOrder(activeOrder);
          return;
        }
      }
      setError(message || copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTableClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (isNavigating) return;
    const tableId = Number(event.currentTarget.dataset.tableId);
    const table = tables.find((item) => item.ID === tableId);
    if (!table) return;
    setNotice("");
    setSheetError("");
    const activeOrder = activeOrderByTable.get(table.ID);
    if (activeOrder) {
      navigateToOrder(activeOrder);
      return;
    }
    if (table.status === "reserved") {
      setSelectedTable(table);
      setTakeawayOpen(false);
      setSheetMode("reserved");
      setSheetClosing(false);
      setReservationName(table.reservation_name ?? "");
      setReservationPhone(table.reservation_phone ?? "");
      setCustomerCount(Math.max(1, Math.min(table.capacity || 1, 6)));
      setCustomerName("");
      setCustomerPhone("");
      setNote("");
      setReservationDraftOpen(false);
      return;
    }
    if (table.status === "inactive") {
      setNotice(inactiveNoticeLabel);
      return;
    }
    setSelectedTable(table);
    setTakeawayOpen(false);
    setSheetMode("open");
    setSheetClosing(false);
    setCustomerCount(Math.max(1, Math.min(table.capacity || 1, 6)));
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
    setReservationName("");
    setReservationPhone("");
    setReservationDraftOpen(false);
  }, [activeOrderByTable, inactiveNoticeLabel, isNavigating, navigateToOrder, tables]);

  const closeOpenOrderSheet = () => {
    if (submitting || isNavigating || sheetClosing) return;
    setSheetClosing(true);
    window.setTimeout(() => {
      setSelectedTable(null);
      setTakeawayOpen(false);
      setSheetMode("open");
      setSheetClosing(false);
      setCustomerName("");
      setCustomerPhone("");
      setReservationName("");
      setReservationPhone("");
      setSheetError("");
      setReservationDraftOpen(false);
    }, 180);
  };
  const openOrderBackdrop = useBackdropClose(closeOpenOrderSheet);

  const reserveTable = async () => {
    if (!selectedTable || submitting || isNavigating) return;
    if (!reservationDraftOpen) {
      setReservationDraftOpen(true);
      setSheetError("");
      return;
    }
    if (!hasValidPhone(reservationPhone)) {
      setSheetError(copy.reservationPhoneRequired);
      return;
    }
    setSubmitting(true);
    setError("");
    setSheetError("");
    try {
      const res = await updateTableStatus(selectedTable.ID, "reserved", reservationPhone.trim(), reservationName.trim());
      setTables((current) => current.map((table) => table.ID === res.data.ID ? res.data : table));
      setNotice(copy.reservedSuccess);
      setSheetClosing(true);
      window.setTimeout(() => {
        setSelectedTable(null);
        setSheetMode("open");
        setSheetClosing(false);
        setReservationName("");
        setReservationPhone("");
        setReservationDraftOpen(false);
      }, 180);
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const acceptReservation = async () => {
    if (!selectedTable || submitting || isNavigating) return;
    setSubmitting(true);
    setError("");
    setSheetError("");
    try {
      const res = await updateTableStatus(selectedTable.ID, "free");
      setTables((current) => current.map((table) => table.ID === res.data.ID ? res.data : table));
      setSelectedTable(res.data);
      setSheetMode("open");
      setReservationName("");
      setReservationPhone("");
      setReservationDraftOpen(false);
      setCustomerCount(Math.max(1, Math.min(res.data.capacity || 1, 6)));
      setNote("");
    } catch (error) {
      setSheetError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async () => {
    if (!selectedTable || submitting || isNavigating) return;
    setSubmitting(true);
    setError("");
    setSheetError("");
    try {
      const res = await updateTableStatus(selectedTable.ID, "free");
      setTables((current) => current.map((table) => table.ID === res.data.ID ? res.data : table));
      setNotice(copy.reservationCancelled);
      setSheetClosing(true);
      window.setTimeout(() => {
        setSelectedTable(null);
        setSheetMode("open");
        setSheetClosing(false);
        setReservationName("");
        setReservationPhone("");
        setSheetError("");
        setReservationDraftOpen(false);
      }, 180);
    } catch (error) {
      setSheetError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const serveReadyItems = async (summary: ReadyTableSummary) => {
    if (!summary.items.length || servingOrderId || isNavigating) return;
    setServingOrderId(summary.order.ID);
    setError("");
    try {
      let nextOrder = summary.order;
      for (const item of summary.items) {
        const res = await updateOrderItemStatus(summary.order.ID, item.ID, "served");
        nextOrder = res.data;
      }
      setOrders((current) => current.map((order) => order.ID === nextOrder.ID ? nextOrder : order));
      void load(false);
    } catch (error) {
      setError(apiErrorMessage(error) || copy.saveError);
    } finally {
      setServingOrderId(null);
    }
  };

  if (!canTake) return <PermissionDenied title={copy.denied} />;

  return (
    <>
      {isNavigating ? (
        <div aria-hidden="true" className="fixed inset-0 z-[var(--z-modal)] cursor-wait bg-transparent" />
      ) : null}
      <div className="fixed inset-x-0 top-14 z-20 bg-slate-50/95 backdrop-blur dark:bg-gray-950/95 lg:left-[var(--sidebar-w)] lg:top-0 transition-[left] duration-300 ease-in-out">
        <div className="dashboard-shell-border-b grid gap-1.5 px-3 py-2 sm:px-4 lg:h-[var(--dashboard-shell-row)] lg:min-h-[var(--dashboard-shell-row)] lg:grid-cols-[minmax(15rem,22rem)_auto_minmax(0,1fr)_auto_auto] lg:items-center lg:px-5">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={isNavigating}
              placeholder={copy.search}
              className="h-10 w-full rounded-md border border-[#dfe3e8] bg-white py-2 pl-9 pr-3 text-[15px] outline-none placeholder:text-[15px] focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-[#253142] dark:bg-gray-900"
              aria-label={copy.search}
            />
          </label>
          <button
            type="button"
            disabled={isNavigating}
            onClick={openTakeawaySheet}
            className="ui-press inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dfe3e8] bg-white px-3 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-[#253142] dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
          >
            <ShoppingBag className="h-4 w-4" />
            {copy.takeaway}
          </button>
          <div aria-hidden="true" className="hidden lg:block" />
          <button
            type="button"
            aria-label={notificationLabel}
            disabled={isNavigating}
            className="ui-press hidden h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900 lg:inline-flex"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
          </button>
          <div className="hidden lg:block">
            <DashboardAccountMenu />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="h-[104px] lg:h-[62px]" />
      <OperationalPageShell
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
        showHeader={false}
      >

      <RealtimeConnectionNotice language={language} status={realtimeStatus} className="mb-4" />
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] font-medium text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300">{notice}</div>}
      {!loading && !isNavigating && readyTables.length ? (
        <section className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-100">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[14px] font-semibold">{copy.readyBannerTitle} · {readyTables.length} {language === "th" ? "ออเดอร์" : "orders"}</h2>
              <p className="mt-0.5 text-[12px] opacity-80">{copy.readyBannerHelp}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {readyTables.map((item) => (
              <div
                key={item.order.ID}
                className="rounded-md border border-emerald-200 bg-white p-3 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-gray-950 dark:text-emerald-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <button type="button" disabled={isNavigating} onClick={() => navigateToOrder(item.order)} className="min-w-0 text-left disabled:cursor-wait disabled:opacity-60">
                    <span className="block truncate text-[14px] font-semibold">{item.tableLabel}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] opacity-70">#{item.order.order_number}</span>
                  </button>
                  <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
                    {item.readyCount} {copy.readyItems}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-[12px] leading-5 opacity-85">{item.itemSummary}</p>
                <button
                  type="button"
                  disabled={isNavigating || servingOrderId === item.order.ID}
                  onClick={() => void serveReadyItems(item)}
                  className="ui-press mt-3 h-9 w-full rounded-md bg-emerald-700 px-3 text-[12px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
                >
                  {servingOrderId === item.order.ID ? copy.serving : copy.serveAll}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loading || isNavigating ? (
        <div
          role="status"
          aria-live="polite"
          aria-label={language === "th" ? "กำลังโหลด" : "Loading"}
          className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7"
        >
          {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-[118px]" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {groupedTables.length ? groupedTables.map((group) => (
            <section key={group.label}>
              {hasAnyZone && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-5 w-1 rounded-full bg-orange-500" aria-hidden="true" />
                  <h2 className="text-[20px] font-semibold leading-none text-gray-950 dark:text-white">{group.label}</h2>
                </div>
              )}
              <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
                {group.tables.map((table) => {
                  const order = activeOrderByTable.get(table.ID);
                  const busy = Boolean(order);
                  const status = busy ? "occupied" : table.status;
                  const readyCount = order ? readyCountByOrderId.get(order.ID) ?? 0 : 0;
                  const shownTags = table.tags?.slice(0, 2) ?? [];
                  const extraTags = Math.max((table.tags?.length ?? 0) - shownTags.length, 0);
                  const disabled = status === "reserved" || status === "inactive";
                  const statusLabel = readyCount
                    ? `${copy.ready} ${readyCount}`
                    : status === "occupied"
                      ? copy.occupied
                      : status === "reserved"
                        ? copy.reserved
                        : status === "inactive"
                          ? copy.inactive
                          : copy.free;
                  return (
                    <button
                      key={table.ID}
                      type="button"
                      data-table-id={table.ID}
                      disabled={isNavigating}
                      onClick={handleTableClick}
                      className={`ui-press group relative flex min-h-[118px] overflow-hidden rounded-md border border-gray-200 bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] dark:border-gray-800 dark:bg-gray-950 ${disabled ? "cursor-default opacity-70" : "hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:hover:border-gray-700"}`}
                    >
                      <span className={`w-1.5 shrink-0 ${tableAccentClass(status, readyCount)}`} />
                      <div className="flex min-w-0 flex-1 flex-col px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-950/35 dark:text-orange-300">
                                <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">{copy.table}</p>
                                <p className="truncate text-[19px] font-semibold leading-none tracking-tight text-gray-950 dark:text-white">{table.display_label || table.table_number}</p>
                              </div>
                            </div>
                            <p className="mt-2 flex min-w-0 items-center gap-1.5 truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
                              {hasAnyZone && (
                                <>
                                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{table.table_zone?.name || table.zone || copy.noZone}</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="shrink-0">{table.capacity} {copy.seats}</span>
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold leading-none ${tableStatusPillClass(status, readyCount)}`}>{statusLabel}</span>
                        </div>
                        <div className="mt-auto">
                          {order ? (
                            <div className="flex min-h-[22px] items-end justify-between gap-2">
                              <p className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[12px] font-semibold tabular-nums text-gray-950 dark:text-white">
                                <ReceiptText className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                                <span className="truncate">{order.order_number}</span>
                              </p>
                              <p className="shrink-0 text-[12px] font-semibold text-gray-600 dark:text-gray-300">฿{order.total_amount.toLocaleString()}</p>
                            </div>
                          ) : status === "reserved" && table.reservation_phone ? (
                            <p className="truncate text-[12px] font-semibold text-sky-700 dark:text-sky-200">{table.reservation_name ? `${table.reservation_name} · ` : ""}{copy.reservationInfo}: {table.reservation_phone}</p>
                          ) : (
                            <div className="flex min-h-[22px] flex-wrap items-start gap-1 overflow-hidden">
                              {shownTags.map((tag) => <span key={tag.ID} className={`rounded-[4px] px-2 py-0.5 text-[10px] font-extrabold leading-4 tracking-[0.01em] ${tagBadgeClass}`}>{tag.name}</span>)}
                              {extraTags > 0 ? <span className="rounded-[4px] border-2 border-gray-950 bg-white px-2 py-0.5 text-[10px] font-extrabold leading-4 text-gray-950 dark:border-white dark:bg-gray-950 dark:text-white">+{extraTags}</span> : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-[13px] font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
              {copy.noSearchResults}
            </div>
          )}
        </div>
      )}

      {(selectedTable || takeawayOpen) && (
        <div {...openOrderBackdrop} className={`${sheetClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm`}>
          <div className={`${sheetClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
                {takeawayOpen ? copy.openTakeaway : `${sheetMode === "reserved" ? copy.reserved : copy.openOrder} · ${selectedTable?.table_number ?? ""}`}
              </h2>
              {takeawayOpen && <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.takeawayHelp}</p>}
            </div>
            {sheetError && <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{sheetError}</div>}
            {sheetMode === "reserved" && selectedTable ? (
              <>
                <div className="space-y-3 p-4">
                  <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] font-semibold text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                    {selectedTable.reservation_name ? <span className="mb-1 block">{copy.reservationName}: {selectedTable.reservation_name}</span> : null}
                    {copy.reservationInfo}: {selectedTable.reservation_phone || "-"}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:grid-cols-3">
                  <button type="button" disabled={isNavigating} onClick={closeOpenOrderSheet} className="ui-press h-11 rounded-md border border-gray-200 px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900 sm:h-9 sm:text-[12px]">
                    {copy.cancel}
                  </button>
                  <button type="button" disabled={submitting || isNavigating} onClick={cancelReservation} className="ui-press h-11 rounded-md border border-sky-200 bg-sky-50 px-3 text-[13px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50 sm:h-9 sm:text-[12px]">
                    {copy.cancelReservation}
                  </button>
                  <button type="button" disabled={submitting || isNavigating} onClick={acceptReservation} className="ui-press col-span-2 h-11 rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900 sm:col-span-1 sm:h-9 sm:text-[12px]">
                    {copy.acceptReservation}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 p-4">
                  {takeawayOpen && (
                    <div className="grid gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.customerName}</span>
                        <input
                          value={customerName}
                          onChange={(event) => setCustomerName(event.target.value)}
                          placeholder={copy.customerNamePlaceholder}
                          className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 sm:h-10 sm:text-[13px]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.customerPhone}</span>
                        <input
                          value={customerPhone}
                          onChange={(event) => setCustomerPhone(event.target.value)}
                          inputMode="tel"
                          placeholder={copy.customerPhonePlaceholder}
                          className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 sm:h-10 sm:text-[13px]"
                        />
                      </label>
                    </div>
                  )}
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.customerCount}</span>
                    <div className="grid grid-cols-[56px_1fr_56px] overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                      <button type="button" onClick={() => setCustomerCount((current) => Math.max(1, current - 1))} disabled={customerCount <= 1} className="ui-press h-14 border-r border-gray-200 text-xl font-semibold text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                        -
                      </button>
                      <input type="number" min={1} value={customerCount} onChange={(event) => setCustomerCount(Math.max(1, Number(event.target.value) || 1))} className="h-14 min-w-0 border-0 bg-transparent px-2 text-center text-[22px] font-semibold tabular-nums text-gray-900 outline-none dark:text-white" />
                      <button type="button" onClick={() => setCustomerCount((current) => current + 1)} className="ui-press h-14 border-l border-gray-200 text-xl font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                        +
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setCustomerCount((current) => current + 5)} className="ui-press h-10 rounded-md border border-gray-200 bg-white text-[13px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                        +5
                      </button>
                      <button type="button" onClick={() => setCustomerCount((current) => current + 10)} className="ui-press h-10 rounded-md border border-gray-200 bg-white text-[13px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                        +10
                      </button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.note}</span>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 sm:min-h-20 sm:text-[13px]" />
                  </label>
                  {reservationDraftOpen && (
                    <div className="motion-reservation-panel rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/60 dark:bg-sky-950/25">
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-medium text-sky-900 dark:text-sky-100">{copy.reservationPhone}<span className="ml-0.5 text-red-600 dark:text-red-400">*</span></span>
                        <input
                          value={reservationPhone}
                          onChange={(event) => setReservationPhone(event.target.value)}
                          inputMode="tel"
                          autoFocus
                          placeholder={copy.reservationPhonePlaceholder}
                          className="h-11 w-full rounded-md border border-sky-200 bg-white px-3 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-sky-800 dark:bg-gray-950 sm:h-10 sm:text-[13px]"
                        />
                      </label>
                      <label className="mt-3 block">
                        <span className="mb-1.5 block text-[12px] font-medium text-sky-900 dark:text-sky-100">{copy.reservationNameOptional}</span>
                        <input
                          value={reservationName}
                          onChange={(event) => setReservationName(event.target.value)}
                          placeholder={copy.reservationNamePlaceholder}
                          className="h-11 w-full rounded-md border border-sky-200 bg-white px-3 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-sky-800 dark:bg-gray-950 sm:h-10 sm:text-[13px]"
                        />
                      </label>
                    </div>
                  )}
                </div>
                <div className={`${takeawayOpen ? "grid-cols-2" : "grid-cols-3"} grid gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800`}>
                  {!takeawayOpen && (
                    <button type="button" disabled={submitting || isNavigating} onClick={reserveTable} className={`${reservationDraftOpen ? "bg-sky-700 text-white hover:bg-sky-800 dark:bg-sky-300 dark:text-sky-950 dark:hover:bg-sky-200" : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"} ui-press h-11 rounded-md px-3 text-[13px] font-semibold disabled:opacity-50 sm:h-9 sm:text-[12px]`}>
                      {reservationDraftOpen ? copy.confirmReservation : copy.reserveTable}
                    </button>
                  )}
                  <button type="button" disabled={isNavigating} onClick={closeOpenOrderSheet} className="ui-press h-11 rounded-md border border-gray-200 px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900 sm:h-9 sm:text-[12px]">
                    {copy.cancel}
                  </button>
                  <button type="button" disabled={submitting || isNavigating} onClick={openOrder} className="ui-press inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-900 sm:h-9 sm:text-[12px]">
                    {submitting ? (takeawayOpen ? copy.openingTakeaway : copy.openingTable) : takeawayOpen ? copy.confirmTakeaway : copy.confirm}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </OperationalPageShell>
    </>
  );
}
