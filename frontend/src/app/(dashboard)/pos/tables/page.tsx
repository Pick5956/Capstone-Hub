"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { createOrder, listOrders } from "@/src/lib/order";
import { listTables } from "@/src/lib/table";
import type { Order } from "@/src/types/order";
import type { RestaurantTable } from "@/src/types/table";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { Skeleton } from "@/src/components/shared/Skeleton";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";

const activeOrderStatuses = ["open", "sent_to_kitchen", "cooking", "ready", "served"];

const apiErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "";
  return String(error.response?.data?.error ?? "");
};

export default function PosTablesPage() {
  const router = useRouter();
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canTake = can(activeMembership, "take_order");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [customerCount, setCustomerCount] = useState(1);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์รับออเดอร์",
        eyebrow: "POS",
        title: "เลือกโต๊ะ",
        subtitle: "แตะโต๊ะว่างเพื่อเปิดออเดอร์ หรือแตะโต๊ะที่ใช้งานเพื่อทำรายการต่อ",
        refresh: "รีเฟรช",
        openOrder: "เปิดออเดอร์",
        customerCount: "จำนวนลูกค้า",
        note: "หมายเหตุ",
        cancel: "ยกเลิก",
        confirm: "เปิดโต๊ะ",
        free: "ว่าง",
        occupied: "มีออเดอร์",
        reserved: "จอง",
        total: "ยอดรวม",
        elapsed: "นาที",
        loadError: "โหลดผังโต๊ะไม่สำเร็จ",
        saveError: "เปิดออเดอร์ไม่สำเร็จ",
        reservedNotice: "โต๊ะนี้ถูกจองไว้ ยังเปิดออเดอร์จากหน้านี้ไม่ได้",
      }
    : {
        denied: "You do not have permission to take orders.",
        eyebrow: "POS",
        title: "Select table",
        subtitle: "Tap a free table to open an order, or continue an active table.",
        refresh: "Refresh",
        openOrder: "Open order",
        customerCount: "Customers",
        note: "Note",
        cancel: "Cancel",
        confirm: "Open table",
        free: "Free",
        occupied: "Active order",
        reserved: "Reserved",
        total: "Total",
        elapsed: "min",
        loadError: "Could not load table layout.",
        saveError: "Could not open order.",
        reservedNotice: "This table is reserved and cannot be opened from POS yet.",
      };

  const activeOrderByTable = useMemo(() => {
    const map = new Map<number, Order>();
    orders.filter((order) => activeOrderStatuses.includes(order.status)).forEach((order) => map.set(order.table_id, order));
    return map;
  }, [orders]);

  const activeTableCount = tables.filter((table) => activeOrderByTable.has(table.ID)).length;
  const reservedTableCount = tables.filter((table) => table.status === "reserved").length;
  const freeTableCount = tables.length - activeTableCount - reservedTableCount;

  const load = async () => {
    if (!canTake) return;
    setLoading(true);
    setError("");
    try {
      const [tableRes, orderRes] = await Promise.all([listTables(), listOrders()]);
      setTables(tableRes.data.tables);
      setOrders(orderRes.data.orders);
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTake]);

  const openTable = async () => {
    if (!selectedTable) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await createOrder({ table_id: selectedTable.ID, customer_count: customerCount, note });
      router.push(`/pos/orders/${res.data.ID}`);
    } catch (error) {
      const message = apiErrorMessage(error);
      if (message.includes("table already has an open order")) {
        const orderRes = await listOrders();
        const activeOrder = orderRes.data.orders.find((order) => order.table_id === selectedTable.ID && activeOrderStatuses.includes(order.status));
        if (activeOrder) {
          router.push(`/pos/orders/${activeOrder.ID}`);
          return;
        }
      }
      setError(message || copy.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTableClick = (table: RestaurantTable) => {
    setNotice("");
    const activeOrder = activeOrderByTable.get(table.ID);
    if (activeOrder) {
      router.push(`/pos/orders/${activeOrder.ID}`);
      return;
    }
    if (table.status === "reserved") {
      setNotice(copy.reservedNotice);
      return;
    }
    setSelectedTable(table);
    setSheetClosing(false);
    setCustomerCount(Math.max(1, Math.min(table.capacity || 1, 6)));
    setNote("");
  };

  const closeOpenOrderSheet = () => {
    if (submitting || sheetClosing) return;
    setSheetClosing(true);
    window.setTimeout(() => {
      setSelectedTable(null);
      setSheetClosing(false);
    }, 180);
  };

  if (!canTake) return <PermissionDenied title={copy.denied} />;

  return (
    <OperationalPageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      actions={(
        <button type="button" onClick={load} className="ui-press h-11 rounded-md border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900 sm:h-10">
          {copy.refresh}
        </button>
      )}
      stats={[
        { label: copy.free, value: freeTableCount, tone: "good" },
        { label: copy.occupied, value: activeTableCount, tone: "warning" },
        { label: copy.reserved, value: reservedTableCount, tone: "info" },
      ]}
    >

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] font-medium text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300">{notice}</div>}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tables.map((table) => {
            const order = activeOrderByTable.get(table.ID);
            const busy = Boolean(order);
            const status = busy ? "occupied" : table.status;
            const cls = status === "occupied"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
              : status === "reserved"
                ? "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200";
            return (
              <button key={table.ID} type="button" onClick={() => handleTableClick(table)} className={`ui-press min-h-36 rounded-md border p-4 text-left sm:min-h-32 ${status !== "reserved" ? "hover:-translate-y-0.5 hover:shadow-sm" : "cursor-default opacity-70"} ${cls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-2xl font-semibold">{table.table_number}</p>
                    <p className="mt-1 text-[12px] opacity-75">{table.zone || "-"}</p>
                  </div>
                  <span className="rounded-md bg-white/70 px-2 py-1 text-[11px] font-semibold dark:bg-gray-950/35">{status === "occupied" ? copy.occupied : status === "reserved" ? copy.reserved : copy.free}</span>
                </div>
                {order ? (
                  <div className="mt-5">
                    <p className="font-mono text-[18px] font-semibold tabular-nums">{order.order_number}</p>
                    <p className="mt-1 text-[12px] opacity-80">{copy.total} ฿{order.total_amount.toLocaleString()}</p>
                  </div>
                ) : (
                  <p className="mt-7 text-[12px] opacity-75">{table.capacity} seats</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedTable && (
        <div className={`${sheetClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0`}>
          <button type="button" aria-label={copy.cancel} onClick={closeOpenOrderSheet} className="absolute inset-0 cursor-default" />
          <div className={`${sheetClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} relative w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.openOrder} · {selectedTable.table_number}</h2>
            </div>
            <div className="space-y-3 p-4">
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
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex sm:justify-end">
              <button type="button" onClick={closeOpenOrderSheet} className="ui-press h-11 rounded-md border border-gray-200 px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900 sm:h-9 sm:text-[12px]">
                {copy.cancel}
              </button>
              <button type="button" disabled={submitting} onClick={openTable} className="ui-press h-11 rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900 sm:h-9 sm:text-[12px]">
                {copy.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </OperationalPageShell>
  );
}
