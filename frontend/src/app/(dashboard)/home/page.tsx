"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Clock,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { formatCurrency } from "@/src/lib/format";
import { listIngredients } from "@/src/lib/ingredient";
import { kitchenQueue, listOrders } from "@/src/lib/order";
import { listMembers } from "@/src/lib/restaurant";
import { listTables } from "@/src/lib/table";
import type { Ingredient } from "@/src/types/ingredient";
import type { Order, OrderItem } from "@/src/types/order";
import type { Membership } from "@/src/types/restaurant";
import type { RestaurantTable } from "@/src/types/table";

type LaneStatus = "delayed" | "cooking" | "ready";
type FloorStatus = "occupied" | "available" | "reserved" | "inactive";
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
type HourlyPoint = { dateTime: string; hour: string; orders: number };
type Copy = ReturnType<typeof buildCopy>;

const activeOrderStatuses = ["open", "sent_to_kitchen", "cooking", "ready", "served"];

function minutesSince(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

function formatDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join("-") + ` ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function userNameOf(member: Membership, language: "th" | "en") {
  const user = member.user;
  if (!user) return language === "th" ? "ยังไม่ระบุชื่อ" : "Unnamed staff";
  if (user.nickname?.trim()) return user.nickname.trim();
  const name = [user.first_name, user.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
  return name || user.email;
}

function roleLabel(roleName: string, language: "th" | "en") {
  const labels: Record<string, Record<"th" | "en", string>> = {
    owner: { th: "เจ้าของร้าน", en: "Owner" },
    manager: { th: "ผู้จัดการ", en: "Manager" },
    cashier: { th: "แคชเชียร์", en: "Cashier" },
    waiter: { th: "เสิร์ฟ", en: "Service" },
    chef: { th: "ครัว", en: "Kitchen" },
  };
  return labels[roleName]?.[language] ?? roleName;
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
        inactive: "ปิดใช้งาน",
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
        inactive: "Inactive",
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
          <XAxis dataKey="dateTime" tickFormatter={(_, index) => data[index]?.hour ?? ""} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.06)" }}
            formatter={(value) => [`${value} ${copy.orders}`, copy.ordersByHour]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
            {data.map((point) => (
              <Cell key={point.hour} fill={point.orders >= 4 ? "#475569" : point.orders >= 2 ? "#94a3b8" : "#e2e8f0"} />
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

function orderLocationLabel(order: Order, language: "th" | "en") {
  if (order.order_type === "takeaway") {
    const base = language === "th" ? "กลับบ้าน" : "Takeaway";
    return order.customer_name?.trim() ? `${base} · ${order.customer_name.trim()}` : base;
  }
  return order.table?.display_label || order.table?.table_number || (order.table_id ? String(order.table_id) : "-");
}

function itemSummaryLabel(item: OrderItem, language: "th" | "en") {
  const prefix = item.fulfillment_type === "takeaway"
    ? language === "th" ? "[กลับบ้าน] " : "[Takeaway] "
    : "";
  return `${prefix}${item.quantity}x ${item.menu_name}`;
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
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [floorError, setFloorError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOperations = async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setFloorError("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [tableRes, orderRes, kitchenRes, ingredientRes, memberRes] = await Promise.all([
        listTables(),
        listOrders({ date: today }),
        kitchenQueue(),
        listIngredients().catch(() => ({ data: { ingredients: [] } })),
        activeMembership?.restaurant_id
          ? listMembers(activeMembership.restaurant_id).catch(() => ({ data: { members: [] } }))
          : Promise.resolve({ data: { members: [] } }),
      ]);
      const nextOrders = orderRes.data.orders ?? [];
      const activeOrderByTable = new Map<number, Order>();
      nextOrders
        .filter((order) => activeOrderStatuses.includes(order.status) && order.table_id)
        .forEach((order) => activeOrderByTable.set(order.table_id as number, order));
      setOrders(nextOrders);
      setKitchenOrders(kitchenRes.data.orders ?? []);
      setTables((tableRes.data.tables ?? []).map((table) => toFloorTable(table, activeOrderByTable.get(table.ID))));
      setIngredients(ingredientRes.data.ingredients ?? []);
      setMembers(memberRes.data.members ?? []);
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
      table: orderLocationLabel(order, language),
      items: order.items?.map((item) => itemSummaryLabel(item, language)) ?? [],
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
  const takeawayOrdersCount = orders.filter((order) => order.order_type === "takeaway" && activeOrderStatuses.includes(order.status)).length;

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
    const pointDate = new Date(now);
    pointDate.setHours(hourNumber, 0, 0, 0);
    return {
      dateTime: formatDateTime(pointDate),
      hour: String(hourNumber).padStart(2, "0"),
      orders: orders.filter((order) => new Date(order.opened_at).getHours() === hourNumber).length,
    };
  });

  const lowStock = ingredients
    .filter((item) => item.min_stock > 0 && item.stock <= item.min_stock * 1.5)
    .sort((a, b) => (a.stock / a.min_stock) - (b.stock / b.min_stock))
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      left: item.stock,
      unit: item.unit,
      critical: item.stock <= item.min_stock,
    }));
  const staff = Array.from(
    members.reduce((map, member) => {
      const roleName = member.role?.name ?? "staff";
      const current = map.get(roleName) ?? { roleName, members: [] as Membership[] };
      current.members.push(member);
      map.set(roleName, current);
      return map;
    }, new Map<string, { roleName: string; members: Membership[] }>()),
  ).map(([, group]) => {
    const active = group.members.filter((member) => member.status === "active");
    return {
      role: roleLabel(group.roleName, language),
      on: active.length,
      total: group.members.length,
      lead: active[0] ? userNameOf(active[0], language) : copy.noItems,
    };
  });

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


  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex w-full flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-800 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>{copy.open}</span>
              </div>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span>
                {dateLabel} · {timeLabel}
              </span>
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
            <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
              {user ? `${copy.greeting} ${user.nickname?.trim() || user.first_name} · ` : ""}
              {copy.subtitle}
            </p>
          </div>
          {lastUpdated ? (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 md:mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
              <span>
                {copy.updated} {lastUpdated.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ) : null}
        </header>

        {/* Stats Grid Strip */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800 xl:grid-cols-4">
          {[
            { label: copy.kitchenDelayed, value: delayed.length, helper: copy.kitchenDelayedHelp, active: delayed.length > 0, statusColor: "bg-red-500" },
            { label: copy.activeTables, value: `${occupied.length}/${tables.length}`, helper: `${guestCount} ${copy.activeTablesHelp}`, active: occupied.length > 0, statusColor: "bg-amber-500" },
            { label: copy.readyToServe, value: ready.length, helper: copy.readyToServeHelp, active: ready.length > 0, statusColor: "bg-emerald-500" },
            { label: copy.shiftRevenue, value: formatCurrency(shiftRevenue, language), helper: `${copy.shiftRevenueHelp} ${formatCurrency(avgTicket, language)}`, active: false, statusColor: "bg-slate-500" },
          ].map((stat) => {
            return (
              <div key={stat.label} className="relative bg-white p-4 dark:bg-gray-950">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">{stat.label}</p>
                  {stat.active && (
                    <span className="flex h-2 w-2 rounded-full relative">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stat.statusColor}`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${stat.statusColor}`} />
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{stat.value}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{stat.helper}</p>
              </div>
            );
          })}
        </div>

        {/* Main Work lanes & Signals split */}
        <main className="grid gap-6 xl:grid-cols-[minmax(0,1.72fr)_minmax(300px,0.78fr)]">
          {/* Kitchen Queue Grid Panel */}
          <div className="flex flex-col rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/10">
              <h2 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.kitchenQueue}</h2>
              <span className="font-mono text-[11px] text-gray-400">
                {tickets.length} {copy.tickets}
              </span>
            </div>

            <div className="grid gap-px bg-gray-200 dark:bg-gray-800 md:grid-cols-3">
              {lanes.map((lane) => {
                const Icon = lane.icon;
                return (
                  <div key={lane.key} className="flex flex-col bg-white dark:bg-gray-950">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800/60 bg-gray-50/20 dark:bg-gray-900/5">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${lane.color}`} />
                        <h3 className="text-[12px] font-semibold text-gray-900 dark:text-white">
                          {lane.title} <span className="font-mono text-gray-400">({lane.items.length})</span>
                        </h3>
                      </div>
                    </div>
                    <div className="flex-1 divide-y divide-gray-100 dark:divide-gray-800/60">
                      {lane.items.length === 0 ? (
                        <div className="px-4 py-8 text-center text-[12px] text-gray-400 dark:text-gray-500">
                          {copy.noItems}
                        </div>
                      ) : (
                        lane.items.slice(0, 5).map((ticket) => (
                          <button
                            key={ticket.id}
                            type="button"
                            onClick={() => router.push(`/pos/orders/${ticket.orderNumber}`)}
                            className="group block w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-semibold text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                                {ticket.table}
                              </span>
                              <span className="font-mono text-[11px] text-gray-400">#{ticket.orderNumber}</span>
                            </div>
                            <p className="mt-1 truncate text-[12px] text-gray-500 dark:text-gray-400">
                              {ticket.items.join(" · ") || copy.noItems}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${lane.color}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {ticket.waited} {copy.minutes}
                              </span>
                              <span className="font-mono text-[11px] text-gray-400">{formatCurrency(ticket.total, language)}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar Signals Panel */}
          <div className="flex flex-col rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800/60">
            {/* Stock Notes */}
            <div className="p-4">
              <h3 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.stockNotes}</h3>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{copy.needsAttentionHelp}</p>
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800/60">
                {lowStock.length ? lowStock.map((item) => (
                  <li key={item.name} className="flex items-center justify-between py-2.5 text-[12px] first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-1.5 w-1.5 rounded-full ${item.critical ? "bg-red-500 animate-pulse" : "bg-amber-500"}`} />
                      <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
                    </div>
                    <span className="font-mono font-semibold text-gray-950 dark:text-white shrink-0">
                      {item.left.toLocaleString()} {item.unit}
                    </span>
                  </li>
                )) : (
                  <li className="py-2.5 text-[12px] text-gray-400 dark:text-gray-500">{copy.noItems}</li>
                )}
              </ul>
            </div>

            {/* Team Notes */}
            <div className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <h3 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.teamNotes}</h3>
              </div>
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800/60">
                {staff.length ? staff.map((member) => {
                  const full = member.on === member.total;
                  return (
                    <li key={member.role} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-[12px]">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate block">{member.role}</span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate block">{member.lead}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`font-mono font-semibold ${full ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {member.on}/{member.total}
                        </span>
                      </div>
                    </li>
                  );
                }) : (
                  <li className="py-2.5 text-[12px] text-gray-400 dark:text-gray-500">{copy.noItems}</li>
                )}
              </ul>
            </div>
          </div>
        </main>

        {/* Pulse and Top Selling Section */}
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <div className="grid gap-px bg-gray-200 dark:bg-gray-800 xl:grid-cols-[1.15fr_0.85fr]">
            {/* Hourly Chart Column */}
            <div className="bg-white p-4 dark:bg-gray-950">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                <h2 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.ordersByHour}</h2>
                <div className="hidden gap-5 text-right sm:flex">
                  <div>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 mr-2">{copy.openOrders}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-gray-950 dark:text-white">{orders.filter((order) => activeOrderStatuses.includes(order.status)).length}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 mr-2">{copy.averageBill}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-gray-950 dark:text-white">{formatCurrency(avgTicket, language)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <ChartBox data={hourly} copy={copy} />
              </div>
            </div>

            {/* Top Selling Items Column */}
            <div className="bg-white p-4 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 xl:border-t-0">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
                <Sparkles className="h-4 w-4 text-gray-400" />
                <h2 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.topItems}</h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800/60 mt-1">
                {topItems.length ? (
                  topItems.map((item, index) => {
                    const maxSold = topItems[0]?.sold || 1;
                    const percentage = Math.round((item.sold / maxSold) * 100);
                    return (
                      <div key={item.name} className="py-2.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-mono text-gray-400">0{index + 1}</span>
                            <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
                          </div>
                          <span className="font-mono font-semibold text-gray-950 dark:text-white shrink-0">{item.sold}</span>
                        </div>
                        <div className="mt-1.5 h-1 w-full rounded-full bg-gray-100 dark:bg-gray-800/60">
                          <div 
                            className="h-1 rounded-full bg-slate-600 dark:bg-slate-400" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-[12px] text-gray-400 dark:text-gray-500">{copy.noTopItems}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Floor Status & Table Layout */}
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
          {/* Section Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/10">
            <div>
              <h2 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.floorStatus}</h2>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                {tables.filter(t => t.status === 'occupied').length} โต๊ะกำลังใช้งาน · แขกรวม {guestCount} คน · ออเดอร์กลับบ้าน active {takeawayOrdersCount} รายการ
              </p>
            </div>
            {floorError ? <p className="text-[12px] text-red-600 dark:text-red-300">{floorError}</p> : null}
          </div>

          {/* Grid divided status numbers */}
          <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 sm:grid-cols-4 border-b border-gray-100 dark:border-gray-800">
            {[
              { label: copy.occupied, value: tables.filter((table) => table.status === "occupied").length, dot: "bg-amber-500" },
              { label: copy.available, value: tables.filter((table) => table.status === "available").length, dot: "bg-emerald-500" },
              { label: copy.inactive, value: tables.filter((table) => table.status === "inactive").length, dot: "bg-gray-300 dark:bg-gray-700" },
              { label: "กลับบ้าน (Active)", value: takeawayOrdersCount, dot: "bg-orange-500" }
            ].map((item) => (
              <div key={item.label} className="bg-white p-4 dark:bg-gray-950">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">{item.label}</span>
                </div>
                <p className="mt-1 text-xl font-bold font-mono tracking-tight text-gray-900 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Floor grid */}
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 bg-gray-50/10 dark:bg-gray-900/5">
            {loading && !hasLoadedRef.current ? (
              <div className="col-span-full flex items-center justify-center py-6 gap-2 text-[12px] text-gray-400 dark:text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {copy.loading}
              </div>
            ) : tables.length ? (
              tables.map((table) => (
                <div 
                  key={table.id} 
                  className="relative rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{table.id}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      table.status === 'occupied' ? 'bg-amber-500' :
                      table.status === 'available' ? 'bg-emerald-500' :
                      table.status === 'reserved' ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-700'
                    }`} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {table.guests ? `${table.guests} ${copy.people}` : (table.status === 'available' ? copy.available : copy.inactive)}
                  </p>
                  {table.mins ? (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 font-mono">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{table.mins} {copy.minutes}</span>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="col-span-full py-6 text-center text-[12px] text-gray-400 dark:text-gray-500">{copy.noItems}</div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/orders")}
          className="inline-flex w-fit items-center gap-2 text-[12px] font-semibold text-gray-500 transition-colors hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-400"
        >
          {copy.orders}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
