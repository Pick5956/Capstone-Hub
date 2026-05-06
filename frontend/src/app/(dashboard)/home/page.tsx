"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { listTables } from "@/src/lib/table";
import { kitchenQueue, listOrders } from "@/src/lib/order";
import type { Order } from "@/src/types/order";
import type { RestaurantTable } from "@/src/types/table";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";

type OrderStatus = "delayed" | "cooking" | "ready";
type DashboardTableStatus = "occupied" | "available" | "reserved" | "cleaning";
type DashboardTable = { id: string; status: DashboardTableStatus; guests?: number; mins?: number; zone?: string };
type HourlyPoint = { hour: string; orders: number };
type DashboardTicket = { id: number; orderNumber: string; table: string; items: string[]; waited: number; total: number; status: OrderStatus };

const activeOrderStatuses = ["open", "sent_to_kitchen", "cooking", "ready", "served"];

function minutesSince(value?: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function useNow() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Section({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{eyebrow}</p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ShiftDemandChart({
  data,
  demandTooltip,
  ordersLabel,
}: {
  data: HourlyPoint[];
  demandTooltip: string;
  ordersLabel: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ready = size.width > 0 && size.height > 0;

  return (
    <div ref={wrapperRef} className="h-56 min-h-56 min-w-0 overflow-hidden">
      {ready ? (
        <BarChart width={size.width} height={size.height} data={data} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(249, 115, 22, 0.06)" }}
            formatter={(value) => [`${value} ${demandTooltip}`, ordersLabel]}
            labelFormatter={(label) => `${label}:00`}
          />
          <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.hour} fill={entry.orders >= 35 ? "#f59e0b" : entry.orders >= 20 ? "#fb923c" : "#cbd5e1"} />
            ))}
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

function toDashboardTable(table: RestaurantTable, activeOrder?: Order): DashboardTable {
  const status: DashboardTableStatus =
    table.status === "free" ? "available" : table.status === "reserved" ? "reserved" : "occupied";

  return {
    id: table.table_number,
    status,
    guests: activeOrder?.customer_count,
    mins: activeOrder ? minutesSince(activeOrder.opened_at) : undefined,
    zone: table.zone,
  };
}

export default function Home() {
  const router = useRouter();
  const { activeMembership, user } = useAuth();
  const { language } = useLanguage();
  const now = useNow();
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<DashboardTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [floorError, setFloorError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasLoadedRef = useRef(false);

  const copy = language === "th"
    ? {
        headerEyebrow: "Shift overview",
        headerTitle: "ภาพรวมร้านวันนี้",
        greeting: "สวัสดี",
        open: "เปิดให้บริการ",
        refresh: "รีเฟรช",
        newOrder: "ออเดอร์ใหม่",
        newOrderSoon: "ระบบออเดอร์จะเปิดในเฟสถัดไป",
        urgentOrders: "ออเดอร์ต้องเร่งก่อน",
        activeTables: "โต๊ะกำลังใช้งาน",
        upcomingReservations: "การจองใกล้ถึงเวลา",
        shiftRevenue: "ยอดขายกะนี้",
        overdueInKitchen: "เกินเวลาแล้วในครัว",
        seatedGuests: "แขกนั่งอยู่",
        withinHour: "ภายใน 1 ชั่วโมงนี้",
        averageBill: "บิลเฉลี่ย",
        kitchenEyebrow: "Kitchen queue",
        kitchenTitle: "คิวครัวและการเสิร์ฟ",
        floorEyebrow: "Floor status",
        floorTitle: "สถานะโต๊ะตอนนี้",
        stockEyebrow: "Stock and team",
        stockTitle: "ของใกล้หมดและทีมในกะ",
        demandEyebrow: "Shift pattern",
        demandTitle: "จังหวะออเดอร์ในกะนี้",
        ordersOpen: "เปิดอยู่",
        orders: "ออเดอร์",
        tickets: "ใบ",
        noItems: "ไม่มีรายการในตอนนี้",
        delayed: "เกินเวลา",
        cooking: "ครัวกำลังทำ",
        ready: "พร้อมเสิร์ฟ",
        occupied: "ใช้งาน",
        available: "ว่าง",
        reserved: "จองไว้",
        cleaning: "ทำความสะอาด",
        noZone: "ไม่ระบุโซน",
        tableLoadError: "โหลดสถานะโต๊ะไม่สำเร็จ",
        people: "คน",
        minutes: "นาที",
        nearService: "รอบเย็นเริ่มแน่น",
        stockRefill: "วัตถุดิบที่ควรเติม",
        teamShift: "กำลังคนในกะนี้",
        demandAside: "รายชั่วโมงและเมนูเด่น",
        demandTooltip: "ออเดอร์",
        sold: "จาน",
        lowStock: "ใกล้หมด",
        enoughStock: "พอ",
        dueSoon: "ต้องรีบเติม",
        goodPull: "ขายดีและต้องดูสต๊อกต่อ",
        strongItem: "จานหลักที่ดึงออเดอร์ได้ดี",
        fullShift: "ครบกะแล้ว",
        missingSome: "ยังขาดบางคน",
      }
    : {
        headerEyebrow: "Shift overview",
        headerTitle: "Today's restaurant overview",
        greeting: "Hello",
        open: "Open for service",
        refresh: "Refresh",
        newOrder: "New order",
        newOrderSoon: "Orders are coming in the next phase.",
        urgentOrders: "Urgent orders",
        activeTables: "Active tables",
        upcomingReservations: "Upcoming reservations",
        shiftRevenue: "Shift revenue",
        overdueInKitchen: "Overdue in the kitchen",
        seatedGuests: "Seated guests",
        withinHour: "Within the next hour",
        averageBill: "Average bill",
        kitchenEyebrow: "Kitchen queue",
        kitchenTitle: "Kitchen and service queue",
        floorEyebrow: "Floor status",
        floorTitle: "Table status right now",
        stockEyebrow: "Stock and team",
        stockTitle: "Low stock and active team",
        demandEyebrow: "Shift pattern",
        demandTitle: "Order rhythm for this shift",
        ordersOpen: "Open",
        orders: "orders",
        tickets: "tickets",
        noItems: "Nothing in this lane right now",
        delayed: "Overdue",
        cooking: "Cooking",
        ready: "Ready",
        occupied: "Occupied",
        available: "Available",
        reserved: "Reserved",
        cleaning: "Cleaning",
        noZone: "No zone",
        tableLoadError: "Could not load table status.",
        people: "people",
        minutes: "mins",
        nearService: "The evening service is getting busy",
        stockRefill: "Items that need refilling",
        teamShift: "Team on shift",
        demandAside: "Hourly demand and top items",
        demandTooltip: "orders",
        sold: "sold",
        lowStock: "Low stock",
        enoughStock: "Enough",
        dueSoon: "Refill soon",
        goodPull: "Selling fast and should be restocked",
        strongItem: "A strong anchor item for this shift",
        fullShift: "Fully staffed",
        missingSome: "Still missing some staff",
      };

  const liveOrderTickets: DashboardTicket[] = kitchenOrders.map((order) => {
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
      table: order.table?.table_number ?? String(order.table_id),
      items: order.items?.map((item) => `${item.quantity}x ${item.menu_name}`) ?? [],
      waited,
      total: order.total_amount,
      status: waited >= 10 ? "delayed" : hasCooking ? "cooking" : "ready",
    };
  });
  const orderTickets: DashboardTicket[] = liveOrderTickets;

  const loadOperations = async () => {
    if (!hasLoadedRef.current) setLoadingTables(true);
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
      setTables((tableRes.data.tables ?? []).map((table) => toDashboardTable(table, activeOrderByTable.get(table.ID))));
      setLastUpdated(new Date());
      hasLoadedRef.current = true;
    } catch {
      setFloorError(copy.tableLoadError);
    } finally {
      setLoadingTables(false);
    }
  };

  useEffect(() => {
    if (!activeMembership?.restaurant_id) return;
    void loadOperations();
    const timer = window.setInterval(() => void loadOperations(), 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembership?.restaurant_id, language]);

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

  const liveTopItems = Array.from(
    orders.reduce((map, order) => {
      order.items?.forEach((item) => {
        const current = map.get(item.menu_name) ?? 0;
        map.set(item.menu_name, current + item.quantity);
      });
      return map;
    }, new Map<string, number>()),
  )
    .map(([name, sold]) => ({ name, sold, stock: "ok" }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 3);
  const topItems = liveTopItems;

  const orderHours = orders.map((order) => new Date(order.opened_at).getHours());
  const chartStartHour = Math.min(...orderHours, 11);
  const chartEndHour = Math.max(...orderHours, 19);
  const hourly = Array.from({ length: chartEndHour - chartStartHour + 1 }, (_, index) => {
    const hourNumber = chartStartHour + index;
    const hour = String(hourNumber).padStart(2, "0");
    return {
      hour,
      orders: orders.filter((order) => new Date(order.opened_at).getHours() === hourNumber).length,
    };
  });

  const dateLabel = now.toLocaleDateString(language === "th" ? "th-TH" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeLabel = now.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" });

  const delayed = orderTickets.filter((ticket) => ticket.status === "delayed");
  const cooking = orderTickets.filter((ticket) => ticket.status === "cooking");
  const ready = orderTickets.filter((ticket) => ticket.status === "ready");
  const occupied = tables.filter((table) => table.status === "occupied");
  const reserved = tables.filter((table) => table.status === "reserved");

  const statusMeta = useMemo(
    () => ({
      delayed: { label: copy.delayed, tone: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300", dot: "bg-red-500" },
      cooking: { label: copy.cooking, tone: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300", dot: "bg-amber-500" },
      ready: { label: copy.ready, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300", dot: "bg-emerald-500" },
    }),
    [copy.cooking, copy.delayed, copy.ready]
  );

  const tableMeta = useMemo(
    () => ({
      occupied: { label: copy.occupied, tone: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200" },
      available: { label: copy.available, tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200" },
      reserved: { label: copy.reserved, tone: "bg-sky-50 text-sky-800 dark:bg-sky-900/20 dark:text-sky-200" },
      cleaning: { label: copy.cleaning, tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    }),
    [copy.available, copy.cleaning, copy.occupied, copy.reserved]
  );

  const revenueOrders = orders.filter((order) => order.status !== "cancelled");
  const shiftRevenue = Math.round(revenueOrders.reduce((sum, order) => sum + order.total_amount, 0));
  const shiftOrders = revenueOrders.length;
  const guestCount = occupied.reduce((sum, table) => sum + (table.guests ?? 0), 0);
  const avgTicket = shiftOrders ? Math.round(shiftRevenue / shiftOrders) : 0;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="space-y-5">
        <header className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.headerEyebrow}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.headerTitle}</h1>
              <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
                {user ? `${copy.greeting} ${user.nickname?.trim() || user.first_name}` : copy.greeting} · {dateLabel} · {timeLabel}
              </p>
              {lastUpdated ? (
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  {language === "th" ? "อัปเดต" : "Updated"} {lastUpdated.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                <span className="relative inline-flex h-2.5 w-2.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 animate-ping" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                {copy.open}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void loadOperations()} disabled={loadingTables} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900">
                  {copy.refresh}
                </button>
                <button type="button" onClick={() => router.push("/pos/tables")} className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">
                  {copy.newOrder}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-gray-200 border-t border-gray-200 px-4 dark:divide-gray-800 dark:border-gray-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <div className="py-3 sm:px-4 sm:first:pl-0">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.urgentOrders}</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-red-700 dark:text-red-300">{delayed.length}</p>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">{copy.overdueInKitchen}</p>
            </div>
            <div className="py-3 sm:px-4">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.activeTables}</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {occupied.length}/{tables.length}
              </p>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">{guestCount} {copy.seatedGuests.toLowerCase?.() ?? copy.seatedGuests}</p>
            </div>
            <div className="py-3 sm:px-4">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.upcomingReservations}</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-sky-700 dark:text-sky-300">{reserved.length}</p>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">{copy.withinHour}</p>
            </div>
            <div className="py-3 sm:px-4 sm:last:pr-0">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.shiftRevenue}</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-gray-900 dark:text-white">{shiftRevenue.toLocaleString()}</p>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                {copy.averageBill} {avgTicket.toLocaleString()}
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
          <Section
            eyebrow={copy.kitchenEyebrow}
            title={copy.kitchenTitle}
            aside={<p className="text-right text-[12px] text-gray-500 dark:text-gray-400">{orderTickets.length} {copy.orders}</p>}
          >
            <div className="grid grid-cols-1 divide-y divide-gray-200 dark:divide-gray-800 xl:grid-cols-3 xl:divide-x xl:divide-y-0">
              {(["delayed", "cooking", "ready"] as OrderStatus[]).map((status) => {
                const tickets = orderTickets.filter((ticket) => ticket.status === status);
                const meta = statusMeta[status];
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                        <p className="text-[13px] font-semibold">{meta.label}</p>
                      </div>
                      <span className="text-[12px] font-medium tabular-nums text-gray-500 dark:text-gray-400">
                        {tickets.length} {copy.tickets}
                      </span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-800">
                      {tickets.length === 0 ? (
                        <div className="px-4 py-4 text-[12px] text-gray-500 dark:text-gray-400">{copy.noItems}</div>
                      ) : (
                        tickets.map((ticket, index) => (
                          <div
                            key={ticket.id}
                            className={`px-4 py-3 ${index !== tickets.length - 1 ? "border-b border-gray-200 dark:border-gray-800" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{ticket.table}</p>
                                  <p className="font-mono text-[11px] text-gray-400">#{ticket.orderNumber}</p>
                                </div>
                                <p className="mt-1 text-[12px] leading-5 text-gray-600 dark:text-gray-400">{ticket.items.join(" · ")}</p>
                              </div>
                              <div className="text-right">
                                <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.tone}`}>{meta.label}</span>
                                <p className="mt-1 text-[12px] font-semibold tabular-nums text-gray-900 dark:text-white">
                                  {ticket.waited} {copy.minutes}
                                </p>
                                <p className="text-[11px] text-gray-400">{ticket.total.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section
            eyebrow={copy.floorEyebrow}
            title={copy.floorTitle}
            aside={<p className="text-[12px] text-gray-500 dark:text-gray-400">{copy.nearService}</p>}
          >
            <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 sm:grid-cols-4">
              {(["occupied", "available", "reserved", "cleaning"] as DashboardTableStatus[]).map((status) => (
                <div key={status} className="bg-white px-4 py-3 dark:bg-gray-950">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{tableMeta[status].label}</p>
                  <p className="mt-1 text-[20px] font-semibold tabular-nums">{tables.filter((table) => table.status === status).length}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-4">
              {loadingTables ? (
                <div className="col-span-full text-[12px] text-gray-500 dark:text-gray-400">{copy.refresh}...</div>
              ) : floorError ? (
                <div className="col-span-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{floorError}</div>
              ) : tables.length ? tables.map((table) => (
                <div key={table.id} className={`rounded-md px-2.5 py-2 ${tableMeta[table.status].tone}`}>
                  <p className="text-[12px] font-semibold">{table.id}</p>
                  <p className="mt-0.5 text-[11px]">
                    {table.guests ? `${table.guests} ${copy.people}` : tableMeta[table.status].label}
                  </p>
                  {table.mins ? <p className="text-[11px] opacity-80">{table.mins} {copy.minutes}</p> : null}
                </div>
              )) : (
                <div className="col-span-full text-[12px] text-gray-500 dark:text-gray-400">{copy.noItems}</div>
              )}
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
          <Section eyebrow={copy.stockEyebrow} title={copy.stockTitle}>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              <div className="px-4 py-3">
                <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.stockRefill}</p>
              </div>
              {lowStock.map((item) => (
                <div key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-[12px] text-gray-500 dark:text-gray-400">{item.critical ? copy.goodPull : copy.strongItem}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[13px] font-semibold tabular-nums ${item.critical ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                      {item.left} {item.unit}
                    </p>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${item.critical ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"}`}>
                      {item.critical ? copy.dueSoon : copy.lowStock}
                    </span>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3">
                <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.teamShift}</p>
              </div>
              {staff.map((member) => {
                const full = member.on === member.total;
                return (
                  <div key={member.role} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-gray-900 dark:text-white">{member.role}</p>
                      <p className="text-[12px] text-gray-500 dark:text-gray-400">{member.lead}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[13px] font-semibold tabular-nums ${full ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                        {member.on}/{member.total}
                      </p>
                      <p className="text-[11px] text-gray-400">{full ? copy.fullShift : copy.missingSome}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section
            eyebrow={copy.demandEyebrow}
            title={copy.demandTitle}
            aside={<p className="text-[12px] text-gray-500 dark:text-gray-400">{copy.demandAside}</p>}
          >
            <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="min-w-0 px-4 py-4 xl:border-r xl:border-gray-200 xl:dark:border-gray-800">
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.ordersOpen}</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-gray-900 dark:text-white">{shiftOrders}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.averageBill}</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-gray-900 dark:text-white">{avgTicket}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.cooking}</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">{cooking.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.ready}</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{ready.length}</p>
                  </div>
                </div>

                <ShiftDemandChart data={hourly} demandTooltip={copy.demandTooltip} ordersLabel={copy.orders} />
              </div>

              <div className="min-w-0 divide-y divide-gray-200 px-4 py-2 dark:divide-gray-800">
                {topItems.length ? topItems.map((item) => (
                  <div key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-gray-900 dark:text-white">{item.name}</p>
                      <p className="text-[12px] text-gray-500 dark:text-gray-400">
                        {item.stock === "low" ? copy.goodPull : copy.strongItem}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-gray-900 dark:text-white">
                        {item.sold} {copy.sold}
                      </p>
                      <p className={`text-[11px] ${item.stock === "low" ? "text-amber-700 dark:text-amber-300" : "text-gray-400 dark:text-gray-500"}`}>
                        {item.stock === "low" ? copy.lowStock : copy.enoughStock}
                      </p>
                    </div>
                  </div>
                )) : <div className="py-3 text-[12px] text-gray-500 dark:text-gray-400">{copy.noItems}</div>}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
