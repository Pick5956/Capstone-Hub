"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type OrderStatus = "delayed" | "cooking" | "ready";
type TableStatus = "occupied" | "available" | "reserved" | "cleaning";

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

export default function Home() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const now = useNow();

  const copy = language === "th"
    ? {
        headerEyebrow: "Shift overview",
        headerTitle: "ภาพรวมร้านวันนี้",
        greeting: "สวัสดี",
        open: "เปิดให้บริการ",
        refresh: "รีเฟรช",
        newOrder: "ออเดอร์ใหม่",
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

  const orderTickets = [
    { id: 1044, table: "T3", items: language === "th" ? ["ข้าวมันไก่ x2", "น้ำส้ม"] : ["Chicken rice x2", "Orange juice"], waited: 22, total: 220, status: "delayed" as OrderStatus },
    { id: 1042, table: "T7", items: language === "th" ? ["ผัดกะเพราหมู", "ต้มยำกุ้ง", "ข้าวเปล่า x2"] : ["Basil pork", "Tom yum shrimp", "Steamed rice x2"], waited: 16, total: 540, status: "cooking" as OrderStatus },
    { id: 1047, table: "T5", items: language === "th" ? ["แกงมัสมั่นเนื้อ"] : ["Beef massaman curry"], waited: 12, total: 280, status: "cooking" as OrderStatus },
    { id: 1046, table: "T9", items: language === "th" ? ["ผัดไทย", "ส้มตำไทย"] : ["Pad Thai", "Papaya salad"], waited: 9, total: 240, status: "ready" as OrderStatus },
  ];

  const tables = [
    { id: "T1", status: "occupied" as TableStatus, guests: 4, mins: 35 },
    { id: "T2", status: "occupied" as TableStatus, guests: 2, mins: 12 },
    { id: "T3", status: "occupied" as TableStatus, guests: 3, mins: 48 },
    { id: "T4", status: "available" as TableStatus },
    { id: "T5", status: "occupied" as TableStatus, guests: 2, mins: 22 },
    { id: "T6", status: "cleaning" as TableStatus, mins: 4 },
    { id: "T7", status: "occupied" as TableStatus, guests: 4, mins: 18 },
    { id: "T8", status: "reserved" as TableStatus, guests: 4, mins: 30 },
  ];

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

  const topItems = [
    { name: language === "th" ? "ผัดกะเพรา" : "Basil stir-fry", sold: 24, stock: "low" },
    { name: language === "th" ? "ต้มยำกุ้ง" : "Tom yum shrimp", sold: 18, stock: "low" },
    { name: language === "th" ? "ข้าวมันไก่" : "Chicken rice", sold: 16, stock: "ok" },
  ];

  const hourly = [
    { hour: "11", orders: 12 },
    { hour: "12", orders: 28 },
    { hour: "13", orders: 22 },
    { hour: "14", orders: 14 },
    { hour: "15", orders: 9 },
    { hour: "16", orders: 11 },
    { hour: "17", orders: 19 },
    { hour: "18", orders: 38 },
    { hour: "19", orders: 47 },
  ];

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

  const shiftRevenue = 18640;
  const shiftOrders = 87;
  const guestCount = occupied.reduce((sum, table) => sum + (table.guests ?? 0), 0);
  const avgTicket = Math.round(shiftRevenue / shiftOrders);

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
                <button type="button" className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900">
                  {copy.refresh}
                </button>
                <button type="button" className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">
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
                                  <p className="font-mono text-[11px] text-gray-400">#{ticket.id}</p>
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
              {(["occupied", "available", "reserved", "cleaning"] as TableStatus[]).map((status) => (
                <div key={status} className="bg-white px-4 py-3 dark:bg-gray-950">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{tableMeta[status].label}</p>
                  <p className="mt-1 text-[20px] font-semibold tabular-nums">{tables.filter((table) => table.status === status).length}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-4">
              {tables.map((table) => (
                <div key={table.id} className={`rounded-md px-2.5 py-2 ${tableMeta[table.status].tone}`}>
                  <p className="text-[12px] font-semibold">{table.id}</p>
                  <p className="mt-0.5 text-[11px]">
                    {table.guests ? `${table.guests} ${copy.people}` : tableMeta[table.status].label}
                  </p>
                  {table.mins ? <p className="text-[11px] opacity-80">{table.mins} {copy.minutes}</p> : null}
                </div>
              ))}
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
            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="px-4 py-4 xl:border-r xl:border-gray-200 xl:dark:border-gray-800">
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.ordersOpen}</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-gray-900 dark:text-white">{87}</p>
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

                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourly} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(249, 115, 22, 0.06)" }}
                        formatter={(value) => [`${value} ${copy.demandTooltip}`, copy.orders]}
                        labelFormatter={(label) => `${label}:00`}
                      />
                      <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
                        {hourly.map((entry) => (
                          <Cell key={entry.hour} fill={entry.orders >= 35 ? "#f59e0b" : entry.orders >= 20 ? "#fb923c" : "#cbd5e1"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="divide-y divide-gray-200 px-4 py-2 dark:divide-gray-800">
                {topItems.map((item) => (
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
                ))}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
