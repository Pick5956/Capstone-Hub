"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
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
  ReceiptText,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { formatCurrency } from "@/src/lib/format";
import { can } from "@/src/lib/rbac";
import {
  activeOrderStatuses,
  dailyExpenseTotalsByDate,
  hasPartialDailyExpenseRows,
  shiftDashboardDate,
  toDashboardDate,
  toDashboardFloorTables,
  totalDailyExpensesForMonth,
  uniqueOrdersById,
  type DashboardFloorTable,
} from "@/src/lib/homeDashboard";
import { listExpenses, type Expense, type ExpenseCategory, type ExpenseDailyTotal } from "@/src/lib/expense";
import { listIngredients } from "@/src/lib/ingredient";
import { kitchenQueue, listOrders } from "@/src/lib/order";
import { orderPosHref } from "@/src/lib/orderNavigation";
import {
  getManagerReport,
  getSalesByHour,
  getSalesDetail,
  getTopMenuItemsByMonth,
} from "@/src/lib/report";
import { listTables } from "@/src/lib/table";
import type { Ingredient } from "@/src/types/ingredient";
import type {
  ReportSalesDay,
  ReportSalesHour,
  ReportTopMenuItem,
  SalesDetailReport,
} from "@/src/types/report";
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
type ChartMetric = "revenue" | "cost" | "profit";
type ExpenseLedgerState = {
  restaurantId: number | null;
  expenses: Expense[];
  daily: ExpenseDailyTotal[];
};
type Copy = ReturnType<typeof buildCopy>;

const EMPTY_EXPENSE_LEDGER: ExpenseLedgerState = {
  restaurantId: null,
  expenses: [],
  daily: [],
};

// Collapsed cards start left-to-right in this order; the queue in `Home`
// reshuffles from here as cards get opened and closed.
const defaultCardOrder = ["sales", "liveWork", "floorStatus"];
const expandedCardStorageKey = "home:expandedCard";
// Day/month split of the sales card, as a percentage of the card width. Kept in
// localStorage, not session: it is a layout preference, not where you were.
const cardSplitStorageKey = "home:salesSplit";
const cardSplitDefault = 58;
const cardSplitMin = 30;
const cardSplitMax = 78;
const clampSplit = (pct: number) => Math.min(cardSplitMax, Math.max(cardSplitMin, pct));
const collapsibleCardFadeMs = 200;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

// Kept out of buildCopy: every value there must stay a plain string, since the
// order-status label looks itself up by indexing the whole copy object.
const expenseCategoryLabels: Record<"th" | "en", Record<ExpenseCategory, string>> = {
  th: { ingredient: "วัตถุดิบ", labor: "ค่าแรง", rent: "ค่าเช่า", utilities: "ค่าน้ำ/ไฟ", equipment: "อุปกรณ์", other: "อื่นๆ" },
  en: { ingredient: "Supplies", labor: "Wages", rent: "Rent", utilities: "Utilities", equipment: "Equipment", other: "Other" },
};

function buildCopy(language: "th" | "en") {
  return language === "th"
    ? {
        title: "ภาพรวมร้าน",
        today: "วันนี้",
        previousDay: "วันก่อน",
        nextDay: "วันถัดไป",
        chooseDate: "เลือกวันที่",
        loading: "กำลังโหลด",
        updated: "อัปเดต",
        ordersTotal: "ออเดอร์ทั้งหมด",
        paidRevenue: "ยอดรับชำระ",
        activeOrders: "กำลังดำเนินการ",
        liveWork: "งานที่ต้องจัดการตอนนี้",
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
        salesOverview: "ยอดขาย",
        metricRevenue: "รายได้ทั้งหมด",
        metricCost: "รายจ่าย",
        viewExpenseLedger: "ดูบันทึกรายจ่าย",
        metricProfit: "กำไร/ขาดทุน",
        chartTitleRevenueHour: "รายได้รายชั่วโมง",
        chartTitleRevenueDay: "รายได้รายวัน",
        chartTitleRevenueMonth: "รายได้รายเดือน",
        chartTitleCostDay: "รายจ่ายรายวัน",
        chartTitleCostMonth: "รายจ่ายรายเดือน",
        expenseMonthly: "รายจ่ายเดือนนี้",
        monthlySales: "ยอดขายรายเดือน",
        thisMonth: "ทั้งเดือน",
        thisDay: "ทั้งวัน",
        resizeSplit: "ปรับสัดส่วนรายวัน/รายเดือน",
        expenseCategory: "ประเภท",
        expenseNote: "รายละเอียด",
        chartTitleProfitHour: "กำไร/ขาดทุนรายชั่วโมง",
        chartTitleProfitDay: "กำไร/ขาดทุนรายวัน",
        chartTitleProfitMonth: "กำไร/ขาดทุนรายเดือน",
        chartHour: "รายชั่วโมง",
        chartDay: "รายวัน",
        chartMonth: "รายเดือน",
        drillHint: "กดที่แท่งกราฟเพื่อดูบิลที่อยู่เบื้องหลัง",
        drillTitle: "บิลในช่วงนี้",
        drillClose: "ปิด",
        drillEmpty: "ไม่มีข้อมูลในช่วงนี้",
        drillCapped: "รายละเอียดที่แสดงเป็นรายการล่าสุดบางส่วน",
        ingredient: "วัตถุดิบ",
        ingredients: "รายการ",
        cost: "ต้นทุน",
        profit: "กำไร",
        revenue: "รายได้",
        topItems: "เมนูขายดีประจำเดือน",
        otherItems: "อื่นๆ",
        previousMonth: "เดือนก่อน",
        nextMonth: "เดือนถัดไป",
        chooseMonth: "เลือกเดือน",
        noSales: "ยังไม่มีข้อมูลยอดขายในวันนี้",
        noSalesMonth: "ยังไม่มีข้อมูลยอดขายในเดือนนี้",
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
        today: "Today",
        previousDay: "Previous day",
        nextDay: "Next day",
        chooseDate: "Choose date",
        loading: "Loading",
        updated: "Updated",
        ordersTotal: "Total orders",
        paidRevenue: "Paid revenue",
        activeOrders: "Active",
        liveWork: "Needs attention now",
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
        salesOverview: "Sales",
        metricRevenue: "Total revenue",
        metricCost: "Expenses",
        viewExpenseLedger: "View expense ledger",
        metricProfit: "Profit / loss",
        chartTitleRevenueHour: "Revenue by hour",
        chartTitleRevenueDay: "Revenue by day",
        chartTitleRevenueMonth: "Revenue by month",
        chartTitleCostDay: "Expenses by day",
        chartTitleCostMonth: "Expenses by month",
        expenseMonthly: "Expenses this month",
        monthlySales: "Monthly sales",
        thisMonth: "This month",
        thisDay: "This day",
        resizeSplit: "Resize the day and month panes",
        expenseCategory: "Category",
        expenseNote: "Details",
        chartTitleProfitHour: "Profit/loss by hour",
        chartTitleProfitDay: "Profit/loss by day",
        chartTitleProfitMonth: "Profit/loss by month",
        chartHour: "Hourly",
        chartDay: "Daily",
        chartMonth: "Monthly",
        drillHint: "Click a bar to see the bills behind it",
        drillTitle: "Bills in this window",
        drillClose: "Close",
        drillEmpty: "Nothing recorded in this window",
        drillCapped: "Showing a partial list of the latest entries",
        ingredient: "Ingredient",
        ingredients: "items",
        cost: "Cost",
        profit: "Profit",
        revenue: "Revenue",
        topItems: "Top items this month",
        otherItems: "Others",
        previousMonth: "Previous month",
        nextMonth: "Next month",
        chooseMonth: "Choose month",
        noSales: "No sales data for this day",
        noSalesMonth: "No sales data for this month",
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
  selectedKey,
  onSelect,
}: {
  data: ChartPoint[];
  title: string;
  language: "th" | "en";
  lossColoring?: boolean;
  selectedKey?: string | null;
  onSelect?: (point: ChartPoint) => void;
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
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(_entry, index) => {
              const point = data[index];
              if (point && onSelect) onSelect(point);
            }}
          >
            {data.map((point) => (
              <Cell
                key={point.key}
                fill={
                  lossColoring && point.value < 0
                    ? "#dc2626"
                    : selectedKey === point.key
                    ? "#0ea5e9"
                    : "#475569"
                }
                // Dim the unpicked bars so the drilled-into one reads as the
                // source of the table below.
                fillOpacity={selectedKey && selectedKey !== point.key ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

type CardTone = "revenue" | "profit" | "cost";
type CardSummaryItem = { key: string; label: string; value: string; valueClass?: string; helper?: string; tone?: CardTone; href?: string };

// Money tiles are colour-coded so the three read as a set at a glance. Each
// tone sets the surface, the border and the *inherited* text colour, so labels
// pick the hue up on their own — the kitchen board's convention. The value
// keeps an explicit colour of its own so it stays the loudest thing in the tile.
const cardToneTile: Record<CardTone, string> = {
  revenue: "border-sky-400 bg-sky-200 text-sky-900 dark:border-sky-600 dark:bg-sky-900/70 dark:text-sky-100",
  profit: "border-emerald-400 bg-emerald-200 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/70 dark:text-emerald-100",
  cost: "border-rose-400 bg-rose-200 text-rose-900 dark:border-rose-600 dark:bg-rose-900/70 dark:text-rose-100",
};
const cardToneRow = cardToneTile;
const cardToneNeutral = "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400";

function CollapsibleCard({
  title,
  subtitle,
  summary,
  // Off when the expanded body already shows the same figures in a section of
  // its own — the collapsed tile and row still need `summary` either way.
  showSummaryWhenExpanded = true,
  expanded,
  dimmed,
  collapsedRank,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  summary?: CardSummaryItem[];
  showSummaryWhenExpanded?: boolean;
  expanded: boolean;
  dimmed?: boolean;
  collapsedRank: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  // Fades both ways now: opening fades in, closing fades out before actually
  // unmounting the section (the parent also delays opening the next card
  // until this one has fully closed, so switches read as close-then-open).
  const [mounted, setMounted] = useState(expanded);
  const [visible, setVisible] = useState(expanded);

  useEffect(() => {
    let outerRaf = 0;
    let innerRaf = 0;
    let unmountTimeout = 0;

    if (expanded) {
      // Mount in one animation frame and reveal in the next. Keeping both
      // updates behind the browser scheduler avoids a synchronous effect
      // cascade while still giving the transition a painted starting point.
      outerRaf = window.requestAnimationFrame(() => {
        setMounted(true);
        if (prefersReducedMotion()) {
          setVisible(true);
          return;
        }
        innerRaf = requestAnimationFrame(() => setVisible(true));
      });
    } else {
      outerRaf = window.requestAnimationFrame(() => {
        setVisible(false);
        if (prefersReducedMotion()) {
          setMounted(false);
          return;
        }
        unmountTimeout = window.setTimeout(() => setMounted(false), collapsibleCardFadeMs);
      });
    }

    return () => {
      window.cancelAnimationFrame(outerRaf);
      window.cancelAnimationFrame(innerRaf);
      window.clearTimeout(unmountTimeout);
    };
  }, [expanded]);

  // Growing back to the full tile (once `dimmed` clears — which the parent
  // already delays until the closing card has actually finished fading out)
  // should itself fade/scale in smoothly instead of just popping into place.
  const [tileVisible, setTileVisible] = useState(!dimmed);
  useEffect(() => {
    let innerRaf = 0;
    const outerRaf = window.requestAnimationFrame(() => {
      setTileVisible(false);
      if (dimmed) return;
      if (prefersReducedMotion()) {
        setTileVisible(true);
        return;
      }
      innerRaf = requestAnimationFrame(() => setTileVisible(true));
    });
    return () => {
      window.cancelAnimationFrame(outerRaf);
      window.cancelAnimationFrame(innerRaf);
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

  if (!mounted) {
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
        className={`ui-press group relative flex aspect-[4/3] w-full flex-col items-stretch justify-between gap-3 rounded-md border border-gray-200 bg-white p-5 text-left !transition-all !duration-300 !ease-out motion-reduce:!transition-none hover:z-10 hover:-rotate-1 hover:scale-[1.05] motion-reduce:hover:rotate-0 motion-reduce:hover:scale-100 hover:shadow-lg dark:border-gray-800 dark:bg-gray-950 ${
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
              <div key={item.key} className={`flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-md border p-2 text-center ${item.tone ? cardToneTile[item.tone] : cardToneNeutral}`}>
                <p className="truncate text-[16px] font-bold uppercase tracking-wide leading-tight">{item.label}</p>
                <p className={`truncate font-mono text-[28px] font-bold leading-tight tabular-nums sm:text-[32px] ${item.valueClass ?? "text-gray-950 dark:text-white"}`}>{item.value}</p>
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
        // link, form field, ...) collapses it back to a tile. `.recharts-wrapper`
        // counts as a control too: its bars are plain SVG paths, so without it a
        // click that drills into a bar would collapse the whole card underneath.
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [role='button'], [role='separator'], .recharts-wrapper")) return;
        onToggle();
      }}
      style={{ order: orderRank }}
      className={`col-span-full cursor-pointer origin-top overflow-visible rounded-md border border-gray-200 bg-white transition-all duration-200 ease-out motion-reduce:transition-none dark:border-gray-800 dark:bg-gray-950 ${
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
      {summary?.length && showSummaryWhenExpanded ? (
        <div className="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-200 dark:border-gray-800 dark:bg-gray-800 lg:grid-cols-4">
          {summary.map((item) => {
            // A tile with an `href` drills into its own page; the section's
            // click-to-collapse handler already skips anchors.
            const className = `px-4 py-3.5 ${item.tone ? cardToneRow[item.tone] : "bg-white text-gray-500 dark:bg-gray-950 dark:text-gray-400"} ${item.href ? "cursor-pointer hover:brightness-95 dark:hover:brightness-125" : ""}`;
            const content = (
              <>
                <p className="text-[13px] font-bold uppercase tracking-wide">{item.label}</p>
                <p className={`mt-1 truncate font-mono text-[24px] font-bold tabular-nums sm:text-[28px] ${item.valueClass ?? "text-gray-950 dark:text-white"}`}>{item.value}</p>
                {item.helper ? <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{item.helper}</p> : null}
              </>
            );
            return item.href ? (
              <Link key={item.key} href={item.href} className={className}>{content}</Link>
            ) : (
              <div key={item.key} className={className}>{content}</div>
            );
          })}
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
  const restaurantId = activeMembership?.restaurant_id ?? null;
  const canViewExpenses = can(activeMembership, "manage_expenses") || can(activeMembership, "view_reports");
  const canViewReports = can(activeMembership, "view_reports");
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
  // Bumped by background refreshes (realtime order events, the 60s poll) so the
  // server-side report views reload with them. Without it they would only
  // refetch when the mode or date changed, and a bill paid while the page sat
  // open would never reach the chart. Only background refreshes bump it — the
  // first load already fetches them once on its own.
  const [refreshTick, setRefreshTick] = useState(0);
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
  }, [expandedKey, switchingCard, closingKey]);
  const pendingSwitchRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pendingSwitchRef.current) window.clearTimeout(pendingSwitchRef.current);
    };
  }, []);
  // Leaving for /reports or /expenses unmounts this page, so the open card is
  // remembered for the tab and reopened on the way back. Restored after mount
  // rather than as the initial state, which would not match the server render.
  useEffect(() => {
    const saved = sessionStorage.getItem(expandedCardStorageKey);
    if (saved) setExpandedKey(saved);
  }, []);

  const [splitPct, setSplitPct] = useState(cardSplitDefault);
  const [splitDragging, setSplitDragging] = useState(false);
  const splitRowRef = useRef<HTMLDivElement | null>(null);
  // Read after mount for the same reason as the open card: the server has no
  // localStorage, so seeding the initial state from it would not hydrate.
  useEffect(() => {
    const saved = Number(localStorage.getItem(cardSplitStorageKey));
    if (Number.isFinite(saved) && saved > 0) setSplitPct(clampSplit(saved));
  }, []);
  const moveSplitTo = (pct: number) => setSplitPct(clampSplit(pct));
  // Written on release and on each keypress rather than on every pointermove —
  // a drag would otherwise hit localStorage a few hundred times.
  const persistSplit = () => localStorage.setItem(cardSplitStorageKey, String(Math.round(splitPct)));
  const toggleCard = (key: string) => {
    // Both branches below land on `key` open, or nothing open — record that now
    // so it survives navigating away to a monthly page and back.
    if (expandedKey === key) sessionStorage.removeItem(expandedCardStorageKey);
    else sessionStorage.setItem(expandedCardStorageKey, key);
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
  // Expenses have no hour to plot; land on the day view instead of a blank one.
  const selectChartMetric = (metric: ChartMetric) => {
    setChartMetric(metric);
    if (metric === "cost" && chartMode === "hour") setChartMode("day");
  };
  const [salesDays, setSalesDays] = useState<ReportSalesDay[]>([]);
  const [salesDaysLoading, setSalesDaysLoading] = useState(false);
  const salesDaysLoadedRef = useRef(false);
  const [salesHours, setSalesHours] = useState<ReportSalesHour[]>([]);
  const [salesHoursLoading, setSalesHoursLoading] = useState(false);
  // A failed request must not render as "no sales today" — that reads as a real
  // zero and hides an outage (a stale backend missing the route 404s here).
  const [salesHoursFailed, setSalesHoursFailed] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  // Cash that actually left the till, keyed by Bangkok calendar day. This is the
  // expense ledger (a supplier payment, rent, a new fridge) — deliberately not
  // the recipe cost of food sold, which is what ReportSalesDay.cost carries.
  const [expenseLedger, setExpenseLedger] = useState<ExpenseLedgerState>(EMPTY_EXPENSE_LEDGER);
  const expenseScopeMatches = canViewExpenses && expenseLedger.restaurantId === restaurantId;
  const expenses = expenseScopeMatches ? expenseLedger.expenses : EMPTY_EXPENSE_LEDGER.expenses;
  const expenseDaily = expenseScopeMatches ? expenseLedger.daily : EMPTY_EXPENSE_LEDGER.daily;
  const [expensesLoading, setExpensesLoading] = useState(false);
  // Revenue and profit share the bills table; only cost gets the ledger one.
  const visibleChartMetric: ChartMetric = chartMetric === "cost" && !canViewExpenses ? "revenue" : chartMetric;
  const detailKind: "sales" | "cost" = visibleChartMetric === "cost" ? "cost" : "sales";
  // Which bar the user drilled into, and the bills behind it. One table covers
  // every metric — it carries revenue, cost and profit columns together.
  const [detailBar, setDetailBar] = useState<ChartPoint | null>(null);
  // Tagged with the bar AND the kind it belongs to, so neither a different bar
  // nor a switch between the bills and ingredients tables can render stale rows
  // under the new heading while the next request is in flight.
  const [detail, setDetail] = useState<{ key: string; kind: "sales"; data: SalesDetailReport } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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

  // Loaded on mount, not on first day/month chart view: the month section reads
  // its revenue and profit off this, and that shows while the card is collapsed.
  useEffect(() => {
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

  // Unlike the 90-day manager report, the hourly breakdown is per-date, so it
  // refetches whenever the selected day changes rather than loading once. It is
  // fetched regardless of the chart mode because the summary tiles read the
  // day's cost off it, and those show even while the card is collapsed.
  useEffect(() => {
    if (!activeMembership?.restaurant_id) return;
    let cancelled = false;
    setSalesHoursLoading(true);
    getSalesByHour(selectedDate)
      .then((res) => {
        if (cancelled) return;
        setSalesHours(res.data.hours ?? []);
        setSalesHoursFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSalesHours([]);
        setSalesHoursFailed(true);
      })
      .finally(() => {
        if (!cancelled) setSalesHoursLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, activeMembership?.restaurant_id, refreshTick]);

  // The ledger for the calendar month around the selected date, with a week of
  // slack either side so the Mon–Sun week view can straddle a month boundary.
  // One fetch feeds the expense tile, the cost bars and their drill-down.
  const expenseMonth = selectedDate.slice(0, 7);
  useEffect(() => {
    let cancelled = false;
    if (restaurantId === null || !canViewExpenses) {
      const resetFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        setExpenseLedger(EMPTY_EXPENSE_LEDGER);
        setExpensesLoading(false);
        setChartMetric((current) => (current === "cost" ? "revenue" : current));
        setDetailBar(null);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(resetFrame);
      };
    }
    const anchor = new Date(`${expenseMonth}-01T12:00:00`);
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), -6, 12);
    const until = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 7, 12);
    const requestedRestaurantId = restaurantId;
    setExpenseLedger((current) => (current.restaurantId === restaurantId ? current : EMPTY_EXPENSE_LEDGER));
    setExpensesLoading(true);
    listExpenses({ from: toDashboardDate(from), until: toDashboardDate(until) })
      .then((res) => {
        if (cancelled) return;
        setExpenseLedger({
          restaurantId: requestedRestaurantId,
          expenses: res.data.expenses ?? [],
          daily: res.data.daily ?? [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setExpenseLedger(EMPTY_EXPENSE_LEDGER);
      })
      .finally(() => {
        if (!cancelled) setExpensesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseMonth, restaurantId, canViewExpenses, refreshTick]);

  // A bar's key is an hour number in hour view and a YYYY-MM-DD date in the day
  // and month views (both of those plot days), so that alone picks the window.
  useEffect(() => {
    // A cost bar drills into the ledger rows already in `expenses` — no request.
    if (!detailBar || detailKind !== "sales" || !activeMembership?.restaurant_id) return;
    let cancelled = false;
    setDetailLoading(true);
    const [date, hour] =
      chartMode === "hour" ? [selectedDate, Number(detailBar.key)] : [detailBar.key, undefined];
    getSalesDetail(date, hour)
      .then((res) => ({ key: detailBar.key, kind: "sales" as const, data: res.data }))
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setDetailFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setDetailFailed(true);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailBar, detailKind, chartMode, selectedDate, activeMembership?.restaurant_id, refreshTick]);


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
      if (background) setRefreshTick((tick) => tick + 1);
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
  // Daily totals come from an uncapped server aggregate. The ledger rows below
  // remain useful for drill-down, but must not be used to calculate chart bars.
  const expenseByDate = useMemo(() => dailyExpenseTotalsByDate(expenseDaily), [expenseDaily]);
  // The month containing the selected day. Expenses are whole-month by nature —
  // one rent transfer lands on one date — so revenue is summed the same way.
  const monthExpense = totalDailyExpensesForMonth(expenseDaily, expenseMonth);
  const monthSales = salesDays.filter((day) => day.order_date.startsWith(expenseMonth));
  const monthRevenue = monthSales.reduce((sum, day) => sum + day.revenue, 0);
  const monthProfit = monthSales.reduce((sum, day) => sum + day.profit, 0);
  const dayProfit = salesHours.reduce((sum, hour) => sum + hour.profit, 0);
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

  const salesByHour = new Map(salesHours.map((entry) => [entry.hour, entry]));
  const hourlyPoints: ChartPoint[] = operatingHours.map((hourNumber) => ({
    key: String(hourNumber),
    label: String(hourNumber).padStart(2, "0"),
    value: salesByHour.get(hourNumber)?.[visibleChartMetric] ?? 0,
  }));

  const salesByDate = new Map(salesDays.map((day) => [day.order_date, day]));
  const valueForDate = (date: Date) => {
    const key = toDashboardDate(date);
    if (visibleChartMetric === "cost") return expenseByDate.get(key)?.amount ?? 0;
    const day = salesByDate.get(key);
    return day ? day[visibleChartMetric] : 0;
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
    return { key: toDashboardDate(date), label: weekdayLabels[index], value: valueForDate(date) };
  });

  // Month view: every day of the calendar month containing the selected date.
  const daysInMonth = new Date(selectedDateAtNoon.getFullYear(), selectedDateAtNoon.getMonth() + 1, 0).getDate();
  const monthlyPoints: ChartPoint[] = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const date = new Date(selectedDateAtNoon.getFullYear(), selectedDateAtNoon.getMonth(), dayNumber, 12);
    return { key: toDashboardDate(date), label: String(dayNumber), value: valueForDate(date) };
  });

  const metricOptions: { key: ChartMetric; label: string }[] = [
    { key: "revenue", label: copy.metricRevenue },
    ...(canViewExpenses ? [{ key: "cost" as const, label: copy.metricCost }] : []),
    { key: "profit", label: copy.metricProfit },
  ];
  // The ledger records the day money was spent, never the hour, so hourly
  // expense bars would be a row of zeros. Day and month only for that metric.
  const chartModeOptions: { key: ChartMode; label: string }[] = [
    ...(visibleChartMetric === "cost" ? [] : [{ key: "hour" as const, label: copy.chartHour }]),
    { key: "day", label: copy.chartDay },
    { key: "month", label: copy.chartMonth },
  ];
  const chartTitles: Record<ChartMetric, Record<ChartMode, string>> = {
    revenue: { hour: copy.chartTitleRevenueHour, day: copy.chartTitleRevenueDay, month: copy.chartTitleRevenueMonth },
    cost: { hour: copy.chartTitleCostDay, day: copy.chartTitleCostDay, month: copy.chartTitleCostMonth },
    profit: { hour: copy.chartTitleProfitHour, day: copy.chartTitleProfitDay, month: copy.chartTitleProfitMonth },
  };
  const activeChartTitle = chartTitles[visibleChartMetric][chartMode];
  const activeChartData = chartMode === "hour" ? hourlyPoints : chartMode === "day" ? dailyPoints : monthlyPoints;
  // Only block on the very first load. A background refresh keeps the current
  // bars on screen instead of blinking the chart to a spinner every minute —
  // the header already shows that a refresh is in flight.
  const activeChartLoading =
    visibleChartMetric === "cost"
      ? expensesLoading && expenseDaily.length === 0
      : chartMode === "hour"
        ? salesHoursLoading && salesHours.length === 0
        : salesDaysLoading;
  const activeChartHasData =
    visibleChartMetric === "cost"
      ? activeChartData.some((point) => point.value > 0)
      : chartMode === "hour"
        ? salesHours.length > 0
        : activeChartData.some((point) => salesByDate.has(point.key));
  // Switching view drops the drilled-into bar by itself: an hour key stops
  // existing once the chart plots dates. Switching metric keeps it, which is
  // right — the table already carries revenue, cost and profit columns.
  const activeDetailBar = detailBar && activeChartData.some((point) => point.key === detailBar.key) ? detailBar : null;
  const matchedDetail = activeDetailBar && detail?.key === activeDetailBar.key ? detail : null;
  const shownSales = detailKind === "sales" ? (matchedDetail?.data ?? null) : null;
  // The ledger rows behind a cost bar are already loaded, so they are filtered
  // out of the same list the bar was summed from and can never disagree with it.
  const shownExpenses =
    detailKind === "cost" && activeDetailBar
      ? expenses.filter((item) => item.spent_at.slice(0, 10) === activeDetailBar.key)
      : [];
  const shownExpenseAggregate = activeDetailBar ? expenseByDate.get(activeDetailBar.key) : undefined;
  const shownExpensesTotal = shownExpenseAggregate?.amount ?? 0;
  const shownExpensesEntries = shownExpenseAggregate?.entries ?? 0;
  const shownExpensesHaveMore = hasPartialDailyExpenseRows(shownExpenses.length, shownExpensesEntries);

  // The bar's own label is an axis tick ("จ", "3", "13") and never states which
  // day it is. Spell the window out instead, from the same key the request used.
  const detailWindowLabel = (() => {
    if (!activeDetailBar) return "";
    const dateKey = chartMode === "hour" ? selectedDate : activeDetailBar.key;
    const dayLabel = new Date(`${dateKey}T12:00:00`).toLocaleDateString(language === "th" ? "th-TH" : "en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    if (chartMode !== "hour") return dayLabel;
    const startHour = Number(activeDetailBar.key);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${dayLabel} · ${pad(startHour)}:00–${pad((startHour + 1) % 24)}:00`;
  })();

  const lowStockCount = ingredients.filter((item) => item.min_stock > 0 && item.stock <= item.min_stock * 1.5).length;

  const selectedMonthLabel = selectedDateAtNoon.toLocaleDateString(language === "th" ? "th-TH" : "en-US", { month: "long", year: "numeric" });
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

  const summary = [
    { key: "orders", label: copy.ordersTotal, value: validOrders.length.toLocaleString(), helper: `${copy.activeOrders} ${activeOrders}` },
    { key: "revenue", label: copy.paidRevenue, value: formatCurrency(paidRevenue, language), helper: `${paidOrders.length} ${copy.order}`, tone: "revenue" as const },
    // A loss on a green tile would read as good news, so it borrows the cost
    // tone, and the signed figure is coloured to match.
    {
      key: "profit",
      label: copy.metricProfit,
      value: formatCurrency(dayProfit, language, 0, "exceptZero"),
      valueClass:
        dayProfit < 0
          ? "text-red-600 dark:text-red-400"
          : dayProfit > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-gray-950 dark:text-white",
      tone: (dayProfit < 0 ? "cost" : "profit") as CardTone,
    },
  ];

  const liveWorkSummary: CardSummaryItem[] = [
    { key: "late", label: copy.lateKitchen, value: delayed.length.toLocaleString() },
    { key: "ready", label: copy.readyToServe, value: ready.length.toLocaleString() },
    { key: "tables", label: copy.occupiedTables, value: occupied.length.toLocaleString() },
    { key: "stock", label: copy.lowStock, value: lowStockCount.toLocaleString() },
  ];

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
              <h1 className="text-[28px] font-bold tracking-tight text-gray-950 dark:text-white sm:text-[34px]">{copy.title}</h1>
              {refreshing ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label={copy.loading} /> : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <button type="button" onClick={() => selectDate(shiftDashboardDate(selectedDate, -1))} aria-label={copy.previousDay} title={copy.previousDay} className="ui-press inline-flex h-10 w-10 items-center justify-center border-r border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              {/* The native input drives the value but renders the browser's own
                  numeric format, so it sits transparent on top and the readable
                  weekday/date is drawn underneath it. */}
              <label className="relative inline-flex h-10 min-w-0 cursor-pointer items-center gap-2 px-3 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-orange-500/40 dark:hover:bg-gray-900">
                <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="sr-only">{copy.chooseDate}</span>
                <span aria-hidden="true" className="whitespace-nowrap text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                  {selectedDateLabel}
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  max={today}
                  onChange={(event) => selectDate(event.target.value)}
                  onClick={(event) => event.currentTarget.showPicker?.()}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
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
              showSummaryWhenExpanded={false}
              expanded={expandedKey === "sales"}
              dimmed={isCardDimmed("sales")}
              collapsedRank={collapsedRank("sales")}
              onToggle={() => toggleCard("sales")}
            >
              <div ref={splitRowRef} className="overflow-visible lg:flex lg:items-stretch">
                <div
                  style={{ width: `${splitPct}%` }}
                  className="min-w-0 border-b border-gray-200 p-4 dark:border-gray-800 max-lg:!w-full lg:shrink-0 lg:border-b-0"
                >
                  <div className="border-b-2 border-gray-900 pb-1.5 dark:border-white">
                    <h3 className="text-[17px] font-bold uppercase tracking-wide text-gray-950 dark:text-white">{copy.thisDay}</h3>
                  </div>
                  <div className="mb-3 mt-3 grid grid-cols-3 gap-2">
                    {summary.map((item) => (
                      <div key={item.key} className={`rounded-md border px-3 py-2 ${item.tone ? cardToneTile[item.tone] : cardToneNeutral}`}>
                        <p className="truncate text-[12px] font-bold uppercase tracking-wide">{item.label}</p>
                        <p className={`mt-0.5 truncate font-mono text-[19px] font-bold tabular-nums sm:text-[22px] ${item.valueClass ?? "text-gray-950 dark:text-white"}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                      {metricOptions.map(({ key: metric, label }) => (
                        <button
                          key={metric}
                          type="button"
                          onClick={() => selectChartMetric(metric)}
                          className={`ui-press px-2.5 py-1 text-[11px] font-semibold ${
                            visibleChartMetric === metric
                              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                              : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
                          }`}
                        >
                          {label}
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
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <h3 className="text-[12px] font-medium text-gray-600 dark:text-gray-300">{activeChartTitle}</h3>
                    {visibleChartMetric === "cost" ? (
                      <button
                        type="button"
                        onClick={() => router.push("/expenses")}
                        className="ui-press inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        {copy.viewExpenseLedger}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                  {activeChartLoading ? (
                    <div className="flex h-56 items-center justify-center text-[12px] text-gray-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {copy.loading}
                    </div>
                  ) : activeChartHasData ? (
                    <ChartBox
                      data={activeChartData}
                      title={activeChartTitle}
                      language={language}
                      lossColoring={visibleChartMetric === "profit"}
                      selectedKey={activeDetailBar?.key ?? null}
                      onSelect={(point) => setDetailBar((current) => (current?.key === point.key ? null : point))}
                    />
                  ) : (
                    <div className={`flex h-56 items-center justify-center px-3 text-center text-[12px] ${chartMode === "hour" && salesHoursFailed ? "text-red-600 dark:text-red-400" : "text-gray-400"}`}>
                      {chartMode === "hour" && salesHoursFailed ? copy.loadError : copy.noSales}
                    </div>
                  )}

                  {activeDetailBar ? (
                    <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-800">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                        <div className="min-w-0">
                          <h4 className="text-[12px] font-semibold text-gray-950 dark:text-white">
                            {detailKind === "cost" ? copy.metricCost : copy.drillTitle} · {detailWindowLabel}
                          </h4>
                          {shownSales ? (
                            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                              {copy.revenue} {formatCurrency(shownSales.summary.revenue, language)} · {copy.cost}{" "}
                              {formatCurrency(shownSales.summary.cost, language)} · {copy.profit}{" "}
                              {formatCurrency(shownSales.summary.profit, language)}
                            </p>
                          ) : detailKind === "cost" ? (
                            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                              {copy.metricCost} {formatCurrency(shownExpensesTotal, language)} · {shownExpensesEntries}{" "}
                              {copy.ingredients}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailBar(null)}
                          className="ui-press shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                        >
                          {copy.drillClose}
                        </button>
                      </div>

                      {detailLoading && !matchedDetail ? (
                        <div className="flex items-center justify-center px-3 py-8 text-[12px] text-gray-400">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {copy.loading}
                        </div>
                      ) : shownExpenses.length ? (
                        <div className="max-h-64 overflow-y-auto">
                          <div className="grid grid-cols-[minmax(90px,0.6fr)_minmax(0,1fr)_minmax(80px,0.6fr)] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
                            <span>{copy.expenseCategory}</span>
                            <span>{copy.expenseNote}</span>
                            <span className="text-right">{copy.metricCost}</span>
                          </div>
                          <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {shownExpenses.map((item) => (
                              <div key={item.ID} className="grid grid-cols-[minmax(90px,0.6fr)_minmax(0,1fr)_minmax(80px,0.6fr)] items-center gap-2 px-3 py-2">
                                <span className="truncate text-[11px] text-gray-700 dark:text-gray-200">{expenseCategoryLabels[language][item.category] ?? item.category}</span>
                                <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">{item.note || "-"}</span>
                                <span className="text-right font-mono text-[11px] font-semibold tabular-nums text-gray-950 dark:text-white">{formatCurrency(item.amount, language)}</span>
                              </div>
                            ))}
                          </div>
                          {shownExpensesHaveMore ? (
                            <p className="border-t border-gray-100 px-3 py-1.5 text-center text-[10px] text-gray-400 dark:border-gray-800">{copy.drillCapped}</p>
                          ) : null}
                        </div>
                      ) : shownSales?.orders.length ? (
                        <div className="max-h-64 overflow-y-auto">
                          <div className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1fr)_60px_repeat(3,minmax(72px,0.7fr))] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
                            <span>{copy.order}</span>
                            <span>{copy.location}</span>
                            <span className="text-right">{copy.time}</span>
                            <span className="text-right">{copy.revenue}</span>
                            <span className="text-right">{copy.cost}</span>
                            <span className="text-right">{copy.profit}</span>
                          </div>
                          <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {shownSales.orders.map((row) => (
                              <button
                                key={row.order_id}
                                type="button"
                                onClick={() => router.push(orderPosHref({ ID: row.order_id, order_number: row.order_number }))}
                                className="ui-press grid w-full grid-cols-[minmax(90px,0.8fr)_minmax(0,1fr)_60px_repeat(3,minmax(72px,0.7fr))] items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                              >
                                <span className="font-mono text-[11px] font-semibold text-gray-950 dark:text-white">#{row.order_number}</span>
                                <span className="truncate text-[11px] text-gray-600 dark:text-gray-300">
                                  {row.table_label || row.customer_name || (row.order_type === "takeaway" ? (language === "th" ? "กลับบ้าน" : "Takeaway") : "-")}
                                </span>
                                <span className="text-right font-mono text-[10px] text-gray-400">
                                  {new Date(row.completed_at).toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className="text-right font-mono text-[11px] tabular-nums text-gray-700 dark:text-gray-200">{formatCurrency(row.revenue, language)}</span>
                                <span className="text-right font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{formatCurrency(row.cost, language)}</span>
                                <span className={`text-right font-mono text-[11px] font-semibold tabular-nums ${row.profit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-950 dark:text-white"}`}>
                                  {formatCurrency(row.profit, language)}
                                </span>
                              </button>
                            ))}
                          </div>
                          {shownSales.has_more ? (
                            <p className="border-t border-gray-100 px-3 py-1.5 text-center text-[10px] text-gray-400 dark:border-gray-800">{copy.drillCapped}</p>
                          ) : null}
                        </div>
                      ) : detailKind === "cost" && shownExpensesEntries > 0 && shownExpensesHaveMore ? (
                        <p className="px-3 py-8 text-center text-[12px] text-gray-400">{copy.drillCapped}</p>
                      ) : (
                        <p className={`px-3 py-8 text-center text-[12px] ${detailFailed && detailKind === "sales" ? "text-red-600 dark:text-red-400" : "text-gray-400"}`}>
                          {detailFailed && detailKind === "sales" ? copy.loadError : copy.drillEmpty}
                        </p>
                      )}
                    </div>
                  ) : activeChartHasData ? (
                    <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-gray-500">{copy.drillHint}</p>
                  ) : null}
                </div>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={copy.resizeSplit}
                  aria-valuenow={Math.round(splitPct)}
                  aria-valuemin={cardSplitMin}
                  aria-valuemax={cardSplitMax}
                  tabIndex={0}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setSplitDragging(true);
                  }}
                  onPointerMove={(event) => {
                    if (!splitDragging || !splitRowRef.current) return;
                    const rect = splitRowRef.current.getBoundingClientRect();
                    moveSplitTo(((event.clientX - rect.left) / rect.width) * 100);
                  }}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    setSplitDragging(false);
                    persistSplit();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    moveSplitTo(splitPct + (event.key === "ArrowLeft" ? -2 : 2));
                    persistSplit();
                  }}
                  onDoubleClick={() => {
                    moveSplitTo(cardSplitDefault);
                    localStorage.setItem(cardSplitStorageKey, String(cardSplitDefault));
                  }}
                  className={`group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none border-x border-gray-200 bg-gray-100 transition-colors hover:bg-orange-400 focus-visible:outline-none focus-visible:bg-orange-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-orange-500 lg:block ${
                    splitDragging ? "bg-orange-500 dark:bg-orange-500" : ""
                  }`}
                >
                  <span className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400 group-hover:bg-white dark:bg-gray-600" aria-hidden="true" />
                </div>

                {/* Left pane is the selected day; this one is the month it falls
                    in. The revenue and expense figures are themselves the links
                    to their full monthly pages. */}
                <div className="min-w-0 flex-1 bg-slate-100/70 p-4 dark:bg-gray-900/50">
                  <div className="flex flex-wrap items-baseline gap-x-2 border-b-2 border-orange-500 pb-1.5 dark:border-orange-400">
                    <h3 className="text-[17px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">{copy.thisMonth}</h3>
                    <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{selectedMonthLabel}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { key: "revenue", label: copy.metricRevenue, value: formatCurrency(monthRevenue, language), tone: "revenue" as CardTone, href: canViewReports ? "/reports" : undefined },
                      ...(canViewExpenses ? [{ key: "cost", label: copy.metricCost, value: formatCurrency(monthExpense, language), tone: "cost" as CardTone, href: "/expenses" }] : []),
                      { key: "profit", label: copy.metricProfit, value: formatCurrency(monthProfit, language, 0, "exceptZero"), tone: (monthProfit < 0 ? "cost" : "profit") as CardTone, valueClass: monthProfit < 0 ? "text-red-600 dark:text-red-400" : "text-gray-950 dark:text-white" },
                      { key: "orders", label: copy.ordersTotal, value: monthSales.reduce((sum, day) => sum + day.orders, 0).toLocaleString() },
                    ].map((stat) => {
                      const tileClass = `block rounded-md border px-3 py-2 ${stat.tone ? cardToneTile[stat.tone] : cardToneNeutral} ${
                        stat.href ? "ui-press cursor-pointer shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:brightness-105 dark:hover:brightness-125" : ""
                      }`;
                      const body = (
                        <>
                          <p className="flex items-center gap-1 truncate text-[12px] font-bold uppercase tracking-wide">
                            {stat.label}
                            {stat.href ? (
                              <span className="ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-current/15">
                                <ArrowRight className="h-3 w-3" aria-hidden="true" />
                              </span>
                            ) : null}
                          </p>
                          <p className={`mt-0.5 truncate font-mono text-[22px] font-bold tabular-nums sm:text-[26px] ${stat.valueClass ?? "text-gray-950 dark:text-white"}`}>
                            {salesDaysLoading && !salesDays.length ? "—" : stat.value}
                          </p>
                        </>
                      );
                      return stat.href ? (
                        <Link key={stat.key} href={stat.href} className={tileClass}>{body}</Link>
                      ) : (
                        <div key={stat.key} className={tileClass}>{body}</div>
                      );
                    })}
                  </div>

                  <h3 className="mt-4 border-t border-gray-200 pt-4 text-[12px] font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">{copy.topItems}</h3>

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
