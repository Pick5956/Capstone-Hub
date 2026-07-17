"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  PackageOpen,
  ReceiptText,
  RefreshCw,
  Table2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { formatCurrency } from "@/src/lib/format";
import {
  shiftDashboardDate,
  toDashboardDate,
  toDashboardFloorTables,
  uniqueOrdersById,
  type DashboardFloorTable,
} from "@/src/lib/homeDashboard";
import { listIngredients } from "@/src/lib/ingredient";
import { kitchenQueue, listOrders } from "@/src/lib/order";
import { orderPosHref } from "@/src/lib/orderNavigation";
import { listTables } from "@/src/lib/table";
import type { Ingredient } from "@/src/types/ingredient";
import { useVisiblePolling } from "@/src/hooks/useVisiblePolling";
import type { Order, OrderItem, OrderStatus } from "@/src/types/order";

type LaneStatus = "delayed" | "cooking" | "ready";
type KitchenTicket = {
  id: number;
  orderNumber: string;
  table: string;
  items: string[];
  waited: number;
  total: number;
  status: LaneStatus;
};
type HourlyPoint = { dateTime: string; hour: string; orders: number };
type Copy = ReturnType<typeof buildCopy>;

const activeOrderStatuses = new Set<OrderStatus>(["open", "sent_to_kitchen", "cooking", "ready", "served"]);

function minutesSince(value: string | null | undefined, now: Date) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((now.getTime() - time) / 60_000));
}

function formatDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:00:00`;
}

function orderLocationLabel(order: Order, language: "th" | "en") {
  if (order.order_type === "takeaway") {
    const base = language === "th" ? "กลับบ้าน" : "Takeaway";
    return order.customer_name?.trim() ? `${base} · ${order.customer_name.trim()}` : base;
  }
  return order.table?.display_label || order.table?.table_number || (order.table_id ? String(order.table_id) : "-");
}

function itemSummaryLabel(item: OrderItem, language: "th" | "en") {
  const suffix = item.fulfillment_type === "takeaway" ? (language === "th" ? " กลับบ้าน" : " takeaway") : "";
  return `${item.quantity}× ${item.menu_name}${suffix}`;
}

function buildCopy(language: "th" | "en") {
  return language === "th"
    ? {
        title: "ภาพรวมร้าน",
        todayMode: "สถานะการทำงานวันนี้",
        historyMode: "สรุปผลการดำเนินงานย้อนหลัง",
        today: "วันนี้",
        previousDay: "วันก่อน",
        nextDay: "วันถัดไป",
        chooseDate: "เลือกวันที่",
        refresh: "รีเฟรช",
        updated: "อัปเดต",
        ordersTotal: "ออเดอร์ทั้งหมด",
        paidRevenue: "ยอดรับชำระ",
        averageBill: "บิลเฉลี่ย",
        guestsTotal: "ลูกค้ารวม",
        activeOrders: "กำลังดำเนินการ",
        liveWork: "งานที่ต้องจัดการตอนนี้",
        liveWorkHint: "กดเพื่อไปยังหน้าที่จัดการงานนั้นได้ทันที",
        lateKitchen: "คิวครัวเกินเวลา",
        readyToServe: "พร้อมเสิร์ฟ",
        occupiedTables: "โต๊ะใช้งาน",
        lowStock: "วัตถุดิบควรเติม",
        kitchenQueue: "คิวครัว",
        viewKitchen: "เปิดหน้าครัว",
        delayed: "เกินเวลา",
        cooking: "กำลังทำ",
        ready: "พร้อมเสิร์ฟ",
        tickets: "ใบ",
        minutes: "นาที",
        noKitchen: "ไม่มีงานค้างในครัว",
        salesOverview: "ยอดขายของวัน",
        ordersByHour: "ออเดอร์รายชั่วโมง",
        topItems: "เมนูขายดี",
        noSales: "ยังไม่มีข้อมูลยอดขายในวันนี้",
        sold: "ขาย",
        dishes: "จาน",
        dailyOrders: "รายการออเดอร์",
        viewAllOrders: "ดูออเดอร์ทั้งหมด",
        noOrders: "ไม่มีออเดอร์ในวันที่เลือก",
        floorStatus: "สถานะโต๊ะ",
        openPOS: "เปิดหน้า POS",
        occupied: "ใช้งาน",
        available: "ว่าง",
        reserved: "จอง",
        inactive: "ปิดใช้",
        people: "คน",
        historyNotice: "กำลังดูข้อมูลย้อนหลัง สถานะครัวและโต๊ะสดจะแสดงเฉพาะวันนี้",
        loadError: "โหลดข้อมูลภาพรวมไม่สำเร็จ",
        order: "ออเดอร์",
        location: "โต๊ะ / ช่องทาง",
        status: "สถานะ",
        total: "ยอดรวม",
        time: "เวลา",
        open: "เปิดอยู่",
        sent_to_kitchen: "ส่งครัวแล้ว",
        served: "เสิร์ฟแล้ว",
        completed: "ชำระแล้ว",
        cancelled: "ยกเลิก",
      }
    : {
        title: "Restaurant overview",
        todayMode: "Today's live operations",
        historyMode: "Historical daily summary",
        today: "Today",
        previousDay: "Previous day",
        nextDay: "Next day",
        chooseDate: "Choose date",
        refresh: "Refresh",
        updated: "Updated",
        ordersTotal: "Total orders",
        paidRevenue: "Paid revenue",
        averageBill: "Average bill",
        guestsTotal: "Guests",
        activeOrders: "Active",
        liveWork: "Needs attention now",
        liveWorkHint: "Open the related workspace to handle it.",
        lateKitchen: "Late kitchen queue",
        readyToServe: "Ready to serve",
        occupiedTables: "Occupied tables",
        lowStock: "Ingredients to refill",
        kitchenQueue: "Kitchen queue",
        viewKitchen: "Open kitchen",
        delayed: "Overdue",
        cooking: "Cooking",
        ready: "Ready",
        tickets: "tickets",
        minutes: "mins",
        noKitchen: "No kitchen work waiting",
        salesOverview: "Daily sales",
        ordersByHour: "Orders by hour",
        topItems: "Top items",
        noSales: "No sales data for this day",
        sold: "Sold",
        dishes: "items",
        dailyOrders: "Orders",
        viewAllOrders: "View all orders",
        noOrders: "No orders on the selected date",
        floorStatus: "Floor status",
        openPOS: "Open POS",
        occupied: "Occupied",
        available: "Available",
        reserved: "Reserved",
        inactive: "Inactive",
        people: "people",
        historyNotice: "Viewing historical data. Live kitchen and floor status are available for today only.",
        loadError: "Could not load the overview",
        order: "Order",
        location: "Table / channel",
        status: "Status",
        total: "Total",
        time: "Time",
        open: "Open",
        sent_to_kitchen: "Sent",
        served: "Served",
        completed: "Paid",
        cancelled: "Cancelled",
      };
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
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
    <div ref={wrapperRef} className="h-56 min-h-56 min-w-0 overflow-hidden">
      {size.width > 0 && size.height > 0 ? (
        <BarChart width={size.width} height={size.height} data={data} margin={{ top: 12, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="dateTime" tickFormatter={(_, index) => data[index]?.hour ?? ""} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            formatter={(value) => [`${value} ${copy.order}`, copy.ordersByHour]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="orders" fill="#475569" radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : null}
    </div>
  );
}

function orderStatusLabel(status: OrderStatus, copy: Copy) {
  return copy[status as keyof Copy] || status;
}

function orderStatusClass(status: OrderStatus) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (status === "cancelled") return "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300";
  if (status === "cooking" || status === "sent_to_kitchen") return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300";
  if (status === "ready") return "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300";
}

export default function Home() {
  const router = useRouter();
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const copy = useMemo(() => buildCopy(language), [language]);
  const now = useNow();
  const today = toDashboardDate(now);
  const [selectedDate, setSelectedDate] = useState(() => toDashboardDate(new Date()));
  const isToday = selectedDate === today;
  const requestIdRef = useRef(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<DashboardFloorTable[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [loadedDate, setLoadedDate] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOperations = useCallback(async (background = false) => {
    if (!activeMembership?.restaurant_id) return;
    const requestId = ++requestIdRef.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [orderRes, liveData] = await Promise.all([
        listOrders({ date: selectedDate, limit: 200 }),
        isToday
          ? Promise.all([
              listTables(),
              kitchenQueue(),
              listIngredients().catch(() => ({ data: { ingredients: [] as Ingredient[] } })),
            ])
          : Promise.resolve(null),
      ]);
      if (requestId !== requestIdRef.current) return;

      const nextOrders = uniqueOrdersById(orderRes.data.orders ?? []);
      setOrders(nextOrders);
      if (liveData) {
        const [tableRes, kitchenRes, ingredientRes] = liveData;
        setKitchenOrders(uniqueOrdersById(kitchenRes.data.orders ?? []));
        setTables(toDashboardFloorTables(tableRes.data.tables ?? [], nextOrders, new Date()));
        setIngredients(ingredientRes.data.ingredients ?? []);
      } else {
        setKitchenOrders([]);
        setTables([]);
        setIngredients([]);
      }
      setLoadedDate(selectedDate);
      setLastUpdated(new Date());
    } catch {
      if (requestId === requestIdRef.current) setError(copy.loadError);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeMembership?.restaurant_id, copy.loadError, isToday, selectedDate]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);
  useVisiblePolling(() => loadOperations(true), {
    enabled: isToday && Boolean(activeMembership?.restaurant_id),
    intervalMs: 10_000,
    runImmediately: false,
  });

  const selectDate = (nextDate: string) => {
    if (!nextDate || nextDate > today || nextDate === selectedDate) return;
    setSelectedDate(nextDate);
  };

  const tickets = useMemo<KitchenTicket[]>(() => kitchenOrders.map((order) => {
    const oldestSent = order.items?.reduce<string | null>((oldest, item) => {
      if (!item.sent_at) return oldest;
      if (!oldest || new Date(item.sent_at) < new Date(oldest)) return item.sent_at;
      return oldest;
    }, null);
    const waited = minutesSince(oldestSent ?? order.opened_at, now);
    const hasCooking = order.items?.some((item) => item.status === "cooking") ?? false;
    const hasReady = order.items?.some((item) => item.status === "ready") ?? false;
    return {
      id: order.ID,
      orderNumber: order.order_number,
      table: orderLocationLabel(order, language),
      items: order.items?.map((item) => itemSummaryLabel(item, language)) ?? [],
      waited,
      total: order.grand_total || order.total_amount,
      status: hasReady && !hasCooking ? "ready" : waited >= 10 ? "delayed" : "cooking",
    };
  }), [kitchenOrders, language, now]);

  const delayed = tickets.filter((ticket) => ticket.status === "delayed");
  const cooking = tickets.filter((ticket) => ticket.status === "cooking");
  const ready = tickets.filter((ticket) => ticket.status === "ready");
  const occupied = tables.filter((table) => table.status === "occupied");
  const validOrders = orders.filter((order) => order.status !== "cancelled");
  const paidOrders = validOrders.filter((order) => order.payment_status === "paid" || order.status === "completed");
  const paidRevenue = paidOrders.reduce((sum, order) => sum + (order.grand_total || order.total_amount), 0);
  const averageBill = paidOrders.length ? Math.round(paidRevenue / paidOrders.length) : 0;
  const guestCount = validOrders.reduce((sum, order) => sum + (order.order_type === "dine_in" ? order.customer_count : 0), 0);
  const activeOrders = validOrders.filter((order) => activeOrderStatuses.has(order.status)).length;

  const topItems = Array.from(validOrders.reduce((map, order) => {
    order.items?.forEach((item) => map.set(item.menu_name, (map.get(item.menu_name) ?? 0) + item.quantity));
    return map;
  }, new Map<string, number>()))
    .map(([name, sold]) => ({ name, sold }))
    .sort((first, second) => second.sold - first.sold || first.name.localeCompare(second.name))
    .slice(0, 5);

  const orderHours = validOrders.map((order) => new Date(order.opened_at).getHours()).filter(Number.isFinite);
  const startHour = orderHours.length ? Math.min(...orderHours, 10) : 10;
  const endHour = orderHours.length ? Math.max(...orderHours, 20) : 20;
  const selectedDateAtNoon = new Date(`${selectedDate}T12:00:00`);
  const hourly: HourlyPoint[] = Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hourNumber = startHour + index;
    const pointDate = new Date(selectedDateAtNoon);
    pointDate.setHours(hourNumber, 0, 0, 0);
    return {
      dateTime: formatDateTime(pointDate),
      hour: String(hourNumber).padStart(2, "0"),
      orders: validOrders.filter((order) => new Date(order.opened_at).getHours() === hourNumber).length,
    };
  });

  const lowStock = ingredients
    .filter((item) => item.min_stock > 0 && item.stock <= item.min_stock * 1.5)
    .sort((first, second) => (first.stock / first.min_stock) - (second.stock / second.min_stock));

  const selectedDateLabel = selectedDateAtNoon.toLocaleDateString(language === "th" ? "th-TH" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lanes = [
    { key: "delayed" as const, icon: AlertTriangle, title: copy.delayed, items: delayed, color: "text-red-600 dark:text-red-300" },
    { key: "cooking" as const, icon: ChefHat, title: copy.cooking, items: cooking, color: "text-amber-600 dark:text-amber-300" },
    { key: "ready" as const, icon: CheckCircle2, title: copy.ready, items: ready, color: "text-emerald-600 dark:text-emerald-300" },
  ];

  const attention = [
    { key: "late", icon: AlertTriangle, label: copy.lateKitchen, value: delayed.length, href: "/kitchen", tone: "text-red-600 dark:text-red-300" },
    { key: "ready", icon: CheckCircle2, label: copy.readyToServe, value: ready.length, href: "/orders", tone: "text-emerald-600 dark:text-emerald-300" },
    { key: "tables", icon: Table2, label: copy.occupiedTables, value: occupied.length, href: "/pos/tables", tone: "text-amber-600 dark:text-amber-300" },
    { key: "stock", icon: PackageOpen, label: copy.lowStock, value: lowStock.length, href: "/inventory", tone: lowStock.length ? "text-amber-600 dark:text-amber-300" : "text-gray-400" },
  ];

  const summary = [
    { key: "orders", label: copy.ordersTotal, value: validOrders.length.toLocaleString(), helper: `${copy.activeOrders} ${activeOrders}` },
    { key: "revenue", label: copy.paidRevenue, value: formatCurrency(paidRevenue, language), helper: `${paidOrders.length} ${copy.order}` },
    { key: "average", label: copy.averageBill, value: formatCurrency(averageBill, language), helper: paidOrders.length ? undefined : copy.noSales },
    { key: "guests", label: copy.guestsTotal, value: guestCount.toLocaleString(), helper: copy.people },
  ];

  const dateLoading = loading && loadedDate !== selectedDate;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-14 z-20 border-b border-gray-200 bg-slate-50/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:px-6 lg:top-0 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label={copy.refresh} /> : null}
            </div>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{isToday ? copy.todayMode : copy.historyMode} · {selectedDateLabel}</p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <button type="button" onClick={() => selectDate(shiftDashboardDate(selectedDate, -1))} aria-label={copy.previousDay} title={copy.previousDay} className="ui-press inline-flex h-10 w-10 items-center justify-center border-r border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <label className="relative inline-flex h-10 min-w-0 items-center gap-2 px-3 text-[12px] font-semibold text-gray-700 dark:text-gray-200">
                <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="sr-only">{copy.chooseDate}</span>
                <input type="date" value={selectedDate} max={today} onChange={(event) => selectDate(event.target.value)} className="min-w-0 bg-transparent font-mono text-[12px] outline-none dark:[color-scheme:dark]" />
              </label>
              <button type="button" disabled={selectedDate >= today} onClick={() => selectDate(shiftDashboardDate(selectedDate, 1))} aria-label={copy.nextDay} title={copy.nextDay} className="ui-press inline-flex h-10 w-10 items-center justify-center border-l border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {!isToday ? <button type="button" onClick={() => selectDate(today)} className="ui-press h-10 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900">{copy.today}</button> : null}
            <button type="button" disabled={loading || refreshing} onClick={() => { void loadOperations(true); }} aria-label={copy.refresh} title={copy.refresh} className="ui-press inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div> : null}

        {dateLoading ? (
          <div className="flex min-h-72 items-center justify-center rounded-md border border-gray-200 bg-white text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {copy.refresh}
          </div>
        ) : (
          <>
            <section aria-label={copy.salesOverview} className="overflow-hidden rounded-md border border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800">
              <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
                {summary.map((item) => (
                  <div key={item.key} className="bg-white px-4 py-3.5 dark:bg-gray-950">
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{item.label}</p>
                    <p className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-gray-950 dark:text-white">{item.value}</p>
                    {item.helper ? <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{item.helper}</p> : null}
                  </div>
                ))}
              </div>
            </section>

            {!isToday ? (
              <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-[12px] text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span>{copy.historyNotice}</span>
              </div>
            ) : null}

            {isToday ? (
              <>
                <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                  <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                    <h2 className="text-[14px] font-semibold text-gray-950 dark:text-white">{copy.liveWork}</h2>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.liveWorkHint}</p>
                  </div>
                  <div className="grid gap-px bg-gray-200 dark:bg-gray-800 sm:grid-cols-2 xl:grid-cols-4">
                    {attention.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.key} type="button" onClick={() => router.push(item.href)} className="ui-press group flex min-h-24 items-center gap-3 bg-white px-4 py-3 text-left hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900">
                          <Icon className={`h-5 w-5 shrink-0 ${item.tone}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-gray-600 dark:text-gray-300">{item.label}</p>
                            <p className="mt-0.5 font-mono text-[22px] font-semibold tabular-nums text-gray-950 dark:text-white">{item.value}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-700" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                    <div>
                      <h2 className="text-[14px] font-semibold text-gray-950 dark:text-white">{copy.kitchenQueue}</h2>
                      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{tickets.length} {copy.tickets}</p>
                    </div>
                    <button type="button" onClick={() => router.push("/kitchen")} className="ui-press inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.viewKitchen}<ArrowRight className="h-3.5 w-3.5" /></button>
                  </div>
                  {tickets.length ? (
                    <div className="grid gap-px bg-gray-200 dark:bg-gray-800 lg:grid-cols-3">
                      {lanes.map((lane) => {
                        const Icon = lane.icon;
                        return (
                          <div key={lane.key} className="bg-white dark:bg-gray-950">
                            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
                              <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${lane.color}`} aria-hidden="true" />
                                <h3 className="text-[12px] font-semibold text-gray-900 dark:text-white">{lane.title}</h3>
                              </div>
                              <span className="font-mono text-[11px] text-gray-400">{lane.items.length}</span>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                              {lane.items.length ? lane.items.slice(0, 5).map((ticket) => (
                                <button key={`${lane.key}-${ticket.id}`} type="button" onClick={() => router.push(orderPosHref({ ID: ticket.id, order_number: ticket.orderNumber }))} className="ui-press block w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{ticket.table}</span>
                                    <span className="font-mono text-[11px] text-gray-400">#{ticket.orderNumber}</span>
                                  </div>
                                  <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">{ticket.items.join(" · ")}</p>
                                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                                    <span className={`inline-flex items-center gap-1 ${lane.color}`}><Clock className="h-3 w-3" />{ticket.waited} {copy.minutes}</span>
                                    <span className="font-mono text-gray-500 dark:text-gray-400">{formatCurrency(ticket.total, language)}</span>
                                  </div>
                                </button>
                              )) : <p className="px-4 py-8 text-center text-[12px] text-gray-400">{copy.noKitchen}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="px-4 py-10 text-center text-[12px] text-gray-400">{copy.noKitchen}</p>}
                </section>
              </>
            ) : null}

            <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-[14px] font-semibold text-gray-950 dark:text-white">{copy.salesOverview}</h2>
              </div>
              <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
                <div className="min-w-0 border-b border-gray-200 p-4 dark:border-gray-800 lg:border-b-0 lg:border-r">
                  <h3 className="text-[12px] font-medium text-gray-600 dark:text-gray-300">{copy.ordersByHour}</h3>
                  {validOrders.length ? <ChartBox data={hourly} copy={copy} /> : <div className="flex h-56 items-center justify-center text-[12px] text-gray-400">{copy.noSales}</div>}
                </div>
                <div className="p-4">
                  <h3 className="text-[12px] font-medium text-gray-600 dark:text-gray-300">{copy.topItems}</h3>
                  {topItems.length ? (
                    <ol className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                      {topItems.map((item, index) => (
                        <li key={item.name} className="flex items-center gap-3 py-3 first:pt-1">
                          <span className="font-mono text-[11px] text-gray-400">{String(index + 1).padStart(2, "0")}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                          <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-gray-950 dark:text-white">{item.sold} {copy.dishes}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="py-10 text-center text-[12px] text-gray-400">{copy.noSales}</p>}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div>
                  <h2 className="text-[14px] font-semibold text-gray-950 dark:text-white">{copy.dailyOrders}</h2>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{validOrders.length} {copy.order}</p>
                </div>
                <button type="button" onClick={() => router.push("/orders")} className="ui-press inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.viewAllOrders}<ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
              {orders.length ? (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <div className="hidden grid-cols-[minmax(100px,0.65fr)_minmax(140px,1fr)_minmax(110px,0.7fr)_110px_70px] gap-3 bg-gray-50 px-4 py-2 text-[10px] font-medium text-gray-500 dark:bg-gray-900/50 dark:text-gray-400 sm:grid">
                    <span>{copy.order}</span><span>{copy.location}</span><span>{copy.status}</span><span className="text-right">{copy.total}</span><span className="text-right">{copy.time}</span>
                  </div>
                  {orders.slice(0, 10).map((order) => (
                    <button key={order.ID} type="button" onClick={() => router.push(orderPosHref(order))} className="ui-press grid w-full gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900 sm:grid-cols-[minmax(100px,0.65fr)_minmax(140px,1fr)_minmax(110px,0.7fr)_110px_70px] sm:items-center sm:gap-3">
                      <span className="font-mono text-[12px] font-semibold text-gray-950 dark:text-white">#{order.order_number}</span>
                      <span className="truncate text-[12px] text-gray-600 dark:text-gray-300">{orderLocationLabel(order, language)}</span>
                      <span><span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${orderStatusClass(order.status)}`}>{orderStatusLabel(order.status, copy)}</span></span>
                      <span className="font-mono text-[12px] font-semibold tabular-nums text-gray-950 dark:text-white sm:text-right">{formatCurrency(order.grand_total || order.total_amount, language)}</span>
                      <span className="font-mono text-[11px] text-gray-400 sm:text-right">{new Date(order.opened_at).toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                    </button>
                  ))}
                </div>
              ) : <div className="flex flex-col items-center justify-center px-4 py-12 text-center"><ReceiptText className="h-5 w-5 text-gray-300" /><p className="mt-2 text-[12px] text-gray-400">{copy.noOrders}</p></div>}
            </section>

            {isToday ? (
              <section className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                  <div>
                    <h2 className="text-[14px] font-semibold text-gray-950 dark:text-white">{copy.floorStatus}</h2>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.occupied} {occupied.length} · {copy.available} {tables.filter((table) => table.status === "available").length} · {copy.reserved} {tables.filter((table) => table.status === "reserved").length}</p>
                  </div>
                  <button type="button" onClick={() => router.push("/pos/tables")} className="ui-press inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.openPOS}<ArrowRight className="h-3.5 w-3.5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {tables.map((table) => (
                    <button key={table.key} type="button" onClick={() => router.push("/pos/tables")} className="ui-press min-h-24 bg-white p-3 text-left hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-gray-950 dark:text-white">{table.label}</span>
                        <span className={`text-[10px] font-semibold ${table.status === "occupied" ? "text-amber-600" : table.status === "available" ? "text-emerald-600" : table.status === "reserved" ? "text-sky-600" : "text-gray-400"}`}>{copy[table.status]}</span>
                      </div>
                      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{table.guests ? `${table.guests} ${copy.people}` : table.zone || ""}</p>
                      {table.minutes !== undefined ? <p className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-gray-400"><Clock className="h-3 w-3" />{table.minutes} {copy.minutes}</p> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        {lastUpdated ? <p className="pb-1 text-right text-[10px] text-gray-400 dark:text-gray-500">{copy.updated} {lastUpdated.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}</p> : null}
      </div>
    </div>
  );
}
