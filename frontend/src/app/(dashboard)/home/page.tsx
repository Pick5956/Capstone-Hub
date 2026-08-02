"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Loader2,
  PackageOpen,
  ReceiptText,
  Table2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
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
import { getManagerReport, getTopMenuItemsByMonth } from "@/src/lib/report";
import { listTables } from "@/src/lib/table";
import type { Ingredient } from "@/src/types/ingredient";
import type { ReportSalesDay, ReportTopMenuItem } from "@/src/types/report";
import RealtimeConnectionNotice from "@/src/components/shared/RealtimeConnectionNotice";
import { useOrderEvents } from "@/src/hooks/useOrderEvents";
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
type ChartPoint = { key: string; label: string; value: number };
type ChartMode = "hour" | "day" | "month";
type ChartMetric = "revenue" | "profit";
type Copy = ReturnType<typeof buildCopy>;

const activeOrderStatuses = new Set<OrderStatus>(["open", "sent_to_kitchen", "cooking", "ready", "served"]);

function minutesSince(value: string | null | undefined, now: Date) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((now.getTime() - time) / 60_000));
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
        loading: "กำลังโหลด",
        updated: "อัปเดต",
        ordersTotal: "ออเดอร์ทั้งหมด",
        paidRevenue: "ยอดรับชำระ",
        averageBill: "บิลเฉลี่ย",
        guestsTotal: "ลูกค้ารวม",
        activeOrders: "กำลังดำเนินการ",
        liveWork: "งานที่ต้องจัดการตอนนี้",
        liveWorkHint: "กดเพื่อไปยังหน้าที่จัดการงานนั้นได้ทันที",
        lateKitchen: "คิวครัวเกินเวลา",
        readyToServe: "ครัวทำเสร็จแล้ว",
        occupiedTables: "โต๊ะใช้งาน",
        lowStock: "วัตถุดิบควรเติม",
        kitchenQueue: "คิวครัว",
        viewKitchen: "เปิดหน้าครัว",
        delayed: "เกินเวลา",
        cooking: "กำลังทำ",
        ready: "เสร็จแล้ว",
        tickets: "ใบ",
        minutes: "นาที",
        noKitchen: "ไม่มีงานค้างในครัว",
        salesOverview: "สรุปยอดขาย",
        metricRevenue: "รายได้ทั้งหมด",
        metricProfit: "กำไร/ขาดทุน",
        chartTitleRevenueHour: "รายได้รายชั่วโมง",
        chartTitleRevenueDay: "รายได้รายวัน",
        chartTitleRevenueMonth: "รายได้รายเดือน",
        chartTitleProfitDay: "กำไร/ขาดทุนรายวัน",
        chartTitleProfitMonth: "กำไร/ขาดทุนรายเดือน",
        profitHourlyUnavailable: "ข้อมูลกำไร/ขาดทุนดูได้เฉพาะรายวันขึ้นไป",
        chartHour: "รายชั่วโมง",
        chartDay: "รายวัน",
        chartMonth: "รายเดือน",
        topItems: "เมนูขายดีประจำเดือน",
        otherItems: "อื่นๆ",
        previousMonth: "เดือนก่อน",
        nextMonth: "เดือนถัดไป",
        chooseMonth: "เลือกเดือน",
        noSales: "ยังไม่มีข้อมูลยอดขายในวันนี้",
        noSalesMonth: "ยังไม่มีข้อมูลยอดขายในเดือนนี้",
        sold: "ขาย",
        dishes: "จาน",
        dailyOrders: "รายการออเดอร์",
        viewAllOrders: "ดูออเดอร์ทั้งหมด",
        noOrders: "ไม่มีออเดอร์ในวันที่เลือก",
        floorStatus: "สถานะโต๊ะ",
        openOrderTaking: "รับออเดอร์",
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
        served: "เสร็จแล้ว",
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
        loading: "Loading",
        updated: "Updated",
        ordersTotal: "Total orders",
        paidRevenue: "Paid revenue",
        averageBill: "Average bill",
        guestsTotal: "Guests",
        activeOrders: "Active",
        liveWork: "Needs attention now",
        liveWorkHint: "Open the related workspace to handle it.",
        lateKitchen: "Late kitchen queue",
        readyToServe: "Kitchen completed",
        occupiedTables: "Occupied tables",
        lowStock: "Ingredients to refill",
        kitchenQueue: "Kitchen queue",
        viewKitchen: "Open kitchen",
        delayed: "Overdue",
        cooking: "Cooking",
        ready: "Done",
        tickets: "tickets",
        minutes: "mins",
        noKitchen: "No kitchen work waiting",
        salesOverview: "Daily sales",
        metricRevenue: "Total revenue",
        metricProfit: "Profit / loss",
        chartTitleRevenueHour: "Revenue by hour",
        chartTitleRevenueDay: "Revenue by day",
        chartTitleRevenueMonth: "Revenue by month",
        chartTitleProfitDay: "Profit/loss by day",
        chartTitleProfitMonth: "Profit/loss by month",
        profitHourlyUnavailable: "Profit/loss data is only available by day or month",
        chartHour: "Hourly",
        chartDay: "Daily",
        chartMonth: "Monthly",
        topItems: "Top items this month",
        otherItems: "Others",
        previousMonth: "Previous month",
        nextMonth: "Next month",
        chooseMonth: "Choose month",
        noSales: "No sales data for this day",
        noSalesMonth: "No sales data for this month",
        sold: "Sold",
        dishes: "items",
        dailyOrders: "Orders",
        viewAllOrders: "View all orders",
        noOrders: "No orders on the selected date",
        floorStatus: "Floor status",
        openOrderTaking: "Take orders",
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
        served: "Done",
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

function ChartBox({
  data,
  title,
  language,
  lossColoring,
}: {
  data: ChartPoint[];
  title: string;
  language: "th" | "en";
  lossColoring?: boolean;
}) {
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
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(value) => formatCurrency(Number(value), language)} width={64} />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            formatter={(value) => [formatCurrency(Number(value), language), title]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((point) => (
              <Cell key={point.key} fill={lossColoring && point.value < 0 ? "#dc2626" : "#475569"} />
            ))}
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

type CardSummaryItem = { key: string; label: string; value: string; helper?: string };

function CollapsibleCard({
  title,
  subtitle,
  summary,
  expanded,
  dimmed,
  collapsedRank,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  summary?: CardSummaryItem[];
  expanded: boolean;
  dimmed?: boolean;
  collapsedRank: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  // Fades both ways now: opening fades in, closing fades out before actually
  // unmounting the section (the parent also delays opening the next card
  // until this one has fully closed, so switches read as close-then-open).
  const [animatedVisible, setAnimatedVisible] = useState(false);

  useEffect(() => {
    if (expanded) {
      setMounted(true);
      // Two rAFs: the first lets the browser paint the just-mounted "invisible"
      // state; only then do we flip to visible, so the transition has a real
      // starting point to animate from (a single rAF can land in the same
      // paint as the mount and skip the animation entirely).
      let innerRaf = 0;
      const outerRaf = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outerRaf);
        cancelAnimationFrame(innerRaf);
      };
    }
    setVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(timeout);
  }, [expanded]);

  // Growing back to the full tile (once `dimmed` clears — which the parent
  // already delays until the closing card has actually finished fading out)
  // should itself fade/scale in smoothly instead of just popping into place.
  const [tileVisible, setTileVisible] = useState(!dimmed);
  useEffect(() => {
    setTileVisible(false);
    if (dimmed) return;
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setTileVisible(true));
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  }, [dimmed]);

  // Collapsed cards stack on top, ordered by `collapsedRank` (untouched
  // siblings keep their relative order; whichever card was just opened or
  // closed gets bumped to the end); the open one falls below all of them.
  // Keyed off `mounted` (the shape actually on screen) rather than the raw
  // `expanded` prop, so a click doesn't jump the tile to its new slot first
  // and only grow into the section afterwards — position and shape change
  // together, in the same render, on both open and close.
  const orderRank = mounted ? 100 : collapsedRank;

  // FLIP: while collapsed (tile or dimmed row), a sibling opening/closing can
  // shove this card to a different grid slot via `order` or by changing how
  // many other collapsed cards share the row — both snap instantly by
  // default. On every render, compare this card's last measured position to
  // its new one and, if it moved, jump it back with no transition, then
  // animate the native `translate` back to zero on the next frame.
  const collapsedRef = useRef<HTMLButtonElement | null>(null);
  const prevCollapsedRectRef = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    const node = collapsedRef.current;
    if (mounted || !node) {
      prevCollapsedRectRef.current = null;
      if (animateOpen) {
        // Two rAFs: the first lets the browser paint the just-mounted "invisible"
        // state; only then do we flip to visible, so the transition has a real
        // starting point to animate from (a single rAF can land in the same
        // paint as the mount and skip the animation entirely).
        let innerRaf = 0;
        const outerRaf = requestAnimationFrame(() => {
          innerRaf = requestAnimationFrame(() => setAnimatedVisible(true));
        });
        return () => {
          cancelAnimationFrame(outerRaf);
          cancelAnimationFrame(innerRaf);
        };
      }
      return;
    }
    const newRect = node.getBoundingClientRect();
    const prevRect = prevCollapsedRectRef.current;
    if (prevRect) {
      const deltaX = prevRect.left - newRect.left;
      const deltaY = prevRect.top - newRect.top;
      if (deltaX || deltaY) {
        // Drive this transition entirely via inline style rather than
        // depending on the button's own className — the dimmed row and tile
        // have different (and differently-timed) transitions for hover/press
        // feedback, and this shouldn't borrow or override those.
        node.style.setProperty("transition", "none", "important");
        node.style.translate = `${deltaX}px ${deltaY}px`;
        // Force a reflow so the jump above is committed before animating away from it.
        void node.getBoundingClientRect();
        requestAnimationFrame(() => {
          node.style.setProperty("transition", "translate 320ms cubic-bezier(0.2, 0, 0, 1)", "important");
          node.style.translate = "0px 0px";
          window.setTimeout(() => {
            node.style.removeProperty("transition");
            node.style.translate = "";
          }, 320);
        });
      }
    }
    prevCollapsedRectRef.current = newRect;
  });
    const resetRaf = requestAnimationFrame(() => setAnimatedVisible(false));
    return () => cancelAnimationFrame(resetRaf);
  }, [expanded, animateOpen]);

  const visible = expanded && (!animateOpen || animatedVisible);

  if (!expanded) {
    // A sibling card is expanded and this one isn't — shrink way down, but
    // keep showing the summary numbers (just in a much more compact row).
    if (dimmed) {
      return (
        <button
          ref={collapsedRef}
          type="button"
          onClick={onToggle}
          className="ui-press flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-md border border-gray-200 bg-white px-3.5 py-2 text-left hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900"
          style={{ order: orderRank }}
        >
          <span className="shrink-0 text-[12px] font-semibold text-gray-700 dark:text-gray-200">{title}</span>
          {summary?.length ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {summary.map((item) => (
                <div key={item.key} className="flex items-baseline gap-1">
                  <span className="text-[9px] text-gray-400 dark:text-gray-500">{item.label}</span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-gray-950 dark:text-white">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-700" aria-hidden="true" />
        </button>
      );
    }
    return (
      <button
        ref={collapsedRef}
        type="button"
        onClick={onToggle}
        style={{ order: orderRank }}
        className={`ui-press group relative flex aspect-[4/3] w-full flex-col items-stretch justify-between gap-3 rounded-md border border-gray-200 bg-white p-5 text-left !transition-all !duration-300 !ease-out hover:z-10 hover:-rotate-1 hover:scale-[1.05] hover:shadow-lg dark:border-gray-800 dark:bg-gray-950 ${
          tileVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="text-center">
          <h2 className="text-[20px] font-bold leading-snug text-gray-950 dark:text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-[13px] text-gray-400 dark:text-gray-500">{subtitle}</p> : null}
        </div>
        {summary?.length ? (
          <div className="grid flex-1 grid-cols-2 gap-3">
            {summary.map((item) => (
              <div key={item.key} className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-md bg-gray-50 p-2 text-center dark:bg-gray-900">
                <p className="truncate text-[14px] font-medium leading-tight text-gray-500 dark:text-gray-400">{item.label}</p>
                <p className="truncate font-mono text-[24px] font-bold leading-tight tabular-nums text-gray-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}
        <ChevronDown className="mx-auto h-5 w-5 shrink-0 text-gray-300 transition-transform group-hover:translate-y-0.5 dark:text-gray-700" aria-hidden="true" />
      </button>
    );
  }
  return (
    <section
      onClick={(event) => {
        // Clicking anywhere in the card that isn't an actual control (button,
        // link, form field, ...) collapses it back to a tile.
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [role='button']")) return;
        onToggle();
      }}
      style={{ order: orderRank }}
      className={`col-span-full cursor-pointer origin-top overflow-visible rounded-md border border-gray-200 bg-white transition-all duration-200 ease-out dark:border-gray-800 dark:bg-gray-950 ${
        visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="ui-press flex w-full items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
      >
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-gray-950 dark:text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</p> : null}
        </div>
        <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      </button>
      {summary?.length ? (
        <div className="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800 lg:grid-cols-4">
          {summary.map((item) => (
            <div key={item.key} className="bg-white px-4 py-3.5 dark:bg-gray-950">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{item.label}</p>
              <p className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-gray-950 dark:text-white">{item.value}</p>
              {item.helper ? <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{item.helper}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </section>
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
  // Only one card open at a time. Switching to a different card closes the
  // current one first and only opens the new one once that close has
  // actually finished fading out, instead of opening on top of it.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [switchingCard, setSwitchingCard] = useState(false);
  // The card that's currently mid-close (fading out) — excluded from
  // `isCardDimmed` so it goes straight from "expanded section" to "full
  // tile" once it unmounts, instead of flashing as a dimmed row for the
  // last few ms of the `switchingCard` window (it's not a *sibling*, it's
  // the one that just closed).
  const [closingKey, setClosingKey] = useState<string | null>(null);
  // Order the collapsed cards are shown in — whichever card was most
  // recently interacted with (opened OR just closed) gets bumped to the end,
  // so the other, untouched cards keep their same relative order and just
  // slide over to make room, instead of the whole group reshuffling.
  const defaultCardOrder = ["sales", "liveWork", "floorStatus"];
  const [cardOrderQueue, setCardOrderQueue] = useState<string[]>(defaultCardOrder);
  const bumpCardToEnd = (key: string) => {
    setCardOrderQueue((queue) => (queue[queue.length - 1] === key ? queue : [...queue.filter((k) => k !== key), key]));
  };
  // Back to every card showing as a full tile (nothing open, nothing mid
  // close/switch) — reset back to the default left-to-right order instead of
  // leaving them wherever the last few opens/closes happened to shuffle them.
  useEffect(() => {
    if (expandedKey === null && !switchingCard && closingKey === null) {
      setCardOrderQueue((queue) => (queue.join() === defaultCardOrder.join() ? queue : defaultCardOrder));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey, switchingCard, closingKey]);
  const pendingSwitchRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pendingSwitchRef.current) window.clearTimeout(pendingSwitchRef.current);
    };
  }, []);
  const toggleCard = (key: string) => {
    bumpCardToEnd(key);
    if (pendingSwitchRef.current) {
      window.clearTimeout(pendingSwitchRef.current);
      pendingSwitchRef.current = null;
    }
    if (expandedKey === key) {
      // Plain close — keep the other cards dimmed until this one has
      // actually finished fading out, instead of snapping them back to full
      // size the instant the close starts.
      setSwitchingCard(true);
      setClosingKey(key);
      setExpandedKey(null);
      pendingSwitchRef.current = window.setTimeout(() => {
        setSwitchingCard(false);
        setClosingKey(null);
        pendingSwitchRef.current = null;
      }, 210);
      return;
    }
    if (expandedKey === null && !switchingCard) {
      // Nothing was open (and no switch already in flight) — open immediately.
      setExpandedKey(key);
      return;
    }
    // Something is open, or a previous switch is still closing out — close
    // (or keep closing) first, then open the new one once that's done. Also
    // covers re-clicking a third card mid-switch: the stale pending timeout
    // was already cleared above, so this just restarts the sequence aimed
    // at the newly clicked key instead. `closingKey` may already be set (if
    // we're interrupting a still-in-flight close) — keep pointing at that
    // real card rather than overwriting it with `expandedKey`, which is
    // already null at this point during an interruption.
    setSwitchingCard(true);
    setClosingKey((current) => current ?? expandedKey);
    setExpandedKey(null);
    pendingSwitchRef.current = window.setTimeout(() => {
      setExpandedKey(key);
      setSwitchingCard(false);
      setClosingKey(null);
      pendingSwitchRef.current = null;
    }, 210);
  };
  const [chartMode, setChartMode] = useState<ChartMode>("hour");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [salesDays, setSalesDays] = useState<ReportSalesDay[]>([]);
  const [salesDaysLoading, setSalesDaysLoading] = useState(false);
  const salesDaysLoadedRef = useRef(false);
  const [topItemsMonthDate, setTopItemsMonthDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [topItemsData, setTopItemsData] = useState<ReportTopMenuItem[]>([]);
  const [topItemsLoading, setTopItemsLoading] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => now.getFullYear());
  const monthPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeMembership?.restaurant_id) return;
    let cancelled = false;
    const loadingFrame = requestAnimationFrame(() => {
      if (!cancelled) setTopItemsLoading(true);
    });
    getTopMenuItemsByMonth(topItemsMonthDate.getFullYear(), topItemsMonthDate.getMonth() + 1)
      .then((res) => {
        if (!cancelled) setTopItemsData(res.data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setTopItemsData([]);
      })
      .finally(() => {
        if (!cancelled) setTopItemsLoading(false);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(loadingFrame);
    };
  }, [topItemsMonthDate, activeMembership?.restaurant_id]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
        setMonthPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [monthPickerOpen]);

  const shiftTopItemsMonth = (delta: number) => {
    setMonthPickerOpen(false);
    setTopItemsMonthDate((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
  };

  const currentRealMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const canGoNextTopItemsMonth = topItemsMonthDate.getTime() < currentRealMonthStart.getTime();
  const topItemsMonthLabel = topItemsMonthDate.toLocaleDateString(language === "th" ? "th-TH" : "en-US", {
    month: "long",
    year: "numeric",
  });
  const monthShortLabels = Array.from({ length: 12 }, (_, index) =>
    new Date(2000, index, 1).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { month: "short" }),
  );

  useEffect(() => {
    if (chartMode === "hour") return;
    if (salesDaysLoadedRef.current || !activeMembership?.restaurant_id) return;
    salesDaysLoadedRef.current = true;
    setSalesDaysLoading(true);
    getManagerReport(90)
      .then((res) => setSalesDays(res.data.sales_days ?? []))
      .catch(() => {
        salesDaysLoadedRef.current = false;
      })
      .finally(() => setSalesDaysLoading(false));
  }, [chartMode, activeMembership?.restaurant_id]);

  const setChartMetricAndMode = (metric: ChartMetric) => {
    setChartMetric(metric);
    if (metric === "profit" && chartMode === "hour") setChartMode("day");
  };

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
    const loadTimer = window.setTimeout(() => void loadOperations(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadOperations]);
  const realtimeStatus = useOrderEvents(() => loadOperations(true), {
    enabled: isToday && Boolean(activeMembership?.restaurant_id),
    restaurantId: activeMembership?.restaurant_id,
  });
  useVisiblePolling(() => loadOperations(true), {
    enabled: isToday && Boolean(activeMembership?.restaurant_id),
    intervalMs: 60_000,
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

  const sortedItems = topItemsData
    .map((item) => ({ name: item.menu_name, sold: item.quantity }))
    .sort((first, second) => second.sold - first.sold || first.name.localeCompare(second.name));

  const topItemColors = ["#0f172a", "#0ea5e9", "#10b981", "#f59e0b", "#cbd5e1"];
  const topItems = sortedItems.slice(0, 4);
  const otherItemsSold = sortedItems.slice(4).reduce((sum, item) => sum + item.sold, 0);
  const topItemsPie = otherItemsSold > 0 ? [...topItems, { name: copy.otherItems, sold: otherItemsSold }] : topItems;
  const totalItemsSold = sortedItems.reduce((sum, item) => sum + item.sold, 0);

  const selectedDateAtNoon = new Date(`${selectedDate}T12:00:00`);

  // Hour view: only the hours the restaurant is actually open, taken from restaurant settings.
  const parseHour = (time: string | undefined, fallback: number) => {
    const hour = Number.parseInt((time ?? "").split(":")[0] ?? "", 10);
    return Number.isFinite(hour) ? hour : fallback;
  };
  const openHour = parseHour(activeMembership?.restaurant?.open_time, 0);
  let closeHourRaw = parseHour(activeMembership?.restaurant?.close_time, 24);
  if (closeHourRaw <= openHour) closeHourRaw += 24;
  const operatingHourCount = Math.min(24, Math.max(1, closeHourRaw - openHour));
  const operatingHours = Array.from({ length: operatingHourCount }, (_, index) => (openHour + index) % 24);

  const hourlyPoints: ChartPoint[] = operatingHours.map((hourNumber) => {
    const hourOrders = validOrders.filter((order) => new Date(order.opened_at).getHours() === hourNumber);
    return {
      key: String(hourNumber),
      label: String(hourNumber).padStart(2, "0"),
      value: hourOrders.reduce((sum, order) => sum + (order.grand_total || order.total_amount), 0),
    };
  });

  const salesByDate = new Map(salesDays.map((day) => [day.order_date, day]));
  const dateKey = (date: Date) => {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const valueForDate = (date: Date) => {
    const day = salesByDate.get(dateKey(date));
    if (!day) return 0;
    return chartMetric === "profit" ? day.profit : day.revenue;
  };

  // Day view: the Monday-Sunday week containing the selected date.
  const weekdayIndex = selectedDateAtNoon.getDay();
  const mondayOffset = weekdayIndex === 0 ? -6 : 1 - weekdayIndex;
  const weekStart = new Date(selectedDateAtNoon);
  weekStart.setDate(selectedDateAtNoon.getDate() + mondayOffset);
  const weekdayLabels = language === "th" ? ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dailyPoints: ChartPoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return { key: dateKey(date), label: weekdayLabels[index], value: valueForDate(date) };
  });

  // Month view: every day of the calendar month containing the selected date.
  const daysInMonth = new Date(selectedDateAtNoon.getFullYear(), selectedDateAtNoon.getMonth() + 1, 0).getDate();
  const monthlyPoints: ChartPoint[] = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const date = new Date(selectedDateAtNoon.getFullYear(), selectedDateAtNoon.getMonth(), dayNumber, 12);
    return { key: dateKey(date), label: String(dayNumber), value: valueForDate(date) };
  });

  const chartModeOptions: { key: ChartMode; label: string }[] = (
    chartMetric === "profit"
      ? [
          { key: "day" as const, label: copy.chartDay },
          { key: "month" as const, label: copy.chartMonth },
        ]
      : [
          { key: "hour" as const, label: copy.chartHour },
          { key: "day" as const, label: copy.chartDay },
          { key: "month" as const, label: copy.chartMonth },
        ]
  );
  const chartTitles: Record<ChartMetric, Partial<Record<ChartMode, string>>> = {
    revenue: { hour: copy.chartTitleRevenueHour, day: copy.chartTitleRevenueDay, month: copy.chartTitleRevenueMonth },
    profit: { day: copy.chartTitleProfitDay, month: copy.chartTitleProfitMonth },
  };
  const activeChartTitle = chartTitles[chartMetric][chartMode] ?? chartTitles[chartMetric].day ?? "";
  const activeChartData = chartMode === "hour" ? hourlyPoints : chartMode === "day" ? dailyPoints : monthlyPoints;
  const activeChartLoading = chartMode !== "hour" && salesDaysLoading;
  const activeChartHasData = chartMode === "hour" ? validOrders.length > 0 : activeChartData.some((point) => salesByDate.has(point.key));

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
    { key: "ready", icon: CheckCircle2, label: copy.readyToServe, value: ready.length, href: "/kitchen", tone: "text-emerald-600 dark:text-emerald-300" },
    { key: "tables", icon: Table2, label: copy.occupiedTables, value: occupied.length, href: "/pos/tables", tone: "text-amber-600 dark:text-amber-300" },
    { key: "stock", icon: PackageOpen, label: copy.lowStock, value: lowStock.length, href: "/inventory", tone: lowStock.length ? "text-amber-600 dark:text-amber-300" : "text-gray-400" },
  ];

  const summary = [
    { key: "orders", label: copy.ordersTotal, value: validOrders.length.toLocaleString(), helper: `${copy.activeOrders} ${activeOrders}` },
    { key: "revenue", label: copy.paidRevenue, value: formatCurrency(paidRevenue, language), helper: `${paidOrders.length} ${copy.order}` },
    { key: "average", label: copy.averageBill, value: formatCurrency(averageBill, language), helper: paidOrders.length ? undefined : copy.noSales },
    { key: "guests", label: copy.guestsTotal, value: guestCount.toLocaleString(), helper: copy.people },
  ];

  const liveWorkSummary: CardSummaryItem[] = attention.map((item) => ({
    key: item.key,
    label: item.label,
    value: item.value.toLocaleString(),
  }));

  const availableTables = tables.filter((table) => table.status === "available").length;
  const reservedTables = tables.filter((table) => table.status === "reserved").length;
  const floorStatusSummary: CardSummaryItem[] = [
    { key: "occupied", label: copy.occupiedTables, value: occupied.length.toLocaleString() },
    { key: "available", label: copy.available, value: availableTables.toLocaleString() },
    { key: "reserved", label: copy.reserved, value: reservedTables.toLocaleString() },
  ];

  // While a card is expanded (or the switch to a different one is still in
  // its close-then-open sequence), every other card shrinks down to a
  // compact summary row instead of staying a full tile. The card that's
  // itself mid-close is excluded so it goes straight back to a full tile
  // once it finishes collapsing, rather than flashing as a dimmed row first.
  const isCardDimmed = (key: string) => (expandedKey !== null || switchingCard) && expandedKey !== key && closingKey !== key;

  // Position among the collapsed cards, per `cardOrderQueue`.
  const collapsedRank = (key: string) => cardOrderQueue.indexOf(key);

  const dateLoading = loading && loadedDate !== selectedDate;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-14 z-20 border-b border-gray-200 bg-slate-50/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:px-6 lg:top-0 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label={copy.loading} /> : null}
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
          </div>
        </div>
      </header>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div> : null}
        <RealtimeConnectionNotice language={language} status={realtimeStatus} />

        {dateLoading ? (
          <div className="flex min-h-72 items-center justify-center rounded-md border border-gray-200 bg-white text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {copy.loading}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <CollapsibleCard
              title={copy.salesOverview}
              summary={summary}
              expanded={expandedKey === "sales"}
              dimmed={isCardDimmed("sales")}
              collapsedRank={collapsedRank("sales")}
              onToggle={() => toggleCard("sales")}
            >
              <div className="grid overflow-visible lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
                <div className="min-w-0 border-b border-gray-200 p-4 dark:border-gray-800 lg:border-b-0 lg:border-r">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                      {(["revenue", "profit"] as const).map((metric) => (
                        <button
                          key={metric}
                          type="button"
                          onClick={() => setChartMetricAndMode(metric)}
                          className={`ui-press px-2.5 py-1 text-[11px] font-semibold ${
                            chartMetric === metric
                              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                              : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
                          }`}
                        >
                          {metric === "revenue" ? copy.metricRevenue : copy.metricProfit}
                        </button>
                      ))}
                    </div>
                    <div className="inline-flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                      {chartModeOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setChartMode(option.key)}
                          className={`ui-press px-2.5 py-1 text-[11px] font-semibold ${
                            chartMode === option.key
                              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                              : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <h3 className="mt-2 text-[12px] font-medium text-gray-600 dark:text-gray-300">{activeChartTitle}</h3>
                  {chartMetric === "profit" ? (
                    <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{copy.profitHourlyUnavailable}</p>
                  ) : null}
                  {activeChartLoading ? (
                    <div className="flex h-56 items-center justify-center text-[12px] text-gray-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {copy.loading}
                    </div>
                  ) : activeChartHasData ? (
                    <ChartBox data={activeChartData} title={activeChartTitle} language={language} lossColoring={chartMetric === "profit"} />
                  ) : (
                    <div className="flex h-56 items-center justify-center text-[12px] text-gray-400">{copy.noSales}</div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-[12px] font-medium text-gray-600 dark:text-gray-300">{copy.topItems}</h3>

                  <div className="mt-2 flex justify-center">
                    {topItemsLoading ? (
                      <div className="flex h-36 w-36 items-center justify-center text-[12px] text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      </div>
                    ) : topItemsPie.length ? (
                      <div className="relative h-36 w-36 shrink-0">
                        <PieChart width={144} height={144}>
                          <Pie data={topItemsPie} dataKey="sold" nameKey="name" innerRadius={46} outerRadius={68} paddingAngle={2} stroke="none">
                            {topItemsPie.map((entry, index) => (
                              <Cell key={entry.name} fill={topItemColors[index % topItemColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name) => [`${value} ${copy.dishes}`, name]} />
                        </PieChart>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="font-mono text-[16px] font-semibold tabular-nums text-gray-950 dark:text-white">{totalItemsSold.toLocaleString()}</span>
                          <span className="text-[9px] text-gray-400">{copy.dishes}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-36 items-center justify-center text-[12px] text-gray-400">{copy.noSalesMonth}</div>
                    )}
                  </div>

                  <div ref={monthPickerRef} className="relative mt-3 flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => shiftTopItemsMonth(-1)}
                      aria-label={copy.previousMonth}
                      title={copy.previousMonth}
                      className="ui-press inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerYear(topItemsMonthDate.getFullYear());
                        setMonthPickerOpen((open) => !open);
                      }}
                      aria-label={copy.chooseMonth}
                      title={copy.chooseMonth}
                      className="ui-press min-w-[112px] rounded-md border border-gray-200 px-2 py-1 text-center font-mono text-[12px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
                    >
                      {topItemsMonthLabel}
                    </button>
                    <button
                      type="button"
                      disabled={!canGoNextTopItemsMonth}
                      onClick={() => shiftTopItemsMonth(1)}
                      aria-label={copy.nextMonth}
                      title={copy.nextMonth}
                      className="ui-press inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                    >
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    {monthPickerOpen ? (
                      <div className="absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex items-center justify-between px-1 pb-1.5">
                          <button
                            type="button"
                            onClick={() => setPickerYear((year) => year - 1)}
                            className="ui-press inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <span className="font-mono text-[12px] font-semibold text-gray-800 dark:text-gray-100">{pickerYear}</span>
                          <button
                            type="button"
                            disabled={pickerYear >= now.getFullYear()}
                            onClick={() => setPickerYear((year) => year + 1)}
                            className="ui-press inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {monthShortLabels.map((label, index) => {
                            const isFuture = pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && index > now.getMonth());
                            const isSelected = pickerYear === topItemsMonthDate.getFullYear() && index === topItemsMonthDate.getMonth();
                            const isCurrentRealMonth = pickerYear === now.getFullYear() && index === now.getMonth();
                            return (
                              <button
                                key={label}
                                type="button"
                                disabled={isFuture}
                                onClick={() => {
                                  setTopItemsMonthDate(new Date(pickerYear, index, 1));
                                  setMonthPickerOpen(false);
                                }}
                                className={`rounded px-1.5 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-30 ${
                                  isSelected
                                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                                    : isCurrentRealMonth
                                    ? "text-sky-700 ring-1 ring-inset ring-sky-500 dark:text-sky-300"
                                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {topItemsPie.length ? (
                    <ul className="mt-3 w-full min-w-0 space-y-1.5">
                      {topItemsPie.map((item, index) => (
                        <li key={item.name} className="flex items-center gap-2 text-[12px]">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: topItemColors[index % topItemColors.length] }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-gray-300">{item.name}</span>
                          <span className="shrink-0 font-mono text-gray-500 dark:text-gray-400">{item.sold} {copy.dishes}</span>
                          <span className="w-9 shrink-0 text-right font-mono text-[10px] text-gray-400">{totalItemsSold ? Math.round((item.sold / totalItemsSold) * 100) : 0}%</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </CollapsibleCard>

              <CollapsibleCard
                title={copy.liveWork}
                summary={liveWorkSummary}
                expanded={expandedKey === "liveWork"}
                dimmed={isCardDimmed("liveWork")}
                collapsedRank={collapsedRank("liveWork")}
                onToggle={() => toggleCard("liveWork")}
              >
                {isToday ? (
                  <div className="border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <h3 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.kitchenQueue}</h3>
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
                                  <h4 className="text-[12px] font-semibold text-gray-900 dark:text-white">{lane.title}</h4>
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
                  </div>
                ) : (
                  <div className="border-b border-gray-200 px-4 py-6 text-center text-[12px] text-gray-400 dark:border-gray-800">{copy.historyNotice}</div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <h3 className="text-[13px] font-semibold text-gray-950 dark:text-white">{copy.dailyOrders}</h3>
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
                </div>
              </CollapsibleCard>

              {isToday ? (
                <CollapsibleCard
                  title={copy.floorStatus}
                  summary={floorStatusSummary}
                  expanded={expandedKey === "floorStatus"}
                  dimmed={isCardDimmed("floorStatus")}
                  collapsedRank={collapsedRank("floorStatus")}
                  onToggle={() => toggleCard("floorStatus")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.occupied} {occupied.length} · {copy.available} {availableTables} · {copy.reserved} {reservedTables}</p>
                    <button type="button" onClick={() => router.push("/pos/tables")} className="ui-press inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.openOrderTaking}<ArrowRight className="h-3.5 w-3.5" /></button>
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
                </CollapsibleCard>
              ) : null}
            </div>

            {!isToday ? (
              <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-[12px] text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span>{copy.historyNotice}</span>
              </div>
            ) : null}

          </>
        )}

        {lastUpdated ? <p className="pb-1 text-right text-[10px] text-gray-400 dark:text-gray-500">{copy.updated} {lastUpdated.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}</p> : null}
      </div>
    </div>
  );
}
