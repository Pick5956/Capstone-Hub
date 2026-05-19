"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  LayoutGrid,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { kitchenQueue, listOrders } from "@/src/lib/order";
import { listTables } from "@/src/lib/table";
import type { Order } from "@/src/types/order";
import type { RestaurantTable } from "@/src/types/table";

type LaneStatus = "delayed" | "cooking" | "ready";
type FloorStatus = "occupied" | "available" | "reserved";
type FloorTable = {
  id: string;
  status: FloorStatus;
  guests?: number;
  mins?: number;
  zone?: string;
};
type KitchenTicket = {
  id: number;
  orderNumber: string;
  table: string;
  items: string[];
  waited: number;
  total: number;
  status: LaneStatus;
};
type HourlyPoint = { hour: string; orders: number };
type Copy = ReturnType<typeof buildCopy>;

const activeOrderStatuses = ["open", "sent_to_kitchen", "cooking", "ready", "served"];

function minutesSince(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

function formatCurrency(value: number, language: "th" | "en") {
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildCopy(language: "th" | "en") {
  return language === "th"
    ? {
        title: "ภาพรวมร้านวันนี้",
        subtitle: "ดูสิ่งที่ต้องรีบจัดการในกะนี้ก่อน แล้วค่อยไล่ดูโต๊ะ คิวครัว และยอดขาย",
        greeting: "สวัสดี",
        updated: "อัปเดต",
        open: "เปิดให้บริการ",
        refresh: "รีเฟรช",
        newOrder: "ออเดอร์ใหม่",
        needsAttention: "ต้องดูตอนนี้",
        needsAttentionHelp: "รวมคิวช้า โต๊ะที่กำลังใช้ และของที่ควรเติม",
        kitchenDelayed: "คิวเกินเวลา",
        kitchenDelayedHelp: "เกิน 10 นาทีในครัว",
        activeTables: "โต๊ะใช้งาน",
        activeTablesHelp: "แขกที่นั่งอยู่",
        readyToServe: "พร้อมเสิร์ฟ",
        readyToServeHelp: "รอพนักงานยกออก",
        shiftRevenue: "ยอดขายกะนี้",
        shiftRevenueHelp: "บิลเฉลี่ย",
        mainFlow: "งานหลักของกะ",
        kitchenQueue: "คิวครัว",
        floorStatus: "สถานะโต๊ะ",
        shiftPulse: "จังหวะยอดขาย",
        sideSignals: "สัญญาณช่วยตัดสินใจ",
        delayed: "เกินเวลา",
        cooking: "กำลังทำ",
        ready: "พร้อมเสิร์ฟ",
        tickets: "ใบ",
        orders: "ออเดอร์",
        minutes: "นาที",
        noItems: "ยังไม่มีรายการในตอนนี้",
        occupied: "ใช้งาน",
        available: "ว่าง",
        reserved: "จองไว้",
        people: "คน",
        loading: "กำลังโหลดข้อมูล",
        tableLoadError: "โหลดสถานะโต๊ะไม่สำเร็จ",
        topItems: "เมนูที่ขยับวันนี้",
        noTopItems: "ยังไม่มีเมนูขายในวันนี้",
        stockNotes: "ของที่ควรเช็ก",
        teamNotes: "ทีมในกะ",
        ordersByHour: "ออเดอร์รายชั่วโมง",
        averageBill: "บิลเฉลี่ย",
        openOrders: "ออเดอร์เปิดอยู่",
        stockGoodPull: "ขายดีและควรดูสต๊อกต่อ",
        stockAnchor: "จานหลักที่ช่วยดึงออเดอร์",
        refillSoon: "ควรเติม",
        lowStock: "ใกล้หมด",
        fullShift: "ครบกะ",
        missingSome: "ยังขาดบางคน",
      }
    : {
        title: "Today's restaurant overview",
        subtitle: "Start with what needs attention, then scan tables, kitchen queue, and sales rhythm.",
        greeting: "Hello",
        updated: "Updated",
        open: "Open for service",
        refresh: "Refresh",
        newOrder: "New order",
        needsAttention: "Needs attention",
        needsAttentionHelp: "Late kitchen work, active tables, and refill cues.",
        kitchenDelayed: "Late queue",
        kitchenDelayedHelp: "Over 10 minutes in kitchen",
        activeTables: "Active tables",
        activeTablesHelp: "Seated guests",
        readyToServe: "Ready to serve",
        readyToServeHelp: "Waiting for service",
        shiftRevenue: "Shift revenue",
        shiftRevenueHelp: "Average bill",
        mainFlow: "Shift workflow",
        kitchenQueue: "Kitchen queue",
        floorStatus: "Floor status",
        shiftPulse: "Sales rhythm",
        sideSignals: "Decision signals",
        delayed: "Overdue",
        cooking: "Cooking",
        ready: "Ready",
        tickets: "tickets",
        orders: "orders",
        minutes: "mins",
        noItems: "Nothing here right now",
        occupied: "Occupied",
        available: "Available",
        reserved: "Reserved",
        people: "people",
        loading: "Loading operations",
        tableLoadError: "Could not load table status.",
        topItems: "Menu movement today",
        noTopItems: "No menu sales yet today",
        stockNotes: "Stock to check",
        teamNotes: "Team on shift",
        ordersByHour: "Orders by hour",
        averageBill: "Average bill",
        openOrders: "Open orders",
        stockGoodPull: "Selling fast and should be watched",
        stockAnchor: "Anchor item for the shift",
        refillSoon: "Refill",
        lowStock: "Low",
        fullShift: "Fully staffed",
        missingSome: "Short-handed",
      };
}

function useNow() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function ChartBox({ data, copy }: { data: HourlyPoint[]; copy: Copy }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="h-52 min-h-52 min-w-0 overflow-hidden">
      {size.width > 0 && size.height > 0 ? (
        <BarChart width={size.width} height={size.height} data={data} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(249, 115, 22, 0.06)" }}
            formatter={(value) => [`${value} ${copy.orders}`, copy.ordersByHour]}
            labelFormatter={(label) => `${label}:00`}
          />
          <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
            {data.map((point) => (
              <Cell key={point.hour} fill={point.orders >= 4 ? "#f97316" : point.orders >= 2 ? "#fb923c" : "#cbd5e1"} />
            ))}
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

function toFloorTable(table: RestaurantTable, activeOrder?: Order): FloorTable {
  return {
    id: table.display_label || table.table_number,
    status: table.status === "free" ? "available" : table.status,
    guests: activeOrder?.customer_count,
    mins: activeOrder ? minutesSince(activeOrder.opened_at) : undefined,
    zone: table.zone,
  };
}

export default function Home() {
  const router = useRouter();
  const { activeMembership, user } = useAuth();
  const { language } = useLanguage();
  const copy = useMemo(() => buildCopy(language), [language]);
  const now = useNow();
  const hasLoadedRef = useRef(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [floorError, setFloorError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOperations = async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setFloorError("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [tableRes, orderRes, kitchenRes] = await Promise.all([listTables(), listOrders({ date: today }), kitchenQueue()]);
      const nextOrders = orderRes.data.orders ?? [];
      const activeOrderByTable = new Map<number, Order>();
      nextOrders
        .filter((order) => activeOrderStatuses.includes(order.status))
        .forEach((order) => activeOrderByTable.set(order.table_id, order));
      setOrders(nextOrders);
      setKitchenOrders(kitchenRes.data.orders ?? []);
      setTables((tableRes.data.tables ?? []).map((table) => toFloorTable(table, activeOrderByTable.get(table.ID))));
      setLastUpdated(new Date());
      hasLoadedRef.current = true;
    } catch {
      setFloorError(copy.tableLoadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeMembership?.restaurant_id) return;
    void loadOperations();
    const timer = window.setInterval(() => void loadOperations(), 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembership?.restaurant_id, language]);

  const tickets: KitchenTicket[] = kitchenOrders.map((order) => {
    const oldestSent = order.items?.reduce<string | null>((oldest, item) => {
      if (!item.sent_at) return oldest;
      if (!oldest || new Date(item.sent_at) < new Date(oldest)) return item.sent_at;
      return oldest;
    }, null);
    const waited = minutesSince(oldestSent ?? order.opened_at);
    const hasCooking = order.items?.some((item) => item.status === "cooking") ?? false;
    return {
      id: order.ID,
      orderNumber: order.order_number,
      table: order.table?.display_label || order.table?.table_number || String(order.table_id),
      items: order.items?.map((item) => `${item.quantity}x ${item.menu_name}`) ?? [],
      waited,
      total: order.grand_total || order.total_amount,
      status: waited >= 10 ? "delayed" : hasCooking ? "cooking" : "ready",
    };
  });

  const delayed = tickets.filter((ticket) => ticket.status === "delayed");
  const cooking = tickets.filter((ticket) => ticket.status === "cooking");
  const ready = tickets.filter((ticket) => ticket.status === "ready");
  const occupied = tables.filter((table) => table.status === "occupied");
  const revenueOrders = orders.filter((order) => order.status !== "cancelled");
  const shiftRevenue = revenueOrders.reduce((sum, order) => sum + (order.grand_total || order.total_amount), 0);
  const avgTicket = revenueOrders.length ? Math.round(shiftRevenue / revenueOrders.length) : 0;
  const guestCount = occupied.reduce((sum, table) => sum + (table.guests ?? 0), 0);

  const topItems = Array.from(
    orders.reduce((map, order) => {
      order.items?.forEach((item) => map.set(item.menu_name, (map.get(item.menu_name) ?? 0) + item.quantity));
      return map;
    }, new Map<string, number>()),
  )
    .map(([name, sold]) => ({ name, sold }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 4);

  const orderHours = orders.map((order) => new Date(order.opened_at).getHours()).filter((hour) => Number.isFinite(hour));
  const startHour = Math.min(...orderHours, 11);
  const endHour = Math.max(...orderHours, 19);
  const hourly: HourlyPoint[] = Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hourNumber = startHour + index;
    return {
      hour: String(hourNumber).padStart(2, "0"),
      orders: orders.filter((order) => new Date(order.opened_at).getHours() === hourNumber).length,
    };
  });

  const lowStock = [
    { name: language === "th" ? "ข้าวสวย" : "Steamed rice", left: 8, unit: language === "th" ? "จาน" : "plates", critical: true },
    { name: language === "th" ? "กุ้งสด" : "Fresh shrimp", left: 12, unit: language === "th" ? "ตัว" : "pcs", critical: true },
    { name: language === "th" ? "ไข่ไก่" : "Eggs", left: 18, unit: language === "th" ? "ฟอง" : "eggs", critical: false },
  ];
  const staff = [
    { role: language === "th" ? "ครัว" : "Kitchen", on: 4, total: 4, lead: language === "th" ? "เชฟอภิชัย" : "Chef Apichai" },
    { role: language === "th" ? "เสิร์ฟ" : "Service", on: 5, total: 6, lead: language === "th" ? "พี่หน่อย" : "P' Noi" },
    { role: language === "th" ? "แคชเชียร์" : "Cashier", on: 2, total: 2, lead: language === "th" ? "พี่แอน" : "P' Ann" },
  ];

  const dateLabel = now.toLocaleDateString(language === "th" ? "th-TH" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeLabel = now.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" });

  const lanes = [
    { key: "delayed" as const, icon: AlertTriangle, title: copy.delayed, items: delayed, color: "text-red-600 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/30" },
    { key: "cooking" as const, icon: ChefHat, title: copy.cooking, items: cooking, color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { key: "ready" as const, icon: CheckCircle2, title: copy.ready, items: ready, color: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  ];

  const floorMeta = {
    occupied: { label: copy.occupied, className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" },
    available: { label: copy.available, className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200" },
    reserved: { label: copy.reserved, className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200" },
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex w-full flex-col gap-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex w-full flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {copy.open}
                </span>
                <span className="text-[12px] text-gray-500 dark:text-gray-400">
                  {dateLabel} · {timeLabel}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
              <p className="mt-1 max-w-3xl text-[13px] leading-5 text-gray-500 dark:text-gray-400">
                {user ? `${copy.greeting} ${user.nickname?.trim() || user.first_name} · ` : ""}
                {copy.subtitle}
              </p>
              {lastUpdated ? (
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  {copy.updated} {lastUpdated.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadOperations()}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {copy.refresh}
              </button>
              <button
                type="button"
                onClick={() => router.push("/pos/tables")}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-gray-950 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <ShoppingBag className="h-4 w-4" />
                {copy.newOrder}
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-4">
            {[
              { icon: AlertTriangle, label: copy.kitchenDelayed, value: delayed.length, helper: copy.kitchenDelayedHelp, tone: "text-red-600 dark:text-red-300" },
              { icon: LayoutGrid, label: copy.activeTables, value: `${occupied.length}/${tables.length}`, helper: `${guestCount} ${copy.activeTablesHelp}`, tone: "text-amber-600 dark:text-amber-300" },
              { icon: CheckCircle2, label: copy.readyToServe, value: ready.length, helper: copy.readyToServeHelp, tone: "text-emerald-600 dark:text-emerald-300" },
              { icon: Wallet, label: copy.shiftRevenue, value: formatCurrency(shiftRevenue, language), helper: `${copy.shiftRevenueHelp} ${formatCurrency(avgTicket, language)}`, tone: "text-gray-950 dark:text-white" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-md border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{stat.label}</p>
                      <p className={`mt-1 truncate text-xl font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{stat.helper}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        <main className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,0.8fr)]">
          <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.mainFlow}</p>
                <h2 className="mt-1 text-[15px] font-semibold text-gray-950 dark:text-white">{copy.kitchenQueue}</h2>
              </div>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                {tickets.length} {copy.tickets}
              </p>
            </div>

            <div className="grid gap-px bg-gray-200 dark:bg-gray-800 lg:grid-cols-3">
              {lanes.map((lane) => {
                const Icon = lane.icon;
                return (
                  <div key={lane.key} className="min-w-0 bg-white dark:bg-gray-950">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${lane.bg} ${lane.color}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-[13px] font-semibold text-gray-950 dark:text-white">{lane.title}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">{lane.items.length} {copy.tickets}</p>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {lane.items.length === 0 ? (
                        <div className="px-4 py-5 text-[12px] text-gray-500 dark:text-gray-400">{copy.noItems}</div>
                      ) : (
                        lane.items.slice(0, 5).map((ticket) => (
                          <button
                            key={ticket.id}
                            type="button"
                            onClick={() => router.push(`/pos/orders/${ticket.id}`)}
                            className="group grid w-full grid-cols-[1fr_auto] gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-orange-50/50 dark:border-gray-800 dark:hover:bg-orange-950/20"
                          >
                            <span className="min-w-0">
                              <span className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-gray-950 dark:text-white">{ticket.table}</span>
                                <span className="font-mono text-[11px] text-gray-400">#{ticket.orderNumber}</span>
                              </span>
                              <span className="mt-1 block truncate text-[12px] text-gray-500 dark:text-gray-400">{ticket.items.join(" · ") || copy.noItems}</span>
                            </span>
                            <span className="text-right">
                              <span className={`block text-[13px] font-semibold tabular-nums ${lane.color}`}>
                                {ticket.waited} {copy.minutes}
                              </span>
                              <span className="text-[11px] text-gray-400">{formatCurrency(ticket.total, language)}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.needsAttention}</p>
                <h2 className="mt-1 text-[15px] font-semibold text-gray-950 dark:text-white">{copy.sideSignals}</h2>
                <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.needsAttentionHelp}</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {lowStock.map((item) => (
                  <div key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-gray-950 dark:text-white">{item.name}</p>
                      <p className="truncate text-[12px] text-gray-500 dark:text-gray-400">{item.critical ? copy.stockGoodPull : copy.stockAnchor}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[13px] font-semibold tabular-nums ${item.critical ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300"}`}>
                        {item.left} {item.unit}
                      </p>
                      <p className="text-[11px] text-gray-400">{item.critical ? copy.refillSoon : copy.lowStock}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <Users className="h-4 w-4 text-orange-500" />
                <h2 className="text-[15px] font-semibold text-gray-950 dark:text-white">{copy.teamNotes}</h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {staff.map((member) => {
                  const full = member.on === member.total;
                  return (
                    <div key={member.role} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-950 dark:text-white">{member.role}</p>
                        <p className="text-[12px] text-gray-500 dark:text-gray-400">{member.lead}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[13px] font-semibold tabular-nums ${full ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>
                          {member.on}/{member.total}
                        </p>
                        <p className="text-[11px] text-gray-400">{full ? copy.fullShift : copy.missingSome}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </main>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.shiftPulse}</p>
                <h2 className="mt-1 text-[15px] font-semibold text-gray-950 dark:text-white">{copy.ordersByHour}</h2>
              </div>
              <div className="hidden gap-5 text-right sm:flex">
                <div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.openOrders}</p>
                  <p className="text-[15px] font-semibold tabular-nums text-gray-950 dark:text-white">{orders.filter((order) => activeOrderStatuses.includes(order.status)).length}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.averageBill}</p>
                  <p className="text-[15px] font-semibold tabular-nums text-gray-950 dark:text-white">{formatCurrency(avgTicket, language)}</p>
                </div>
              </div>
            </div>
            <div className="px-4 py-4">
              <ChartBox data={hourly} copy={copy} />
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <Sparkles className="h-4 w-4 text-orange-500" />
              <h2 className="text-[15px] font-semibold text-gray-950 dark:text-white">{copy.topItems}</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {topItems.length ? (
                topItems.map((item, index) => (
                  <div key={item.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50 text-[12px] font-bold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-gray-950 dark:text-white">{item.name}</span>
                      <span className="block truncate text-[12px] text-gray-500 dark:text-gray-400">{copy.stockGoodPull}</span>
                    </span>
                    <span className="text-right text-[13px] font-semibold tabular-nums text-gray-950 dark:text-white">
                      {item.sold}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-[12px] text-gray-500 dark:text-gray-400">{copy.noTopItems}</div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.floorStatus}</p>
              <h2 className="mt-1 text-[15px] font-semibold text-gray-950 dark:text-white">{copy.floorStatus}</h2>
            </div>
            {floorError ? <p className="text-[12px] text-red-600 dark:text-red-300">{floorError}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 md:grid-cols-3">
            {(["occupied", "available", "reserved"] as FloorStatus[]).map((status) => (
              <div key={status} className="bg-white px-4 py-3 dark:bg-gray-950">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{floorMeta[status].label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gray-950 dark:text-white">{tables.filter((table) => table.status === status).length}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {loading && !hasLoadedRef.current ? (
              <div className="col-span-full flex items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {copy.loading}
              </div>
            ) : tables.length ? (
              tables.map((table) => (
                <div key={table.id} className={`rounded-md border px-3 py-2 ${floorMeta[table.status].className}`}>
                  <p className="text-[13px] font-semibold">{table.id}</p>
                  <p className="mt-0.5 truncate text-[11px] opacity-80">
                    {table.guests ? `${table.guests} ${copy.people}` : floorMeta[table.status].label}
                  </p>
                  {table.mins ? <p className="text-[11px] opacity-80">{table.mins} {copy.minutes}</p> : null}
                </div>
              ))
            ) : (
              <div className="col-span-full text-[12px] text-gray-500 dark:text-gray-400">{copy.noItems}</div>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() => router.push("/orders")}
          className="inline-flex w-fit items-center gap-2 rounded-md text-[13px] font-semibold text-gray-600 transition-colors hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-300"
        >
          {copy.orders}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
