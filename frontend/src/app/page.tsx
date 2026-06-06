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
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type ShiftMetric = {
  label: string;
  value: string;
  note: string;
  tone: "neutral" | "orange" | "amber" | "emerald" | "sky";
};

type FlowItem = {
  title: string;
  desc: string;
  icon: LucideIcon;
};

type SurfaceItem = {
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

type HeroProof = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

const HERO_IMAGE_URL = "https://images.unsplash.com/photo-1750950388492-f803d12c4a8a?auto=format&fit=crop&w=2200&q=80";

function safeNextPathFromSearch(search: string) {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

const HERO_PROOFS: HeroProof[] = [
  {
    label: "หน้าร้าน",
    value: "เปิดโต๊ะแล้วส่งเข้าครัว",
    detail: "ลดการจดซ้ำตอนรับออเดอร์หลายโต๊ะ",
    icon: Table2,
  },
  {
    label: "ครัว",
    value: "เห็นคิวใหม่และพร้อมเสิร์ฟ",
    detail: "อัปเดตสถานะให้หน้าร้านรู้พร้อมกัน",
    icon: ChefHat,
  },
  {
    label: "แคชเชียร์",
    value: "ตรวจบิลจากข้อมูลเดียวกับ POS",
    detail: "รับเงินสดหรือ PromptPay แล้วคืนโต๊ะ",
    icon: CreditCard,
  },
];

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
    title: "เปิดโต๊ะ",
    desc: "เลือกโซนและโต๊ะจากหน้าร้าน เริ่มออเดอร์โดยไม่ต้องจดแยก",
    icon: Table2,
  },
  {
    title: "รับออเดอร์",
    desc: "เพิ่มเมนู ตัวเลือก และจำนวนจาก POS แล้วส่งเข้าครัวทันที",
    icon: ShoppingCart,
  },
  {
    title: "ครัวจัดคิว",
    desc: "KDS แยกคิวใหม่ กำลังทำ และพร้อมเสิร์ฟให้ทีมเห็นตรงกัน",
    icon: ChefHat,
  },
  {
    title: "ปิดบิล",
    desc: "ตรวจรายการ รับเงินสดหรือ PromptPay แล้วคืนโต๊ะเข้าสู่รอบถัดไป",
    icon: ReceiptText,
  },
];

const SURFACES: SurfaceItem[] = [
  {
    title: "หน้าร้านเห็นโต๊ะและรายการสั่งในจอเดียว",
    desc: "เหมาะกับช่วงที่พนักงานต้องรับออเดอร์หลายโต๊ะพร้อมกันและไม่อยากหลุดรายการเสริม",
    points: ["สถานะโต๊ะ", "เมนูพร้อมตัวเลือก", "รายการรอบนี้"],
    icon: ShoppingCart,
  },
  {
    title: "ครัวรู้ว่าควรทำอะไรก่อน",
    desc: "คิวอาหารไม่หายไปกับกระดาษหรือแชต ทีมหน้าร้านเห็นอาหารพร้อมเสิร์ฟจากสถานะเดียวกัน",
    points: ["คิวใหม่", "กำลังทำ", "พร้อมเสิร์ฟ"],
    icon: ChefHat,
  },
  {
    title: "ผู้จัดการปิดรอบและมองกะร้านได้ทันที",
    desc: "บิล การชำระเงิน สถานะโต๊ะ และสัญญาณคิวครัวถูกดึงกลับมาเป็นภาพรวมร้าน",
    points: ["เงินสด", "PromptPay", "ภาพรวมกะร้าน"],
    icon: BarChart3,
  },
];

const ROLE_ITEMS: RoleItem[] = [
  {
    role: "เจ้าของร้าน",
    title: "เห็นภาพร้านโดยไม่ต้องถามทุกแผนก",
    desc: "ดูโต๊ะที่ติดคิว อาหารที่พร้อมเสิร์ฟ และบิลที่รอชำระจากภาพรวมเดียว",
    icon: BarChart3,
  },
  {
    role: "พนักงานหน้าร้าน",
    title: "รับออเดอร์แล้วรู้ทันทีว่าครัวถึงไหน",
    desc: "ลดการเดินถามครัวซ้ำ และช่วยให้เสิร์ฟอาหารได้ตรงจังหวะมากขึ้น",
    icon: UsersRound,
  },
  {
    role: "ครัว",
    title: "จัดลำดับคิวจาก ticket ที่อ่านง่าย",
    desc: "แยกคิวใหม่ กำลังทำ และพร้อมเสิร์ฟโดยไม่ต้องไล่กระดาษย้อนหลัง",
    icon: ChefHat,
  },
  {
    role: "แคชเชียร์",
    title: "ตรวจบิลและรับชำระจากข้อมูลเดียวกับ POS",
    desc: "ลดการคีย์ซ้ำตอนปิดบิล และคืนสถานะโต๊ะให้รอบถัดไปได้เร็วขึ้น",
    icon: CreditCard,
  },
];

const READY_FEATURES = [
  "สร้างร้านและเลือกร้านที่ใช้งาน",
  "เชิญพนักงานเข้าทีม",
  "จัดการเมนู รูปภาพ และตัวเลือก",
  "จัดโซนและโต๊ะ",
  "รับออเดอร์ผ่าน POS",
  "คิวครัวสำหรับ KDS",
  "บิล เงินสด และ PromptPay MVP",
  "ภาพรวมกะร้านแบบ polling",
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
      className="landing-lift inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${className}`}
    >
      {children}
    </div>
  );
}

function HeroReveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div style={{ animationDelay: `${delay}ms` }} className={`landing-hero-reveal ${className}`}>
      {children}
    </div>
  );
}

function LandingMotionStyles() {
  return (
    <style>{`
      :root {
        --landing-ease: cubic-bezier(0.22, 1, 0.36, 1);
        --landing-ease-soft: cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes landingHeroPhoto {
        from {
          transform: scale(1.035);
          filter: saturate(0.92) contrast(0.96);
        }
        to {
          transform: scale(1);
          filter: saturate(1) contrast(1);
        }
      }

      @keyframes landingHeroReveal {
        from {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
        }
      }

      @keyframes landingProofReveal {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes landingLivePulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
        }
        45% {
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.14);
        }
      }

      .landing-hero-photo {
        animation: landingHeroPhoto 820ms var(--landing-ease-soft) both;
        transform-origin: 62% 44%;
      }

      .landing-hero-reveal {
        opacity: 0;
        animation: landingHeroReveal 560ms var(--landing-ease) both;
      }

      .landing-proof-card {
        opacity: 0;
        animation: landingProofReveal 440ms var(--landing-ease) both;
      }

      .landing-live-chip {
        animation: landingLivePulse 1800ms var(--landing-ease) infinite;
      }

      .landing-lift {
        transition:
          transform 180ms var(--landing-ease),
          border-color 180ms var(--landing-ease),
          background-color 180ms var(--landing-ease),
          box-shadow 180ms var(--landing-ease);
      }

      .landing-lift:hover {
        transform: translateY(-2px);
      }

      .landing-lift:active {
        transform: translateY(0);
      }

      @media (prefers-reduced-motion: reduce) {
        .landing-hero-photo,
        .landing-hero-reveal,
        .landing-proof-card,
        .landing-live-chip {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
          filter: none !important;
        }

        .landing-lift {
          transition: none !important;
        }

        .landing-lift:hover,
        .landing-lift:active {
          transform: none !important;
        }

        .ui-press:active {
          transform: none !important;
        }
      }
    `}</style>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-press landing-lift inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gray-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
    >
      {children}
      <ArrowRight className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-3xl font-semibold leading-tight text-gray-950 sm:text-4xl dark:text-white">{title}</h2>
      <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">{desc}</p>
    </div>
  );
}

function HeroImage() {
  return (
    <Image
      src={HERO_IMAGE_URL}
      alt="ทีมครัวกำลังทำอาหารระหว่างกะเย็นในร้านอาหาร"
      fill
      priority
      unoptimized
      sizes="100vw"
      className="landing-hero-photo object-cover"
    />
  );
}

function HeroProofStrip() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {HERO_PROOFS.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            style={{ animationDelay: `${260 + index * 70}ms` }}
            className="landing-proof-card rounded-md border border-white/18 bg-gray-950/78 p-2.5 text-white sm:p-3"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-950 sm:h-9 sm:w-9">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-[12px] font-semibold text-orange-200">{item.label}</p>
                <p className="mt-1 text-sm font-semibold leading-5">{item.value}</p>
                <p className="mt-1 hidden text-[12px] leading-5 text-white/72 sm:block">{item.detail}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommandCenterMockup() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-slate-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <AppLogo size={28} />
            <div>
              <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">ภาพรวมกะร้าน</p>
              <p className="text-sm font-semibold text-gray-950 dark:text-white">กะเย็นวันนี้</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="font-mono">18:42</span>
            <span className="landing-live-chip rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              เปิดให้บริการ
            </span>
          </div>
        </div>

        <div className="grid">
          <aside className="border-b border-gray-100 p-4 dark:border-gray-800">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">สิ่งที่ต้องเห็นในกะนี้</p>
                <h3 className="mt-2 text-xl font-semibold leading-tight text-gray-950 dark:text-white">
                  โต๊ะ คิวครัว และบิลอยู่ในภาพเดียว
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  ใช้สำหรับช่วงที่ร้านต้องตัดสินใจเร็ว ไม่ใช่แค่ดูรายงานหลังปิดร้าน
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {["หน้าร้านรับออเดอร์", "ครัวอัปเดตสถานะ", "แคชเชียร์ปิดบิล"].map((item) => (
                  <div
                    key={item}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400" strokeWidth={1.8} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SHIFT_METRICS.map((metric) => (
                  <div key={metric.label} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                    <p className="truncate text-[12px] font-medium text-gray-500 dark:text-gray-400">{metric.label}</p>
                    <p className={`mt-2 text-2xl font-semibold leading-none tabular-nums ${metricToneClass[metric.tone]}`}>
                      {metric.value}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">{metric.note}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4">
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

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">Activity</p>
                  <span className="landing-live-chip rounded px-1.5 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">live</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ACTIVITY.map((item, index) => (
                    <div
                      key={item}
                      className="flex min-w-0 gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <span className="mt-1 font-mono text-[10px] text-gray-400">0{index + 1}</span>
                      <p className="text-[12px] leading-5 text-gray-600 dark:text-gray-300">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside>
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
    </div>
  );
}

function SurfaceCard({ surface }: { surface: SurfaceItem }) {
  const Icon = surface.icon;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold leading-snug text-gray-950 dark:text-white">{surface.title}</h3>
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
  const { closeLoginModal, openLoginModal, user, loading } = useAuth();
  const didRequestAuthOnLanding = useRef(false);
  const authRedirectToRef = useRef<string | undefined>(undefined);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  const readAuthRedirectTo = useCallback(() => {
    authRedirectToRef.current = safeNextPathFromSearch(window.location.search);
    return authRedirectToRef.current;
  }, []);

  useEffect(() => {
    if (didRequestAuthOnLanding.current || user) return;
    if (readAuthRedirectTo()) return;
    closeLoginModal();
  }, [closeLoginModal, loading, readAuthRedirectTo, user]);

  useEffect(() => {
    if (!loading && user) {
      router.replace(readAuthRedirectTo() ?? "/restaurants");
    }
  }, [loading, readAuthRedirectTo, router, user]);

  useEffect(() => {
    if (loading || user || didRequestAuthOnLanding.current) return;
    const authRedirectTo = readAuthRedirectTo();
    if (!authRedirectTo) return;
    didRequestAuthOnLanding.current = true;
    const timer = window.setTimeout(() => openLoginModal(authRedirectTo), 0);
    return () => window.clearTimeout(timer);
  }, [loading, openLoginModal, readAuthRedirectTo, user]);

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

  const headerOnImage = !scrolled;
  const openLandingLoginModal = () => {
    didRequestAuthOnLanding.current = true;
    openLoginModal(readAuthRedirectTo());
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <LandingMotionStyles />
      <div
        className="fixed left-0 top-0 z-[60] h-0.5 w-full origin-left bg-orange-500 transition-transform duration-75 motion-reduce:transition-none"
        style={{ transform: `scaleX(${Math.min(progress, 100) / 100})` }}
      />

      <header
        className={`fixed inset-x-0 top-0 z-50 h-16 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ${
          scrolled
            ? "border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/90"
            : "border-white/15 bg-gray-950/44 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <AppLogo size={34} priority />
            <div>
              <p className={`text-[10px] font-semibold tracking-[0.14em] ${headerOnImage ? "text-white/62" : "text-gray-400"}`}>
                Restaurant
              </p>
              <p className={`text-sm font-semibold leading-none ${headerOnImage ? "text-white" : "text-gray-950 dark:text-white"}`}>
                HUB
              </p>
            </div>
          </div>

          <nav className={`hidden items-center gap-6 text-sm font-medium md:flex ${headerOnImage ? "text-white/78" : "text-gray-600 dark:text-gray-400"}`}>
            <a href="#proof" className={`transition-colors ${headerOnImage ? "hover:text-white" : "hover:text-gray-950 dark:hover:text-white"}`}>
              ภาพรวม
            </a>
            <a href="#workflow" className={`transition-colors ${headerOnImage ? "hover:text-white" : "hover:text-gray-950 dark:hover:text-white"}`}>
              กะร้าน
            </a>
            <a href="#roles" className={`transition-colors ${headerOnImage ? "hover:text-white" : "hover:text-gray-950 dark:hover:text-white"}`}>
              ทีม
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={openLandingLoginModal}
              className={`ui-press landing-lift inline-flex h-9 items-center justify-center rounded-md px-3.5 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${
                headerOnImage
                  ? "bg-white text-gray-950 hover:bg-gray-100"
                  : "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              }`}
            >
              เข้าสู่ระบบ
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative min-h-[calc(100dvh-112px)] overflow-hidden bg-gray-950 text-white">
          <HeroImage />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,7,18,0.92)_0%,rgba(3,7,18,0.72)_44%,rgba(3,7,18,0.22)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-gray-950 to-transparent" />

          <div className="relative mx-auto flex min-h-[calc(100dvh-112px)] max-w-7xl flex-col justify-end px-4 pb-6 pt-20 sm:min-h-[calc(100dvh-88px)] sm:px-6 sm:pb-7 sm:pt-28 lg:px-8">
            <HeroReveal>
              <p className="inline-flex rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-950">
                ระบบจัดการร้านอาหารสำหรับกะที่กำลังเดินอยู่
              </p>
            </HeroReveal>

            <HeroReveal delay={80}>
              <h1 className="mt-5 max-w-4xl text-[34px] font-semibold leading-[1.08] text-white [text-wrap:balance] sm:text-5xl lg:text-6xl">
                เห็นโต๊ะ ครัว และบิลทันก่อนร้านสะดุด
              </h1>
            </HeroReveal>

            <HeroReveal delay={120}>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg sm:leading-8">
                Restaurant Hub รวมงานหน้าร้าน POS คิวครัว บิล และภาพรวมกะร้านไว้ในระบบเดียว
                เพื่อให้ทีมรู้ว่าโต๊ะไหนต้องรับออเดอร์ อาหารไหนพร้อมเสิร์ฟ และบิลไหนต้องปิดก่อน
              </p>
            </HeroReveal>

            <HeroReveal delay={160}>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton onClick={openLandingLoginModal}>เริ่มตั้งค่าร้าน</PrimaryButton>
                <a
                  href="#proof"
                  className="ui-press landing-lift inline-flex h-11 items-center justify-center rounded-md border border-white/24 bg-gray-950/72 px-5 text-sm font-semibold text-white transition-colors hover:bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                >
                  ดูหน้าระบบที่มีแล้ว
                </a>
              </div>
            </HeroReveal>

            <HeroReveal delay={220} className="mt-6 max-w-5xl sm:mt-7">
              <HeroProofStrip />
            </HeroReveal>
          </div>
        </section>

        <section id="proof" className="border-b border-gray-100 bg-white py-12 dark:border-gray-800 dark:bg-gray-950 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.42fr_0.58fr] lg:items-start lg:px-8">
            <Reveal>
              <SectionHeader
                title="หลักฐานอยู่ที่หน้ากะ ไม่ใช่คำโฆษณา"
                desc="เจ้าของร้านควรเห็นสถานะจริงได้ทันทีหลังเปิดระบบ: โต๊ะที่ใช้งาน คิวครัว อาหารพร้อมเสิร์ฟ และบิลที่รอชำระ"
              />
              <div className="mt-6 grid gap-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                {["ข้อมูลใน mockup ใช้สถานะที่ระบบมีอยู่ในโปรเจกต์", "สีเขียว เหลือง ฟ้า และส้มใช้กับสถานะงานจริงเท่านั้น", "CTA หลักมีหนึ่งทาง: เข้าระบบเพื่อเริ่มตั้งค่าร้าน"].map((item) => (
                  <div key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" strokeWidth={1.8} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={120}>
              <CommandCenterMockup />
            </Reveal>
          </div>
        </section>

        <section id="workflow" className="border-b border-gray-100 bg-slate-50 py-20 dark:border-gray-800 dark:bg-gray-900/35">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeader
                title="กะหนึ่งกะไหลผ่านระบบแบบนี้"
                desc="หน้า landing ควรเล่าให้เห็นลำดับงานที่เกิดขึ้นจริง ตั้งแต่เปิดโต๊ะ รับออเดอร์ ครัวจัดคิว ไปจนถึงปิดบิล"
              />
            </Reveal>

            <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {FLOW_ITEMS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.title} delay={index * 80}>
                    <div className="h-full rounded-md border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-slate-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                          <Icon className="h-5 w-5" strokeWidth={1.7} />
                        </span>
                        <h3 className="text-lg font-semibold text-gray-950 dark:text-white">{item.title}</h3>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.desc}</p>
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
                  title="แต่ละจอมีหน้าที่ชัด ไม่แย่งกันเป็น dashboard"
                  desc="POS สำหรับหน้าร้าน KDS สำหรับครัว bill/payment สำหรับแคชเชียร์ และ overview สำหรับเจ้าของร้าน ทุกจออ่านสถานะจากกะเดียวกัน"
                />
              </Reveal>

              <div className="grid gap-3">
                {SURFACES.map((surface, index) => (
                  <Reveal key={surface.title} delay={index * 90}>
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
                          <p className="text-[13px] font-semibold text-orange-600 dark:text-orange-400">
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
                title="เล่าเฉพาะสิ่งที่ระบบมีให้ลองจริง"
                desc="หน้า landing นี้ไม่พึ่งตัวเลขพิสูจน์ไม่ได้ ใช้ความสามารถที่มีในโปรเจกต์เป็น proof ว่าระบบพร้อมรองรับ workflow ร้านอาหารพื้นฐาน"
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
                  <p className="text-sm font-semibold text-orange-300">พร้อมเริ่มกะถัดไป</p>
                  <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
                    เปิดร้านด้วยระบบที่เห็นจังหวะงานจริง
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
                    เข้าสู่ระบบเพื่อสร้างร้าน ตั้งค่าโต๊ะ เมนู และเชิญทีมให้ทดลอง flow หน้าร้าน-ครัว-ปิดบิล
                  </p>
                </div>
                <PrimaryButton onClick={openLandingLoginModal}>เข้าสู่ระบบ</PrimaryButton>
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
