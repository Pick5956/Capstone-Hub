"use client";

import { useAuth } from "@/src/providers/AuthProvider";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useState, useRef, useEffect } from "react";

// ─── shared chart tick style ────────────────────────────────────────────────
const TICK = { fontSize: 14, fill: "#94a3b8", fontWeight: 500 } as const;

// ─── date helpers ────────────────────────────────────────────────────────────
const toDateStr = (d: Date) => d.toISOString().split("T")[0];

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function diffDays(a: Date, b: Date) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

// ─── generate mock trend data for any date range ─────────────────────────────
function genRevenueTrend(from: Date, to: Date) {
  const days = diffDays(from, to);
  // Pick a sensible tick density
  const buckets = days <= 14 ? days : days <= 60 ? Math.ceil(days / 3) : days <= 180 ? Math.ceil(days / 7) : Math.ceil(days / 14);
  const step = days / buckets;
  const seed = from.getTime(); // deterministic pseudo-random
  const rand = (i: number, base: number, amp: number) => {
    const x = Math.sin(seed / 1e9 + i * 1.3) * 10000;
    return Math.round(base + (x - Math.floor(x)) * amp);
  };
  return Array.from({ length: buckets }, (_, i) => {
    const d = addDays(from, Math.round(i * step));
    const label = days <= 14
      ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })
      : days <= 60
      ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })
      : days <= 370
      ? d.toLocaleDateString("th-TH", { month: "short" })
      : d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
    return {
      day: label,
      revenue: rand(i, 8000, 16000),
      orders: rand(i * 2, 30, 80),
      target: 12000,
    };
  });
}

// ─── static mock data (unchanged by date range) ──────────────────────────────
const hourlyOrders = [
  { hour: "09", orders: 5 },  { hour: "10", orders: 12 },
  { hour: "11", orders: 24 }, { hour: "12", orders: 48 },
  { hour: "13", orders: 42 }, { hour: "14", orders: 18 },
  { hour: "15", orders: 11 }, { hour: "16", orders: 14 },
  { hour: "17", orders: 22 }, { hour: "18", orders: 51 },
  { hour: "19", orders: 63 }, { hour: "20", orders: 55 },
  { hour: "21", orders: 38 }, { hour: "22", orders: 17 },
];
const topItems = [
  { name: "ผัดไทย",        sales: 142, revenue: 28400 },
  { name: "ต้มยำกุ้ง",     sales: 118, revenue: 35400 },
  { name: "ข้าวมันไก่",    sales: 104, revenue: 15600 },
  { name: "ข้าวผัดกุ้ง",   sales: 89,  revenue: 17800 },
  { name: "สเต็กหมู",      sales: 76,  revenue: 30400 },
  { name: "แกงมัสมั่น",    sales: 65,  revenue: 19500 },
];
const categoryRevenue = [
  { name: "อาหารจานหลัก", value: 48, color: "#f97316" },
  { name: "เครื่องดื่ม",  value: 22, color: "#3b82f6" },
  { name: "ของหวาน",      value: 15, color: "#a855f7" },
  { name: "อาหารเรียกน้ำย่อย", value: 10, color: "#10b981" },
  { name: "อื่น ๆ",       value: 5,  color: "#94a3b8" },
];
const paymentMethods = [
  { name: "เงินสด",   value: 38, color: "#22c55e" },
  { name: "โอนเงิน", value: 45, color: "#6366f1" },
  { name: "บัตร",    value: 17, color: "#f59e0b" },
];

// ─── preset ranges ────────────────────────────────────────────────────────────
type Preset = { label: string; days: number | null };
const PRESETS: Preset[] = [
  { label: "วันนี้",         days: 0 },
  { label: "เมื่อวาน",      days: 1 },
  { label: "7 วันล่าสุด",   days: 7 },
  { label: "30 วันล่าสุด",  days: 30 },
  { label: "2 เดือนล่าสุด", days: 60 },
  { label: "6 เดือนล่าสุด", days: 180 },
  { label: "1 ปีล่าสุด",    days: 365 },
  { label: "กำหนดเอง",      days: null },
];

function presetRange(p: Preset, today: Date): { from: Date; to: Date } {
  if (p.days === 0) return { from: today, to: today };
  if (p.days === 1) { const y = addDays(today, -1); return { from: y, to: y }; }
  if (p.days !== null) return { from: addDays(today, -(p.days - 1)), to: today };
  return { from: addDays(today, -29), to: today };
}

// ─── components ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, icon, accent }: {
  label: string; value: string; sub: string; trend: number; icon: React.ReactNode; accent: string;
}) {
  const up = trend >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${accent.replace("bg-gradient-to-r","bg-gradient-to-br")} shadow-md`}>
          {icon}
        </div>
        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${up ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
          {up ? "▲" : "▼"} {Math.abs(trend)}%
        </span>
      </div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-gray-900 dark:text-white mt-0.5">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function Card({ title, sub, children, action }: {
  title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-50 dark:border-gray-800">
        <div>
          <p className="font-extrabold text-gray-900 dark:text-white text-base">{title}</p>
          {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const TooltipBox = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl p-3 text-xs min-w-[130px]">
      <p className="font-bold text-gray-700 dark:text-gray-300 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name}
          </span>
          <span className="font-bold text-gray-900 dark:text-white">
            {p.name.includes("฿") || p.name.includes("ยอด") ? `฿${p.value.toLocaleString()}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Date Range Picker ────────────────────────────────────────────────────────
function DateRangePicker({ from, to, onChange }: {
  from: Date; to: Date;
  onChange: (from: Date, to: Date, label: string) => void;
}) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("7 วันล่าสุด");
  const [customFrom, setCustomFrom] = useState(toDateStr(from));
  const [customTo,   setCustomTo]   = useState(toDateStr(to));
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectPreset = (p: Preset) => {
    if (p.days === null) { setActivePreset(p.label); return; }
    setActivePreset(p.label);
    const { from: f, to: t } = presetRange(p, today);
    setCustomFrom(toDateStr(f));
    setCustomTo(toDateStr(t));
    onChange(f, t, p.label);
    setOpen(false);
  };

  const applyCustom = () => {
    const f = new Date(customFrom); const t = new Date(customTo);
    if (isNaN(f.getTime()) || isNaN(t.getTime()) || f > t) return;
    setActivePreset("กำหนดเอง");
    onChange(f, t, `${customFrom} ถึง ${customTo}`);
    setOpen(false);
  };

  const fmt = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  const label = from.getTime() === to.getTime() ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-600 transition-all shadow-sm"
      >
        {/* calendar icon */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span>{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl p-4 min-w-[280px]">
          {/* Preset buttons */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">ช่วงเวลาด่วน</p>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => selectPreset(p)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all
                  ${activePreset === p.label
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20"
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          <div className={`space-y-2 transition-all ${activePreset === "กำหนดเอง" ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">กำหนดเอง</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 mb-1">จากวันที่</p>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <span className="text-gray-300 mt-4">→</span>
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 mb-1">ถึงวันที่</p>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={toDateStr(today)}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors"
            >
              ดูข้อมูล
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { user, loading, openLoginModal } = useAuth();
  const today = new Date(); today.setHours(0,0,0,0);

  const [dateFrom, setDateFrom] = useState(() => addDays(today, -6));
  const [dateTo,   setDateTo]   = useState(today);
  const [rangeLabel, setRangeLabel] = useState("7 วันล่าสุด");

  const trendData = genRevenueTrend(dateFrom, dateTo);
  const days = diffDays(dateFrom, dateTo);

  const handleRange = (f: Date, t: Date, label: string) => {
    setDateFrom(f); setDateTo(t); setRangeLabel(label);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#faf9f7] dark:bg-[#0d0d0f]">
        <div className="w-10 h-10 border-4 border-orange-600/20 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] dark:bg-[#0d0d0f] pb-12">

      {/* ── page header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-6 md:px-10 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              ภาพรวมยอดขาย 📊
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {rangeLabel}{user ? ` · ${user.first_name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!user && (
              <button onClick={openLoginModal} className="px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors cursor-pointer">
                เข้าสู่ระบบ
              </button>
            )}
            <DateRangePicker from={dateFrom} to={dateTo} onChange={handleRange} />
          </div>
        </div>
      </div>

      <div className="px-6 md:px-10 py-6 space-y-6">

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="รายได้รวม" value={`฿${(18640 * Math.max(1, days / 7)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`ช่วง ${days} วัน`} trend={12.4} accent="bg-gradient-to-r from-orange-500 to-red-500"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
          />
          <KpiCard label="ออเดอร์ทั้งหมด" value={`${(87 * Math.max(1, days / 7)).toLocaleString(undefined, { maximumFractionDigits: 0 })} รายการ`} sub={`เฉลี่ย ฿214/ออเดอร์`} trend={8.2} accent="bg-gradient-to-r from-blue-500 to-cyan-500"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>}
          />
          <KpiCard label="โต๊ะที่ใช้บริการ" value="14 / 20" sub="อัตราการใช้ 70%" trend={5.0} accent="bg-gradient-to-r from-green-500 to-teal-500"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13M19 7v13M8 20h8"/></svg>}
          />
          <KpiCard label="ลูกค้าทั้งหมด" value={`${(203 * Math.max(1, days / 7)).toLocaleString(undefined, { maximumFractionDigits: 0 })} คน`} sub="เพิ่มขึ้นจากช่วงก่อน" trend={-3.1} accent="bg-gradient-to-r from-violet-500 to-purple-500"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>}
          />
        </div>

        {/* ── Revenue trend ───────────────────────────────────────────────── */}
        <Card title="แนวโน้มยอดขาย" sub={rangeLabel}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<TooltipBox />} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="target" name="เป้าหมาย" stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="revenue" name="ยอดขาย (฿)" stroke="#f97316" strokeWidth={2.5}
                fill="url(#revGrad)" dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* ── Hourly + Category ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Card title="ออเดอร์รายชั่วโมง" sub="ชั่วโมง peak ของร้าน">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourlyOrders} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="hour" tick={TICK} axisLine={false} tickLine={false} tickFormatter={v => `${v}:00`} />
                  <YAxis tick={TICK} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar dataKey="orders" name="ออเดอร์" radius={[6, 6, 0, 0]} fill="#f97316">
                    <LabelList dataKey="orders" position="top" fill="#64748b" fontSize={13} fontWeight={700} />
                    {hourlyOrders.map((e, i) => (
                      <Cell key={i} fill={e.orders >= 50 ? "#f97316" : e.orders >= 30 ? "#fb923c" : "#fed7aa"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card title="สัดส่วนรายได้" sub="แบ่งตามหมวดหมู่">
              <div className="flex flex-col items-center gap-4">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={categoryRevenue} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3} stroke="none">
                      {categoryRevenue.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={v => [`${v}%`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-1 gap-1.5 w-full">
                  {categoryRevenue.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />{c.name}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white">{c.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ── Top items + Payment ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Card title="เมนูขายดี" sub="เรียงตามจำนวนออเดอร์สะสม">
              <div className="space-y-3">
                {topItems.map((item, i) => {
                  const pct = Math.round((item.sales / topItems[0].sales) * 100);
                  const colors = ["#f97316","#fb923c","#fdba74","#3b82f6","#60a5fa","#93c5fd"];
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-gray-400 w-4">{i + 1}</span>
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-bold text-gray-900 dark:text-white">{item.sales} จาน</span>
                          <span className="text-green-600 dark:text-green-400 font-semibold">฿{item.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: colors[i] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card title="ช่องทางชำระเงิน" sub="สัดส่วนการชำระ">
              <div className="flex flex-col gap-5">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={paymentMethods} cx="50%" cy="50%" outerRadius={65} dataKey="value" paddingAngle={4} stroke="none">
                      {paymentMethods.map((p, i) => <Cell key={i} fill={p.color} />)}
                    </Pie>
                    <Tooltip formatter={v => [`${v}%`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {paymentMethods.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-2 rounded-full" style={{ width: `${p.value}%`, background: p.color }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-8 text-right">{p.value}%</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-16 truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ── Orders trend line ───────────────────────────────────────────── */}
        <Card title="จำนวนออเดอร์รายวัน" sub="เปรียบเทียบแนวโน้ม">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} />
              <Tooltip content={<TooltipBox />} />
              <Line type="monotone" dataKey="orders" name="จำนวนออเดอร์" stroke="#6366f1" strokeWidth={2.5}
                dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

      </div>
    </div>
  );
}
