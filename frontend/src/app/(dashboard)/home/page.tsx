"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useAuth } from "@/src/providers/AuthProvider";
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";

// ─── types & data ─────────────────────────────────────────────────────────────
type OrderStatus = "cooking" | "ready" | "delayed" | "served";
type TableStatus = "occupied" | "available" | "reserved" | "cleaning";
type DashboardWidgetId = "orders" | "lowStock" | "reservations" | "floor" | "hourly" | "topItems" | "staff";
type WidgetPointerDrag = {
  id: DashboardWidgetId;
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  active: boolean;
};

type Order = {
  id: number; table: string; items: string[]; waited: number;
  status: OrderStatus; total: number;
};

const ORDERS: Order[] = [
  { id: 1044, table: "T3",   items: ["ข้าวมันไก่ ×2", "น้ำส้ม"],                  waited: 22, status: "delayed", total: 220 },
  { id: 1042, table: "T7",   items: ["ผัดกะเพราหมู", "ต้มยำกุ้ง", "ข้าวเปล่า ×2"], waited: 16, status: "cooking", total: 540 },
  { id: 1047, table: "T5",   items: ["แกงมัสมั่นเนื้อ"],                          waited: 12, status: "cooking", total: 280 },
  { id: 1046, table: "T9",   items: ["ผัดไทย", "ส้มตำไทย"],                       waited: 9,  status: "ready",   total: 240 },
  { id: 1043, table: "T12",  items: ["สเต็กหมู", "สลัดผัก"],                      waited: 6,  status: "cooking", total: 380 },
  { id: 1048, table: "Take", items: ["ข้าวผัดกุ้ง"],                              waited: 4,  status: "cooking", total: 160 },
  { id: 1045, table: "Bar1", items: ["มะนาวโซดา", "ชาเย็น", "เบียร์ช้าง"],          waited: 3,  status: "cooking", total: 280 },
];

const TABLES: { id: string; status: TableStatus; mins?: number; guests?: number }[] = [
  { id: "T1",  status: "occupied", mins: 35, guests: 4 },  { id: "T2",  status: "occupied", mins: 12, guests: 2 },
  { id: "T3",  status: "occupied", mins: 48, guests: 3 },  { id: "T4",  status: "available" },
  { id: "T5",  status: "occupied", mins: 22, guests: 2 },  { id: "T6",  status: "cleaning" },
  { id: "T7",  status: "occupied", mins: 18, guests: 4 },  { id: "T8",  status: "reserved" },
  { id: "T9",  status: "occupied", mins: 8,  guests: 2 },  { id: "T10", status: "available" },
  { id: "T11", status: "occupied", mins: 55, guests: 6 },  { id: "T12", status: "occupied", mins: 6,  guests: 2 },
  { id: "T13", status: "occupied", mins: 28, guests: 3 },  { id: "T14", status: "reserved" },
  { id: "T15", status: "occupied", mins: 15, guests: 4 },  { id: "T16", status: "occupied", mins: 40, guests: 5 },
  { id: "T17", status: "available" },                       { id: "T18", status: "occupied", mins: 25, guests: 2 },
  { id: "T19", status: "occupied", mins: 32, guests: 4 },  { id: "T20", status: "available" },
];

const LOW_STOCK = [
  { name: "ข้าวสวย",     left: 8,   unit: "จาน",  severity: "critical" as const },
  { name: "กุ้งสด",       left: 12,  unit: "ตัว",   severity: "critical" as const },
  { name: "ไข่ไก่",        left: 18,  unit: "ฟอง",  severity: "warning"  as const },
  { name: "น้ำปลา",       left: 2,   unit: "ขวด",   severity: "warning"  as const },
  { name: "หมูสับ",       left: 1.5, unit: "กก.",   severity: "warning"  as const },
];

const RESERVATIONS = [
  { time: "19:30", table: "T8",  guests: 4, name: "คุณสมชาย",  note: "งานวันเกิด" },
  { time: "20:00", table: "T14", guests: 6, name: "คุณนภา" },
  { time: "20:30", table: "T2",  guests: 2, name: "คุณอาทิตย์" },
];

const STAFF = [
  { role: "ครัว",       on: 4, total: 4, lead: "เชฟอภิชัย" },
  { role: "เสิร์ฟ",     on: 5, total: 6, lead: "พี่หน่อย" },
  { role: "แคชเชียร์", on: 2, total: 2, lead: "พี่แอน" },
  { role: "ผู้จัดการ",  on: 1, total: 1, lead: "คุณวิชัย" },
];

const HOURLY = [
  { hour: "11", orders: 12 }, { hour: "12", orders: 28 }, { hour: "13", orders: 22 },
  { hour: "14", orders: 14 }, { hour: "15", orders: 9 },  { hour: "16", orders: 11 },
  { hour: "17", orders: 19 }, { hour: "18", orders: 38 }, { hour: "19", orders: 47 },
  { hour: "20", orders: 0 },  { hour: "21", orders: 0 },  { hour: "22", orders: 0 },
];

const TOP_ITEMS_TODAY = [
  { name: "ผัดกะเพรา",    sold: 24, stock: "พอ" },
  { name: "ต้มยำกุ้ง",    sold: 18, stock: "ใกล้หมด" },
  { name: "ข้าวมันไก่",   sold: 16, stock: "ใกล้หมด" },
  { name: "ผัดไทย",       sold: 14, stock: "พอ" },
  { name: "ข้าวผัดกุ้ง",  sold: 12, stock: "พอ" },
];

const DASHBOARD_WIDGET_STORAGE_KEY = "restaurant-dashboard-widget-order";

const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetId[] = [
  "orders",
  "lowStock",
  "reservations",
  "floor",
  "hourly",
  "topItems",
  "staff",
];

const WIDGET_META: Record<DashboardWidgetId, { label: string; className: string }> = {
  orders: { label: "ครัวกำลังทำ", className: "lg:col-span-8" },
  lowStock: { label: "ของใกล้หมด", className: "lg:col-span-4" },
  reservations: { label: "การจองคืนนี้", className: "lg:col-span-4" },
  floor: { label: "ผังโต๊ะ", className: "lg:col-span-7" },
  hourly: { label: "ออเดอร์รายชั่วโมง", className: "lg:col-span-5" },
  topItems: { label: "เมนูขายดี", className: "lg:col-span-6" },
  staff: { label: "พนักงานในกะ", className: "lg:col-span-6" },
};

// ─── status visual mapping ────────────────────────────────────────────────────
const ORDER_STATUS = {
  cooking:  { label: "กำลังทำ",  dot: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-900/20" },
  ready:    { label: "พร้อมเสิร์ฟ", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
  delayed:  { label: "เกินเวลา", dot: "bg-red-500",      text: "text-red-700 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-900/20" },
  served:   { label: "เสิร์ฟแล้ว", dot: "bg-slate-400",   text: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-50 dark:bg-slate-800" },
} as const;

const TABLE_STATUS = {
  occupied:  { label: "ใช้งาน",  cls: "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-200" },
  available: { label: "ว่าง",    cls: "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700/50 dark:text-emerald-200" },
  reserved:  { label: "จองไว้",  cls: "bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-900/20 dark:border-sky-700/50 dark:text-sky-200" },
  cleaning:  { label: "ทำความสะอาด", cls: "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400" },
} as const;

// ─── small UI helpers ─────────────────────────────────────────────────────────
function SectionHeader({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h2 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{title}</h2>
        {hint && <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex w-2 h-2">
      {pulse && <span className={`absolute inset-0 rounded-full ${color} opacity-60 animate-ping`} />}
      <span className={`relative w-2 h-2 rounded-full ${color}`} />
    </span>
  );
}

// ─── live clock ───────────────────────────────────────────────────────────────
function useNowTH() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── chart tooltip ────────────────────────────────────────────────────────────
const HourlyTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-md px-2.5 py-1.5 text-[11px]">
      <p className="text-gray-500">{label}:00 น.</p>
      <p className="font-semibold text-gray-900 dark:text-white">{payload[0].value} ออเดอร์</p>
    </div>
  );
};

function normalizeWidgetOrder(raw: string[] | null): DashboardWidgetId[] {
  if (!raw) return DEFAULT_DASHBOARD_WIDGETS;

  const valid = new Set<DashboardWidgetId>(DEFAULT_DASHBOARD_WIDGETS);
  const seen = new Set<DashboardWidgetId>();
  const ordered = raw.filter((id): id is DashboardWidgetId => {
    if (!valid.has(id as DashboardWidgetId) || seen.has(id as DashboardWidgetId)) return false;
    seen.add(id as DashboardWidgetId);
    return true;
  });

  return [
    ...ordered,
    ...DEFAULT_DASHBOARD_WIDGETS.filter((id) => !seen.has(id)),
  ];
}

function moveWidget(order: DashboardWidgetId[], fromId: DashboardWidgetId, toId: DashboardWidgetId) {
  const fromIndex = order.indexOf(fromId);
  const toIndex = order.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;

  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function getWidgetIdFromPoint(clientX: number, clientY: number, excludeId?: DashboardWidgetId): DashboardWidgetId | null {
  const element = document
    .elementsFromPoint(clientX, clientY)
    .find((item) => (
      item instanceof HTMLElement
      && item.dataset.dashboardWidgetId
      && item.dataset.dashboardWidgetId !== excludeId
    ));

  return element instanceof HTMLElement
    ? (element.dataset.dashboardWidgetId as DashboardWidgetId)
    : null;
}

function runWidgetLayoutTransition(update: () => void) {
  const viewTransitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };

  if (!viewTransitionDocument.startViewTransition) {
    update();
    return;
  }

  try {
    viewTransitionDocument.startViewTransition(() => {
      flushSync(update);
    });
  } catch {
    update();
  }
}

function DashboardWidgetFrame({
  id,
  orderIndex,
  draggingWidget,
  onPointerDownWidget,
  onPointerMoveWidget,
  onPointerEndWidget,
  children,
}: {
  id: DashboardWidgetId;
  orderIndex: number;
  draggingWidget: DashboardWidgetId | null;
  onPointerDownWidget: (id: DashboardWidgetId, event: React.PointerEvent<HTMLElement>) => void;
  onPointerMoveWidget: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerEndWidget: (event: React.PointerEvent<HTMLElement>) => void;
  children: React.ReactNode;
}) {
  const isDragging = draggingWidget === id;
  const isDropTarget = draggingWidget !== null && draggingWidget !== id;
  const widgetStyle = {
    order: orderIndex,
    viewTransitionName: `dashboard-widget-${id}`,
  } as React.CSSProperties & { viewTransitionName: string };

  return (
    <section
      role="button"
      tabIndex={0}
      data-dashboard-widget-id={id}
      title={`ลากการ์ด ${WIDGET_META[id].label}`}
      aria-label={`ลากการ์ด ${WIDGET_META[id].label} เพื่อเปลี่ยนตำแหน่ง`}
      className={`${WIDGET_META[id].className} relative group h-full rounded-md cursor-default select-none touch-none will-change-transform transition-[opacity,box-shadow,outline-color] duration-150 ease-out ${isDragging ? "z-[5] opacity-85 shadow-2xl ring-2 ring-orange-300/70 dark:ring-orange-600/60" : "opacity-100"} ${isDropTarget ? "outline outline-2 outline-transparent hover:outline-orange-300/70 dark:hover:outline-orange-600/50" : ""}`}
      style={widgetStyle}
      onPointerDown={(event) => onPointerDownWidget(id, event)}
      onPointerMove={onPointerMoveWidget}
      onPointerUp={onPointerEndWidget}
      onPointerCancel={onPointerEndWidget}
      onLostPointerCapture={onPointerEndWidget}
    >
      {children}
    </section>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const now = useNowTH();
  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetId[]>(DEFAULT_DASHBOARD_WIDGETS);
  const [draggingWidget, setDraggingWidget] = useState<DashboardWidgetId | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragOffsetFrameRef = useRef<number | null>(null);
  const lastDragTargetRef = useRef<DashboardWidgetId | null>(null);
  const pointerDragRef = useRef<WidgetPointerDrag | null>(null);

  // derived ops stats
  const tablesUsed = TABLES.filter(t => t.status === "occupied").length;
  const tablesTotal = TABLES.length;
  const cooking = ORDERS.filter(o => o.status === "cooking").length;
  const overdue = ORDERS.filter(o => o.waited >= 15).length;
  const readyCount = ORDERS.filter(o => o.status === "ready").length;
  const shiftRevenue = 18640;
  const shiftOrders = 87;

  const dateLabel = now.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(DASHBOARD_WIDGET_STORAGE_KEY);
        setWidgetOrder(normalizeWidgetOrder(saved ? JSON.parse(saved) : null));
      } catch {
        setWidgetOrder(DEFAULT_DASHBOARD_WIDGETS);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      if (dragOffsetFrameRef.current !== null) {
        window.cancelAnimationFrame(dragOffsetFrameRef.current);
      }
    };
  }, []);

  const persistWidgetOrder = (next: DashboardWidgetId[]) => {
    try {
      window.localStorage.setItem(DASHBOARD_WIDGET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Local storage can be unavailable in private windows; the live layout still updates.
    }
  };

  const updateWidgetOrder = (next: DashboardWidgetId[]) => {
    runWidgetLayoutTransition(() => {
      setWidgetOrder(next);
    });
    persistWidgetOrder(next);
  };

  const moveDraggingWidgetOver = (targetId: DashboardWidgetId, draggingId: DashboardWidgetId) => {
    if (draggingId === targetId) return;
    if (lastDragTargetRef.current === targetId) return;

    lastDragTargetRef.current = targetId;

    runWidgetLayoutTransition(() => {
      setWidgetOrder((current) => {
        const next = moveWidget(current, draggingId, targetId);
        persistWidgetOrder(next);
        return next;
      });
    });
  };

  const startWidgetDrag = (id: DashboardWidgetId) => {
    lastDragTargetRef.current = null;
    dragOffsetRef.current = { x: 0, y: 0 };
    setDraggingWidget(id);
  };

  const finishWidgetDrag = () => {
    lastDragTargetRef.current = null;
    pointerDragRef.current = null;
    if (dragOffsetFrameRef.current !== null) {
      window.cancelAnimationFrame(dragOffsetFrameRef.current);
      dragOffsetFrameRef.current = null;
    }
    dragOffsetRef.current = { x: 0, y: 0 };
    const draggedElement = draggingWidget
      ? document.querySelector<HTMLElement>(`[data-dashboard-widget-id="${draggingWidget}"]`)
      : null;
    if (draggedElement) {
      draggedElement.style.transform = "";
    }
    setDraggingWidget(null);
  };

  const updateDragOffset = (next: { x: number; y: number }) => {
    if (dragOffsetRef.current.x === next.x && dragOffsetRef.current.y === next.y) return;

    dragOffsetRef.current = next;
    if (dragOffsetFrameRef.current !== null) return;

    dragOffsetFrameRef.current = window.requestAnimationFrame(() => {
      dragOffsetFrameRef.current = null;
      const pointerDrag = pointerDragRef.current;
      if (!pointerDrag?.active) return;

      const draggedElement = document.querySelector<HTMLElement>(`[data-dashboard-widget-id="${pointerDrag.id}"]`);
      if (!draggedElement) return;

      draggedElement.style.transform = `translate3d(${dragOffsetRef.current.x}px, ${dragOffsetRef.current.y}px, 0)`;
    });
  };

  const handleWidgetPointerDown = (id: DashboardWidgetId, event: React.PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    pointerDragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top,
      active: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleWidgetPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.active && distance < 3) return;

    event.preventDefault();

    if (!pointerDrag.active) {
      pointerDrag.active = true;
      startWidgetDrag(pointerDrag.id);
    }

    const draggedElement = document.querySelector<HTMLElement>(`[data-dashboard-widget-id="${pointerDrag.id}"]`);
    if (draggedElement) {
      const rect = draggedElement.getBoundingClientRect();
      const baseLeft = rect.left - dragOffsetRef.current.x;
      const baseTop = rect.top - dragOffsetRef.current.y;
      updateDragOffset({
        x: event.clientX - pointerDrag.grabOffsetX - baseLeft,
        y: event.clientY - pointerDrag.grabOffsetY - baseTop,
      });
    }

    const targetId = getWidgetIdFromPoint(event.clientX, event.clientY, pointerDrag.id);
    if (targetId) {
      moveDraggingWidgetOver(targetId, pointerDrag.id);
    }
  };

  const handleWidgetPointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;

    if (pointerDrag.active) {
      event.preventDefault();
    }

    finishWidgetDrag();
  };

  const resetWidgetOrder = () => {
    updateWidgetOrder(DEFAULT_DASHBOARD_WIDGETS);
    finishWidgetDrag();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">

      {/* ── header: operational, not analytical ──────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="px-5 md:px-7 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[14px] font-semibold tracking-tight truncate">ภาพรวมร้านวันนี้</h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                <StatusDot color="bg-emerald-500" pulse />
                เปิดให้บริการ
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate" suppressHydrationWarning>
              {dateLabel} · กะเย็น 17:00–24:00 · เวลา {timeLabel}
              {user ? ` · ${user.first_name}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="รีเฟรชข้อมูล"
              className="inline-flex items-center gap-1.5 px-2.5 h-8 text-[12px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              <span className="hidden sm:inline">รีเฟรช</span>
            </button>
            <button
              type="button"
              aria-label="สร้างออเดอร์ใหม่"
              className="inline-flex items-center gap-1.5 px-2.5 h-8 text-[12px] font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-md hover:opacity-90 transition-opacity"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="hidden sm:inline">ออเดอร์ใหม่</span>
            </button>
          </div>
        </div>

        {/* ── ops summary strip (no cards, just inline stats) ──────────────── */}
        <div className="border-t border-gray-100 dark:border-gray-800/60">
          <div className="px-5 md:px-7 grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100 dark:divide-gray-800/60">
            <Stat label="โต๊ะใช้งาน" main={`${tablesUsed} / ${tablesTotal}`} hint={`${Math.round(tablesUsed / tablesTotal * 100)}% เต็ม`} tone="amber" />
            <Stat label="ครัวกำลังทำ" main={`${cooking} จาน`} hint={`พร้อมเสิร์ฟ ${readyCount}`} tone="info" />
            <Stat label="ออเดอร์ใกล้เกินเวลา" main={`${overdue} รายการ`} hint="เกิน 15 นาที" tone={overdue > 0 ? "red" : "neutral"} />
            <Stat label="รายได้กะนี้" main={`฿${shiftRevenue.toLocaleString()}`} hint={`${shiftOrders} ออเดอร์`} tone="neutral" />
          </div>
        </div>
      </div>

      {/* ── main content ─────────────────────────────────────────────────────── */}
      <div className="px-5 md:px-7 py-5 max-w-screen-2xl mx-auto">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-gray-500 dark:text-gray-500">
            ลากการ์ดจากจุดไหนก็ได้เพื่อจัดตำแหน่งหน้าภาพรวมในแบบที่ทีมใช้งานถนัด
          </p>
          <button
            type="button"
            onClick={resetWidgetOrder}
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-[12px] font-medium text-gray-600 transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-orange-600 dark:hover:text-orange-400"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 3v6h6" />
            </svg>
            คืนค่า layout
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* row 1 — Order Queue (lg col-span-2) + Alerts/Reservations stack */}
        <>

          {/* Kitchen / Order Queue */}
          <DashboardWidgetFrame
            id="orders"
            orderIndex={widgetOrder.indexOf("orders")}
            draggingWidget={draggingWidget}
            onPointerDownWidget={handleWidgetPointerDown}
            onPointerMoveWidget={handleWidgetPointerMove}
            onPointerEndWidget={handleWidgetPointerEnd}
          >
          <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-[13px] font-semibold tracking-tight">ครัวกำลังทำ</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">เรียงตามเวลารอ · {ORDERS.length} ออเดอร์ในคิว</p>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Legend dot="bg-red-500" label={`เกินเวลา ${overdue}`} />
                <Legend dot="bg-amber-500" label={`กำลังทำ ${cooking}`} />
                <Legend dot="bg-emerald-500" label={`พร้อมเสิร์ฟ ${readyCount}`} />
              </div>
            </div>

            <div>
              {/* desktop table-like header */}
              <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800/60">
                <span className="col-span-1">#</span>
                <span className="col-span-1">โต๊ะ</span>
                <span className="col-span-5">รายการ</span>
                <span className="col-span-2 text-right">เวลารอ</span>
                <span className="col-span-2 text-right">ยอด</span>
                <span className="col-span-1 text-right">สถานะ</span>
              </div>

              <ul>
                {ORDERS.map(o => {
                  const s = ORDER_STATUS[o.status];
                  const overdueRow = o.waited >= 15;
                  return (
                    <li
                      key={o.id}
                      className={`px-4 py-3 text-[12px] border-b border-gray-50 dark:border-gray-800/40 last:border-0 hover:bg-slate-50/60 dark:hover:bg-gray-800/30 transition-colors ${overdueRow ? "bg-red-50/40 dark:bg-red-900/10" : ""}`}
                    >
                      {/* mobile: stacked compact rows */}
                      <div className="sm:hidden space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700 dark:text-gray-200">
                            <span className="font-mono text-gray-500">#{o.id}</span>
                            <span className="mx-1.5 text-gray-300 dark:text-gray-700">·</span>
                            <span className="font-semibold">{o.table}</span>
                          </span>
                          <span className={`font-semibold tabular-nums ${overdueRow ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                            {o.waited} นาที
                          </span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 leading-snug">{o.items.join(" · ")}</p>
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${s.bg} ${s.text}`}>
                            <StatusDot color={s.dot} pulse={o.status !== "served"} />
                            {s.label}
                          </span>
                          <span className="text-gray-500 tabular-nums">฿{o.total.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* desktop: table-like grid */}
                      <div className="hidden sm:grid sm:grid-cols-12 gap-2 items-center">
                        <span className="col-span-1 font-mono text-gray-500">#{o.id}</span>
                        <span className="col-span-1 font-semibold">{o.table}</span>
                        <span className="col-span-5 text-gray-700 dark:text-gray-300 leading-snug">{o.items.join(" · ")}</span>
                        <span className={`col-span-2 text-right font-semibold tabular-nums ${overdueRow ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                          {o.waited} นาที
                        </span>
                        <span className="col-span-2 text-right text-gray-500 tabular-nums">฿{o.total.toLocaleString()}</span>
                        <span className="col-span-1 text-right">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${s.bg} ${s.text}`}>
                            <StatusDot color={s.dot} pulse={o.status !== "served"} />
                            {s.label}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          </DashboardWidgetFrame>

          {/* right column: Alerts + Reservations stacked */}
          <>

            {/* low stock alerts */}
            <DashboardWidgetFrame
              id="lowStock"
              orderIndex={widgetOrder.indexOf("lowStock")}
              draggingWidget={draggingWidget}
              onPointerDownWidget={handleWidgetPointerDown}
              onPointerMoveWidget={handleWidgetPointerMove}
              onPointerEndWidget={handleWidgetPointerEnd}
            >
            <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-red-500">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <h2 className="text-[13px] font-semibold tracking-tight">ของใกล้หมด</h2>
                </div>
                <span className="text-[10px] font-medium text-red-600 dark:text-red-400 px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 rounded">
                  {LOW_STOCK.length} รายการ
                </span>
              </div>
              <ul>
                {LOW_STOCK.map((s, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2.5 text-[12px] border-b border-gray-50 dark:border-gray-800/40 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot color={s.severity === "critical" ? "bg-red-500" : "bg-amber-500"} />
                      <span className="text-gray-800 dark:text-gray-200 truncate">{s.name}</span>
                    </div>
                    <span className={`tabular-nums font-medium ${s.severity === "critical" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                      เหลือ {s.left} {s.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            </DashboardWidgetFrame>

            {/* reservations */}
            <DashboardWidgetFrame
              id="reservations"
              orderIndex={widgetOrder.indexOf("reservations")}
              draggingWidget={draggingWidget}
              onPointerDownWidget={handleWidgetPointerDown}
              onPointerMoveWidget={handleWidgetPointerMove}
              onPointerEndWidget={handleWidgetPointerEnd}
            >
            <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-[13px] font-semibold tracking-tight">การจองคืนนี้</h2>
                <span className="text-[10px] text-gray-400">{RESERVATIONS.length} รายการ</span>
              </div>
              <ul>
                {RESERVATIONS.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-[12px] border-b border-gray-50 dark:border-gray-800/40 last:border-0">
                    <div className="text-center shrink-0">
                      <p className="font-mono font-semibold text-gray-900 dark:text-white">{r.time}</p>
                    </div>
                    <div className="w-px h-7 bg-gray-100 dark:bg-gray-800" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 dark:text-gray-200 truncate">
                        <span className="font-semibold">{r.table}</span> · {r.guests} ท่าน · {r.name}
                      </p>
                      {r.note && <p className="text-[11px] text-gray-500 truncate">{r.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            </DashboardWidgetFrame>
          </>
        </>

        {/* row 2 — Floor status + Hourly chart */}
        <>

          {/* floor map */}
          <DashboardWidgetFrame
            id="floor"
            orderIndex={widgetOrder.indexOf("floor")}
            draggingWidget={draggingWidget}
            onPointerDownWidget={handleWidgetPointerDown}
            onPointerMoveWidget={handleWidgetPointerMove}
            onPointerEndWidget={handleWidgetPointerEnd}
          >
          <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-4">
            <SectionHeader
              title="ผังโต๊ะรอบปัจจุบัน"
              hint="สถานะโต๊ะแบบ real-time"
              right={
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <Legend dot="bg-amber-500" label="ใช้งาน" />
                  <Legend dot="bg-emerald-500" label="ว่าง" />
                  <Legend dot="bg-sky-500" label="จอง" />
                  <Legend dot="bg-slate-400" label="ทำความสะอาด" />
                </div>
              }
            />
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-5 xl:grid-cols-7 gap-1.5">
              {TABLES.map(t => {
                const s = TABLE_STATUS[t.status];
                return (
                  <button
                    key={t.id}
                    title={`${t.id} · ${s.label}${t.mins ? ` · ${t.mins} นาที` : ""}${t.guests ? ` · ${t.guests} ท่าน` : ""}`}
                    className={`aspect-square flex flex-col items-center justify-center border rounded-md text-[11px] font-semibold leading-tight hover:scale-[1.03] transition-transform ${s.cls}`}
                  >
                    <span>{t.id}</span>
                    {t.status === "occupied" && (
                      <span className="text-[9px] font-normal opacity-80 mt-0.5 tabular-nums">{t.mins}m</span>
                    )}
                    {t.status === "reserved" && <span className="text-[9px] font-normal opacity-80 mt-0.5">จอง</span>}
                    {t.status === "cleaning" && <span className="text-[9px] font-normal opacity-80 mt-0.5">ทำความสะอาด</span>}
                  </button>
                );
              })}
            </div>
          </div>
          </DashboardWidgetFrame>

          {/* hourly chart */}
          <DashboardWidgetFrame
            id="hourly"
            orderIndex={widgetOrder.indexOf("hourly")}
            draggingWidget={draggingWidget}
            onPointerDownWidget={handleWidgetPointerDown}
            onPointerMoveWidget={handleWidgetPointerMove}
            onPointerEndWidget={handleWidgetPointerEnd}
          >
          <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-4">
            <SectionHeader
              title="ออเดอร์รายชั่วโมง"
              hint="รอบเย็นเริ่มแน่น 18:00 เป็นต้นไป"
              right={
                <span className="text-[10px] text-gray-400">วันนี้</span>
              }
            />
            <ResponsiveContainer width="100%" height={186}>
              <BarChart data={HOURLY} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:opacity-30" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<HourlyTooltip />} />
                <Bar dataKey="orders" radius={[2, 2, 0, 0]} maxBarSize={22}>
                  {HOURLY.map((e, i) => {
                    const fill = e.orders === 0 ? "#e2e8f0"
                      : e.orders >= 40 ? "#f97316"
                      : e.orders >= 20 ? "#fb923c"
                      : "#fdba74";
                    return <Cell key={i} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-gray-400 mt-1">ชั่วโมงพีคของวันนี้: 19:00 (47 ออเดอร์)</p>
          </div>
          </DashboardWidgetFrame>
        </>

        {/* row 3 — top items today + staff on duty */}
        <>

          {/* top items today */}
          <DashboardWidgetFrame
            id="topItems"
            orderIndex={widgetOrder.indexOf("topItems")}
            draggingWidget={draggingWidget}
            onPointerDownWidget={handleWidgetPointerDown}
            onPointerMoveWidget={handleWidgetPointerMove}
            onPointerEndWidget={handleWidgetPointerEnd}
          >
          <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-4">
            <SectionHeader title="เมนูขายดีวันนี้" hint="นับตั้งแต่เปิดร้าน" />
            <ul className="space-y-1.5">
              {TOP_ITEMS_TODAY.map((it, i) => {
                const max = TOP_ITEMS_TODAY[0].sold;
                const pct = (it.sold / max) * 100;
                const lowStock = it.stock === "ใกล้หมด";
                return (
                  <li key={i} className="grid grid-cols-12 items-center gap-2 text-[12px]">
                    <span className="col-span-1 text-[11px] text-gray-400 tabular-nums">{i + 1}.</span>
                    <span className="col-span-4 truncate text-gray-800 dark:text-gray-200">{it.name}</span>
                    <div className="col-span-5 h-1.5 bg-slate-100 dark:bg-gray-800 rounded-sm overflow-hidden">
                      <div
                        className={`h-full rounded-sm ${lowStock ? "bg-amber-500" : "bg-orange-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="col-span-1 text-right text-gray-700 dark:text-gray-300 font-medium tabular-nums">{it.sold}</span>
                    <span className={`col-span-1 text-right text-[10px] ${lowStock ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>
                      {it.stock}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          </DashboardWidgetFrame>

          {/* staff on duty */}
          <DashboardWidgetFrame
            id="staff"
            orderIndex={widgetOrder.indexOf("staff")}
            draggingWidget={draggingWidget}
            onPointerDownWidget={handleWidgetPointerDown}
            onPointerMoveWidget={handleWidgetPointerMove}
            onPointerEndWidget={handleWidgetPointerEnd}
          >
          <div className="h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-4">
            <SectionHeader
              title="พนักงานในกะ"
              hint={`รวม ${STAFF.reduce((a, b) => a + b.on, 0)} คน · กะเย็น`}
              right={<button className="text-[11px] text-gray-500 hover:text-orange-500">ดูตาราง →</button>}
            />
            <ul className="space-y-2">
              {STAFF.map((s, i) => {
                const full = s.on === s.total;
                return (
                  <li key={i} className="flex items-center justify-between text-[12px] py-1.5 border-b border-gray-50 dark:border-gray-800/40 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1 h-6 rounded-sm ${full ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{s.role}</p>
                        <p className="text-[10px] text-gray-500">หัวหน้า: {s.lead}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums font-semibold">
                        <span className={full ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>{s.on}</span>
                        <span className="text-gray-400"> / {s.total}</span>
                      </p>
                      <p className="text-[10px] text-gray-400">{full ? "เต็มทีม" : "ขาด " + (s.total - s.on)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          </DashboardWidgetFrame>
        </>

        </div>
      </div>
    </div>
  );
}

// ─── small reusable bits below main ───────────────────────────────────────────
function Stat({ label, main, hint, tone }: {
  label: string; main: string; hint: string;
  tone: "neutral" | "amber" | "info" | "red";
}) {
  const toneCls =
    tone === "red"   ? "text-red-600 dark:text-red-400"
    : tone === "amber" ? "text-amber-700 dark:text-amber-400"
    : tone === "info"  ? "text-sky-700 dark:text-sky-400"
    : "text-gray-900 dark:text-white";
  return (
    <div className="px-4 py-3 first:pl-5 md:first:pl-7 last:pr-5 md:last:pr-7">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-[18px] font-bold tabular-nums leading-tight mt-0.5 ${toneCls}`}>{main}</p>
      <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{hint}</p>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {label}
    </span>
  );
}
