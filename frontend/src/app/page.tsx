"use client";

import AppLogo from "@/src/components/shared/AppLogo";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Moon,
  ReceiptText,
  ShoppingCart,
  Sun,
  Table2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

type ShiftMetric = {
  label: string;
  value: string;
  note: string;
  tone: "neutral" | "orange" | "amber" | "emerald" | "sky";
};

type FlowItem = {
  label: string;
  title: string;
  desc: string;
  icon: LucideIcon;
};

type SurfaceItem = {
  eyebrow: string;
  title: string;
  desc: string;
  points: string[];
  icon: LucideIcon;
};

type RoleItem = {
  role: string;
  title: string;
  desc: string;
  icon: LucideIcon;
};

const SHIFT_METRICS: ShiftMetric[] = [
  { label: "โต๊ะใช้งาน", value: "6", note: "จาก 12 โต๊ะ", tone: "amber" },
  { label: "คิวครัว", value: "4", note: "2 รายการใกล้พร้อม", tone: "orange" },
  { label: "พร้อมเสิร์ฟ", value: "2", note: "แจ้งหน้าร้านแล้ว", tone: "emerald" },
  { label: "รอชำระ", value: "1", note: "โต๊ะ B2", tone: "sky" },
];

const TABLES = [
  { id: "A1", status: "ว่าง", tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300" },
  { id: "A2", status: "กำลังทาน", tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300" },
  { id: "A3", status: "รอเสิร์ฟ", tone: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300" },
  { id: "B1", status: "เปิดบิล", tone: "border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300" },
  { id: "B2", status: "รอชำระ", tone: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/25 dark:text-orange-300" },
  { id: "C1", status: "ครัวกำลังทำ", tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300" },
];

const KITCHEN_TICKETS = [
  { table: "A2", item: "กะเพราหมูสับ + ไข่ดาว", state: "กำลังทำ", dot: "bg-amber-500" },
  { table: "A3", item: "ต้มยำกุ้ง, ข้าวเปล่า", state: "พร้อมเสิร์ฟ", dot: "bg-emerald-500" },
  { table: "C1", item: "ผัดไทย, ชาไทยเย็น", state: "คิวใหม่", dot: "bg-sky-500" },
];

const ACTIVITY = [
  "โต๊ะ A3 พร้อมเสิร์ฟ 2 รายการ",
  "โต๊ะ B2 ขอปิดบิล",
  "เพิ่มเมนูให้โต๊ะ A2 แล้ว",
  "ครัวรับออเดอร์ C1 แล้ว",
];

const FLOW_ITEMS: FlowItem[] = [
  {
    label: "01",
    title: "เปิดโต๊ะ",
    desc: "เลือกโซนและโต๊ะจากหน้าร้าน เริ่มออเดอร์โดยไม่ต้องจดแยก",
    icon: Table2,
  },
  {
    label: "02",
    title: "รับออเดอร์",
    desc: "เพิ่มเมนู ตัวเลือก และจำนวนจาก POS แล้วส่งเข้าครัวทันที",
    icon: ShoppingCart,
  },
  {
    label: "03",
    title: "ครัวจัดคิว",
    desc: "KDS แยกคิวใหม่ กำลังทำ และพร้อมเสิร์ฟให้ทีมเห็นตรงกัน",
    icon: ChefHat,
  },
  {
    label: "04",
    title: "ปิดบิล",
    desc: "ตรวจรายการ รับเงินสดหรือ PromptPay แล้วคืนโต๊ะเข้าสู่รอบถัดไป",
    icon: ReceiptText,
  },
];

const SURFACES: SurfaceItem[] = [
  {
    eyebrow: "Floor + POS",
    title: "หน้าร้านเห็นโต๊ะและรายการสั่งในจอเดียว",
    desc: "เหมาะกับช่วงที่พนักงานต้องรับออเดอร์หลายโต๊ะพร้อมกันและไม่อยากหลุดรายการเสริม",
    points: ["สถานะโต๊ะ", "เมนูพร้อมตัวเลือก", "รายการรอบนี้"],
    icon: ShoppingCart,
  },
  {
    eyebrow: "Kitchen",
    title: "ครัวรู้ว่าควรทำอะไรก่อน",
    desc: "คิวอาหารไม่หายไปกับกระดาษหรือแชต ทีมหน้าร้านเห็นอาหารพร้อมเสิร์ฟจากสถานะเดียวกัน",
    points: ["คิวใหม่", "กำลังทำ", "พร้อมเสิร์ฟ"],
    icon: ChefHat,
  },
  {
    eyebrow: "Bill + Ops",
    title: "ผู้จัดการปิดรอบและมองกะร้านได้ทันที",
    desc: "บิล การชำระเงิน สถานะโต๊ะ และสัญญาณคิวครัวถูกดึงกลับมาเป็นภาพรวมร้าน",
    points: ["เงินสด", "PromptPay", "ภาพรวมกะร้าน"],
    icon: BarChart3,
  },
];

const ROLE_ITEMS: RoleItem[] = [
  {
    role: "Owner",
    title: "เห็นภาพร้านโดยไม่ต้องถามทุกแผนก",
    desc: "ดูโต๊ะที่ติดคิว อาหารที่พร้อมเสิร์ฟ และบิลที่รอชำระจากภาพรวมเดียว",
    icon: BarChart3,
  },
  {
    role: "Waiter",
    title: "รับออเดอร์แล้วรู้ทันทีว่าครัวถึงไหน",
    desc: "ลดการเดินถามครัวซ้ำ และช่วยให้เสิร์ฟอาหารได้ตรงจังหวะมากขึ้น",
    icon: UsersRound,
  },
  {
    role: "Kitchen",
    title: "จัดลำดับคิวจาก ticket ที่อ่านง่าย",
    desc: "แยกคิวใหม่ กำลังทำ และพร้อมเสิร์ฟโดยไม่ต้องไล่กระดาษย้อนหลัง",
    icon: ChefHat,
  },
  {
    role: "Cashier",
    title: "ตรวจบิลและรับชำระจากข้อมูลเดียวกับ POS",
    desc: "ลดการคีย์ซ้ำตอนปิดบิล และคืนสถานะโต๊ะให้รอบถัดไปได้เร็วขึ้น",
    icon: CreditCard,
  },
];

const READY_FEATURES = [
  "Restaurant onboarding",
  "Staff invitations",
  "Menu and option groups",
  "Table zones",
  "POS order taking",
  "Kitchen display",
  "Bill and payment MVP",
  "Live operations overview",
];

const metricToneClass: Record<ShiftMetric["tone"], string> = {
  neutral: "text-gray-950 dark:text-white",
  orange: "text-orange-600 dark:text-orange-400",
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  sky: "text-sky-600 dark:text-sky-400",
};

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "สลับเป็น Light mode" : "สลับเป็น Dark mode"}
      title={theme === "dark" ? "สลับเป็น Light mode" : "สลับเป็น Dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        obs.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-500 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gray-900 px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
    >
      {children}
      <ArrowRight className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

function SectionHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight text-gray-950 sm:text-4xl dark:text-white">{title}</h2>
      <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">{desc}</p>
    </div>
  );
}

function CommandCenterMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-x-2 bottom-2 top-7 border border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/10" />
      <div className="relative overflow-hidden rounded-md border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.13)] dark:border-gray-800 dark:bg-gray-950 dark:shadow-black/45">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-slate-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <AppLogo size={28} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Command center</p>
              <p className="text-sm font-semibold text-gray-950 dark:text-white">กะเย็นวันนี้</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="font-mono">18:42</span>
            <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              เปิดให้บริการ
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="hidden border-b border-gray-100 p-4 dark:border-gray-800 sm:block lg:border-b-0 lg:border-r">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Shift focus</p>
            <h3 className="mt-3 text-xl font-semibold leading-tight text-gray-950 dark:text-white">
              โต๊ะ คิวครัว และบิลอยู่ในภาพเดียว
            </h3>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
              ใช้สำหรับช่วงที่ร้านต้องตัดสินใจเร็ว ไม่ใช่แค่ดูรายงานหลังปิดร้าน
            </p>

            <div className="mt-5 space-y-2">
              {["หน้าร้านรับออเดอร์", "ครัวอัปเดตสถานะ", "แคชเชียร์ปิดบิล"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-[12px] text-gray-600 dark:text-gray-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400" strokeWidth={1.8} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 border-b border-gray-100 p-4 dark:border-gray-800 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {SHIFT_METRICS.map((metric) => (
                <div key={metric.label} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">{metric.label}</p>
                  <p className={`mt-2 text-2xl font-semibold leading-none tabular-nums ${metricToneClass[metric.tone]}`}>
                    {metric.value}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">{metric.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_0.9fr]">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">Floor map</p>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">โซน A-C</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TABLES.map((table) => (
                    <div key={table.id} className={`rounded-md border p-3 ${table.tone}`}>
                      <p className="text-base font-semibold">{table.id}</p>
                      <p className="mt-1 text-[11px] font-medium">{table.status}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">Activity</p>
                  <span className="text-[11px] text-orange-600 dark:text-orange-400">live</span>
                </div>
                <div className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                  {ACTIVITY.map((item, index) => (
                    <div key={item} className="flex gap-3 px-3 py-2.5">
                      <span className="mt-1 font-mono text-[10px] text-gray-400">0{index + 1}</span>
                      <p className="text-[12px] leading-5 text-gray-600 dark:text-gray-300">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-950 dark:text-white">Kitchen queue</p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">อัปเดตจาก POS</span>
            </div>
            <div className="mt-3 space-y-2">
              {KITCHEN_TICKETS.map((ticket) => (
                <div key={`${ticket.table}-${ticket.item}`} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ticket.dot}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-xs font-semibold text-gray-950 dark:text-white">โต๊ะ {ticket.table}</p>
                        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{ticket.state}</span>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-gray-500 dark:text-gray-400">{ticket.item}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-900/60 dark:bg-orange-950/20">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-orange-600 dark:text-orange-400" strokeWidth={1.8} />
                <p className="text-xs font-semibold text-gray-950 dark:text-white">โต๊ะ B2 รอชำระ</p>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-gray-600 dark:text-gray-400">
                ตรวจรายการ รับชำระ และคืนสถานะโต๊ะจาก flow เดียว
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SurfaceCard({ surface }: { surface: SurfaceItem }) {
  const Icon = surface.icon;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">
            {surface.eyebrow}
          </p>
          <h3 className="mt-3 text-xl font-semibold leading-snug text-gray-950 dark:text-white">{surface.title}</h3>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-slate-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <Icon className="h-5 w-5" strokeWidth={1.7} />
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-400">{surface.desc}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {surface.points.map((point) => (
          <span
            key={point}
            className="rounded border border-gray-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
          >
            {point}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { openLoginModal, user, loading } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/restaurants");
    }
  }, [loading, router, user]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(y > 12);
      setProgress(h > 0 ? (y / h) * 100 : 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (loading || user) {
    return <div className="min-h-[100dvh] bg-white dark:bg-gray-950" />;
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div
        className="fixed left-0 top-0 z-[60] h-0.5 bg-orange-500 transition-[width] duration-75"
        style={{ width: `${progress}%` }}
      />

      <header
        className={`fixed inset-x-0 top-0 z-50 h-16 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${
          scrolled
            ? "border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/90"
            : "border-transparent bg-white/80 backdrop-blur-sm dark:bg-gray-950/80"
        }`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <AppLogo size={34} priority />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Restaurant</p>
              <p className="text-sm font-semibold leading-none text-gray-950 dark:text-white">HUB</p>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-400 md:flex">
            <a href="#workflow" className="transition-colors hover:text-gray-950 dark:hover:text-white">
              Workflow
            </a>
            <a href="#surfaces" className="transition-colors hover:text-gray-950 dark:hover:text-white">
              Product
            </a>
            <a href="#roles" className="transition-colors hover:text-gray-950 dark:hover:text-white">
              Roles
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => openLoginModal()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-gray-900 px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
            >
              เข้าสู่ระบบ
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-gray-100 bg-white pt-24 dark:border-gray-800 dark:bg-gray-950 sm:pt-28">
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)]" />

          <div className="relative mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
              <div>
                <Reveal>
                  <p className="inline-flex rounded border border-orange-200 bg-orange-50 px-3 py-1.5 text-[11px] font-semibold text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/25 dark:text-orange-300">
                    Live operations for Thai restaurants
                  </p>
                </Reveal>

                <Reveal delay={80}>
                  <h1 className="mt-6 max-w-3xl text-[40px] font-semibold leading-[1.05] text-gray-950 sm:text-5xl lg:text-6xl dark:text-white">
                    คุมหน้าร้าน ครัว และบิลจากจอเดียว
                  </h1>
                </Reveal>
              </div>

              <Reveal delay={140}>
                <div className="max-w-2xl lg:ml-auto">
                  <p className="text-base leading-8 text-gray-600 sm:text-lg dark:text-gray-400">
                    Restaurant Hub รวมข้อมูลที่เกิดขึ้นระหว่างกะร้านให้ทีมเห็นตรงกัน:
                    โต๊ะไหนกำลังทาน ออเดอร์ไหนอยู่ครัว อาหารไหนพร้อมเสิร์ฟ และบิลไหนรอชำระ
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <PrimaryButton onClick={() => openLoginModal()}>เริ่มตั้งค่าร้าน</PrimaryButton>
                    <a
                      href="#workflow"
                      className="inline-flex h-11 items-center justify-center rounded-md border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-gray-600"
                    >
                      ดู flow การทำงาน
                    </a>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal delay={220} className="mt-8">
              <CommandCenterMockup />
            </Reveal>
          </div>
        </section>

        <section id="workflow" className="border-b border-gray-100 bg-slate-50 py-20 dark:border-gray-800 dark:bg-gray-900/35">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeader
                eyebrow="One Shift"
                title="เริ่มจากสิ่งที่เกิดในร้านตอนกำลังยุ่ง"
                desc="หน้าใหม่นี้ขายระบบผ่านลำดับงานจริง ไม่ใช่คำกว้าง ๆ แบบ software สำหรับธุรกิจทุกประเภท"
              />
            </Reveal>

            <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {FLOW_ITEMS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.title} delay={index * 80}>
                    <div className="h-full rounded-md border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-gray-400">{item.label}</span>
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-slate-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                        </span>
                      </div>
                      <h3 className="mt-6 text-lg font-semibold text-gray-950 dark:text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.desc}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section id="surfaces" className="border-b border-gray-100 bg-white py-20 dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <Reveal>
                <SectionHeader
                  eyebrow="Product Surfaces"
                  title="แต่ละจอมีหน้าที่ชัด ไม่แย่งกันเป็น dashboard"
                  desc="Landing direction นี้วาง product เป็นระบบปฏิบัติงาน: POS สำหรับหน้าร้าน, KDS สำหรับครัว, bill/payment สำหรับแคชเชียร์ และ overview สำหรับเจ้าของร้าน"
                />
              </Reveal>

              <div className="grid gap-3">
                {SURFACES.map((surface, index) => (
                  <Reveal key={surface.eyebrow} delay={index * 90}>
                    <SurfaceCard surface={surface} />
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="roles" className="border-b border-gray-100 bg-slate-50 py-20 dark:border-gray-800 dark:bg-gray-900/35">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeader
                eyebrow="By Role"
                title="คนละบทบาท คนละจังหวะ แต่ใช้ข้อมูลเดียวกัน"
                desc="พนักงานไม่ควรต้องแปลข้อมูลข้ามกระดาษ แชต และหน้าจอหลายชุด ระบบจึงแยกหน้างานให้เหมาะกับบทบาท แต่ยังผูกสถานะกลับมาที่กะร้านเดียวกัน"
              />
            </Reveal>

            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {ROLE_ITEMS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.role} delay={index * 80}>
                    <div className="h-full rounded-md border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
                      <div className="flex items-start gap-4">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-slate-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">
                            {item.role}
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">{item.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-gray-100 bg-white py-20 dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:px-8">
            <Reveal>
              <SectionHeader
                eyebrow="MVP Scope"
                title="เล่าเฉพาะสิ่งที่ระบบมีให้ลองจริง"
                desc="ตัดตัวเลขพิสูจน์ไม่ได้และคำโฆษณาทั่วไปออก แล้วใช้ capability ที่มีในโปรเจกต์เป็นฐานของ landing"
              />
            </Reveal>

            <div className="grid gap-2 sm:grid-cols-2">
              {READY_FEATURES.map((feature, index) => (
                <Reveal key={feature} delay={index * 40}>
                  <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                    <div className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" strokeWidth={1.8} />
                      <p className="text-sm font-medium leading-6 text-gray-700 dark:text-gray-300">{feature}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gray-950 py-20 text-white dark:bg-black">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">Start The Shift</p>
                  <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
                    เปิดร้านด้วยระบบที่เห็นจังหวะงานจริง
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
                    เข้าสู่ระบบเพื่อสร้างร้าน ตั้งค่าโต๊ะ เมนู และเชิญทีมให้ทดลอง flow หน้าร้าน-ครัว-ปิดบิล
                  </p>
                </div>
                <PrimaryButton onClick={() => openLoginModal()}>เข้าสู่ระบบ</PrimaryButton>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 bg-white py-8 dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <AppLogo size={28} />
            <span className="font-semibold text-gray-900 dark:text-white">Restaurant Hub</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span>Pre-capstone restaurant operations system</span>
            <span className="hidden text-gray-300 dark:text-gray-700 sm:inline">/</span>
            <span>Built for Thai restaurant workflows</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
