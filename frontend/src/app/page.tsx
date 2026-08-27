"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import { Pagination } from "swiper/modules";
import "swiper/css/pagination";

import { Fragment } from "react";
import AppLogo from "@/src/components/shared/AppLogo";
import AppWordmark from "@/src/components/shared/AppWordmark";
import LanguageToggle from "@/src/components/shared/LanguageToggle";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChefHat,
  Download,
  Settings,
  CreditCard,
  Moon,
  ReceiptText,
  ShoppingCart,
  Sun,
  Store,
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

type RoleItem = {
  role: string;
  title: string;
  desc: string;
  icon: LucideIcon;
};

type HeroProof = {
  label: string;
  icon: LucideIcon;
};

const HERO_IMAGE_URL = "https://images.unsplash.com/photo-1750950388492-f803d12c4a8a?auto=format&fit=crop&w=2200&q=80";

function safeNextPathFromSearch(search: string) {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

const HERO_PROOFS: Record<Language, HeroProof[]> = {
  th: [
    { label: "ใช้ได้ทั้งมือถือ แท็บเล็ต และ PC", icon: Download },
    { label: "รองรับร้านได้หลายสาขา", icon: Settings },
    { label: "มีแดชบอร์ดสำหรับเจ้าของร้าน", icon: Store },
  ],
  en: [
    { label: "Works on mobile, tablet, and PC", icon: Download },
    { label: "Manage multiple branches", icon: Settings },
    { label: "Owner dashboard included", icon: Store },
  ],
};

const SHIFT_METRICS: Record<Language, ShiftMetric[]> = {
  th: [
    { label: "โต๊ะใช้งาน", value: "6", note: "จาก 12 โต๊ะ", tone: "amber" },
    { label: "คิวครัว", value: "4", note: "2 รายการใกล้พร้อม", tone: "orange" },
    { label: "ครัวทำเสร็จ", value: "2", note: "รอปิดโต๊ะ", tone: "emerald" },
    { label: "รอชำระ", value: "1", note: "โต๊ะ B2", tone: "sky" },
  ],
  en: [
    { label: "Active tables", value: "6", note: "of 12 tables", tone: "amber" },
    { label: "Kitchen queue", value: "4", note: "2 nearly ready", tone: "orange" },
    { label: "Kitchen completed", value: "2", note: "Awaiting checkout", tone: "emerald" },
    { label: "Awaiting payment", value: "1", note: "Table B2", tone: "sky" },
  ],
};

const TABLE_TONES = [
  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
  "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300",
  "border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
  "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/25 dark:text-orange-300",
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
];

const TABLES: Record<Language, Array<{ id: string; status: string; tone: string }>> = {
  th: ["ว่าง", "กำลังทาน", "ครัวทำเสร็จ", "เปิดบิล", "รอชำระ", "ครัวกำลังทำ"].map((status, index) => ({ id: ["A1", "A2", "A3", "B1", "B2", "C1"][index], status, tone: TABLE_TONES[index] })),
  en: ["Free", "Dining", "Kitchen completed", "Bill opened", "Awaiting payment", "Kitchen cooking"].map((status, index) => ({ id: ["A1", "A2", "A3", "B1", "B2", "C1"][index], status, tone: TABLE_TONES[index] })),
};

const KITCHEN_TICKETS: Record<Language, Array<{ table: string; item: string; state: string; dot: string }>> = {
  th: [
    { table: "A2", item: "กะเพราหมูสับ + ไข่ดาว", state: "กำลังทำ", dot: "bg-amber-500" },
    { table: "A3", item: "ต้มยำกุ้ง, ข้าวเปล่า", state: "เสร็จแล้ว", dot: "bg-emerald-500" },
    { table: "C1", item: "ผัดไทย, ชาไทยเย็น", state: "คิวใหม่", dot: "bg-sky-500" },
  ],
  en: [
    { table: "A2", item: "Minced pork basil + fried egg", state: "Cooking", dot: "bg-amber-500" },
    { table: "A3", item: "Tom yum goong, steamed rice", state: "Done", dot: "bg-emerald-500" },
    { table: "C1", item: "Pad Thai, Thai iced tea", state: "New ticket", dot: "bg-sky-500" },
  ],
};

const ACTIVITY: Record<Language, string[]> = {
  th: ["ครัวทำรายการโต๊ะ A3 เสร็จแล้ว 2 รายการ", "โต๊ะ B2 ขอปิดบิล", "เพิ่มเมนูให้โต๊ะ A2 แล้ว", "ครัวรับออเดอร์ C1 แล้ว"],
  en: ["Kitchen completed 2 items for table A3", "Table B2 requested the bill", "Items added to table A2", "Kitchen accepted order C1"],
};

const FLOW_ITEMS: Record<Language, FlowItem[]> = {
  th: [
    { title: "เปิดโต๊ะ", desc: "เลือกโซนและโต๊ะจากหน้าร้าน แล้วเริ่มออเดอร์โดยไม่ต้องจดแยก", icon: Table2 },
    { title: "รับออเดอร์", desc: "เลือกเมนูและจำนวน ตรวจรายการ แล้วส่งเข้าครัวทันที", icon: ShoppingCart },
    { title: "เข้าครัว", desc: "ครัวเห็นคิวใหม่ กำลังทำ และรายการที่เสร็จแล้วจากจอเดียว", icon: ChefHat },
    { title: "ปิดบิล", desc: "ตรวจรายการ รับเงินสดหรือ PromptPay แล้วคืนสถานะโต๊ะ", icon: ReceiptText },
  ],
  en: [
    { title: "Open a table", desc: "Choose a zone and table, then start an order without separate notes.", icon: Table2 },
    { title: "Take orders", desc: "Choose dishes and quantities, review the order, and send it to the kitchen.", icon: ShoppingCart },
    { title: "Send to kitchen", desc: "Chefs see new, cooking, and completed tickets from one queue.", icon: ChefHat },
    { title: "Close the bill", desc: "Review the order, take cash or PromptPay, and release the table.", icon: ReceiptText },
  ],
};

const ROLE_ITEMS: Record<Language, RoleItem[]> = {
  th: [
    { role: "เจ้าของร้าน", title: "เห็นภาพร้านโดยไม่ต้องถามทุกแผนก", desc: "ดูโต๊ะที่ติดคิว อาหารที่ครัวทำเสร็จ และบิลรอชำระจากภาพรวมเดียว", icon: BarChart3 },
    { role: "พนักงานหน้าร้าน", title: "รับออเดอร์แล้วรู้ทันทีว่าครัวถึงไหน", desc: "ลดการเดินถามครัวซ้ำ และช่วยให้เสิร์ฟอาหารได้ตรงจังหวะ", icon: UsersRound },
    { role: "ครัว", title: "จัดลำดับคิวจากรายการที่อ่านง่าย", desc: "แยกคิวใหม่ กำลังทำ และเสร็จแล้วโดยไม่ต้องไล่กระดาษย้อนหลัง", icon: ChefHat },
    { role: "แคชเชียร์", title: "ตรวจบิลและรับชำระจากข้อมูลเดียวกัน", desc: "ลดการคีย์ซ้ำตอนปิดบิล และคืนโต๊ะให้รอบถัดไปได้เร็วขึ้น", icon: CreditCard },
  ],
  en: [
    { role: "Owner", title: "See the whole restaurant without checking every station", desc: "Review delayed tables, completed kitchen items, and bills awaiting payment from one overview.", icon: BarChart3 },
    { role: "Front-of-house staff", title: "Take orders and see kitchen progress immediately", desc: "Spend less time checking with the kitchen and serve each dish at the right moment.", icon: UsersRound },
    { role: "Kitchen", title: "Prioritize tickets at a glance", desc: "Separate new, cooking, and completed tickets without searching through paper slips.", icon: ChefHat },
    { role: "Cashier", title: "Review bills and take payment from the same order", desc: "Avoid re-entering details at checkout and release tables sooner.", icon: CreditCard },
  ],
};

const READY_FEATURES: Record<Language, string[]> = {
  th: ["สร้างร้านและเลือกร้านที่ใช้งาน", "เชิญพนักงานเข้าทีม", "จัดการเมนู รูปภาพ และตัวเลือก", "จัดโซนและโต๊ะ", "รับออเดอร์ผ่าน POS", "คิวครัวสำหรับ KDS", "บิล เงินสด และ PromptPay MVP", "ภาพรวมกะร้านอัปเดตแบบเรียลไทม์"],
  en: ["Create and choose a restaurant workspace", "Invite staff to the team", "Manage menus, images, and options", "Organize zones and tables", "Take orders through POS", "Run the kitchen queue on KDS", "Handle bills, cash, and PromptPay", "Follow the live shift overview"],
};

const LANDING_COPY: Record<Language, {
  nav: [string, string, string];
  login: string;
  register: string;
  heroTitle: string;
  heroImageAlt: string;
  phoneImageAlt: string;
  proofTitle: string;
  proofDesc: string;
  workflowTitle: string;
  workflowDesc: string;
  rolesTitle: string;
  rolesDesc: string;
  aiTitle: string;
  aiDesc: string;
  ctaLabel: string;
  ctaTitle: string;
  ctaDesc: string;
  footerProject: string;
  footerWorkflow: string;
  mockup: Record<string, string>;
}> = {
  th: {
    nav: ["ภาพรวม", "กะร้าน", "ทีม"],
    login: "เข้าสู่ระบบ",
    register: "เริ่มใช้งาน",
    heroTitle: "จัดการร้านได้ผ่านมือถือ",
    heroImageAlt: "ทีมครัวกำลังทำอาหารระหว่างกะเย็นในร้านอาหาร",
    phoneImageAlt: "ตัวอย่าง Dishy บนมือถือ",
    proofTitle: "ยกระดับร้านด้วยข้อมูลที่ทีมเห็นตรงกัน",
    proofDesc: "บริหารออเดอร์ งานครัว การชำระเงิน และภาพรวมร้านจากพื้นที่ทำงานเดียว",
    workflowTitle: "ขั้นตอนการทำงานที่ต่อเนื่อง",
    workflowDesc: "หน้าร้าน ครัว และแคชเชียร์อัปเดตสถานะจากออเดอร์ชุดเดียวกัน ลดการจดซ้ำและการเดินถาม",
    rolesTitle: "แต่ละบทบาทเห็นสิ่งที่ต้องจัดการ",
    rolesDesc: "ระบบแยกหน้างานให้เหมาะกับเจ้าของร้าน พนักงานหน้าร้าน ครัว และแคชเชียร์ โดยใช้สถานะจากกะเดียวกัน",
    aiTitle: "AI ผู้ช่วยสำหรับข้อมูลในร้านของคุณ",
    aiDesc: "ถามยอดขาย เมนู และวัตถุดิบจากข้อมูลที่ระบบมี เพื่อช่วยตรวจสถานการณ์ก่อนตัดสินใจ",
    ctaLabel: "พร้อมเริ่มกะถัดไป",
    ctaTitle: "เปิดร้านด้วยระบบที่เห็นจังหวะงานจริง",
    ctaDesc: "เข้าสู่ระบบเพื่อสร้างร้าน ตั้งค่าโต๊ะ เมนู และเชิญทีมให้ทดลองขั้นตอนหน้าร้าน ครัว และปิดบิล",
    footerProject: "ระบบจัดการงานร้านอาหารสำหรับโปรเจกต์ Pre-capstone",
    footerWorkflow: "ออกแบบสำหรับขั้นตอนการทำงานของร้านอาหารไทย",
    mockup: {
      overview: "ภาพรวมกะร้าน", shift: "กะเย็นวันนี้", open: "เปิดให้บริการ", focusLabel: "สิ่งที่ต้องเห็นในกะนี้", focusTitle: "โต๊ะ คิวครัว และบิลอยู่ในภาพเดียว", focusDesc: "ใช้สำหรับช่วงที่ร้านต้องตัดสินใจเร็ว ไม่ใช่แค่ดูรายงานหลังปิดร้าน", front: "หน้าร้านรับออเดอร์", kitchen: "ครัวอัปเดตสถานะ", cashier: "แคชเชียร์ปิดบิล", floorMap: "ผังโต๊ะ", zones: "โซน A-C", activity: "ความเคลื่อนไหว", live: "สด", kitchenQueue: "คิวครัว", updatedFromPos: "อัปเดตจาก POS", table: "โต๊ะ", paymentTitle: "โต๊ะ B2 รอชำระ", paymentDesc: "ตรวจรายการ รับชำระ และคืนสถานะโต๊ะจากขั้นตอนเดียว",
    },
  },
  en: {
    nav: ["Overview", "Workflow", "Team"],
    login: "Sign in",
    register: "Get started",
    heroTitle: "Run your restaurant from your phone",
    heroImageAlt: "A kitchen team preparing dishes during an evening restaurant shift",
    phoneImageAlt: "Dishy shown on a mobile phone",
    proofTitle: "Keep the whole team aligned with shared restaurant data",
    proofDesc: "Manage orders, kitchen progress, payments, and the live state of your restaurant from one workspace.",
    workflowTitle: "One continuous restaurant workflow",
    workflowDesc: "Front of house, kitchen, and cashier update the same order, reducing duplicate entry and status checks.",
    rolesTitle: "Give every role the right operational view",
    rolesDesc: "Owners, front-of-house staff, kitchen teams, and cashiers each see the work they need while sharing one shift status.",
    aiTitle: "An AI assistant for your restaurant data",
    aiDesc: "Ask about sales, menu performance, and inventory using the data already recorded in the system.",
    ctaLabel: "Ready for the next shift",
    ctaTitle: "Run the next shift around real restaurant work",
    ctaDesc: "Sign in to create a restaurant, configure tables and menus, and invite your team to try the front-of-house, kitchen, and billing flow.",
    footerProject: "Pre-capstone restaurant operations system",
    footerWorkflow: "Built for Thai restaurant workflows",
    mockup: {
      overview: "Live shift overview", shift: "Tonight's shift", open: "Open", focusLabel: "What matters this shift", focusTitle: "Tables, kitchen queue, and bills in one view", focusDesc: "Built for moments when the team needs to act quickly, not only review reports after closing.", front: "Front of house takes orders", kitchen: "Kitchen updates status", cashier: "Cashier closes bills", floorMap: "Floor map", zones: "Zones A-C", activity: "Activity", live: "live", kitchenQueue: "Kitchen queue", updatedFromPos: "Updated from POS", table: "Table", paymentTitle: "Table B2 awaiting payment", paymentDesc: "Review the order, take payment, and release the table from one flow.",
    },
  },
};

const metricToneClass: Record<ShiftMetric["tone"], string> = {
  neutral: "text-gray-950 dark:text-white",
  orange: "text-orange-600 dark:text-orange-400",
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  sky: "text-sky-600 dark:text-sky-400",
};

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { language } = useLanguage();
  const Icon = theme === "dark" ? Sun : Moon;
  const title = theme === "dark"
    ? language === "th" ? "สลับเป็นโหมดสว่าง" : "Switch to light mode"
    : language === "th" ? "สลับเป็นโหมดมืด" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={title}
      title={title}
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
      className={`flex flex-col justify-center items-center transition-transform duration-300 ease-out motion-reduce:transition-none ${className}`}
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
function SwiperStyle() {
  return(
    <style>{`
  .role-swiper .swiper-wrapper {
    align-items: stretch;
  }

  .role-swiper .swiper-slide {
    height: auto;
    display: flex;
  }

  .role-swiper .swiper-slide > * {
    width: 100%;
  `}</style>
  );
}
function SecondaryButton({onClick, children}: {onClick: () => void; children: ReactNode}) {
  return(
    <button
      type="button"
      onClick={onClick}
      className="ui-press landing-lift inline-flex h-20 w-100 max-w-6xl items-center rounded-[10px] bg-orange-700 px-5 text-xl sm:text-3xl md:text-4xl lg:text-[60px] font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-800"
    >
      {/* กลาง */}
      <span className="flex flex-[6] items-center justify-center">
        {children}
      </span>

      {/* ขวา */}
      <span className="flex flex-[1] items-center justify-end">
        <ArrowRight className="h-6 w-6 shrink-0" strokeWidth={3} />
      </span>
    </button>
  );
}
function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-press landing-lift inline-flex h-25 w-full max-w-6xl items-center rounded-[10px] bg-orange-700 px-5 text-xl sm:text-3xl md:text-4xl lg:text-[60px] font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-800"
    >
      {/* อันแรก — เล็กสุด */}
      <span className="flex flex-[1] items-center justify-start">
         
      </span>

      {/* กลาง */}
      <span className="flex flex-[2] items-center justify-center">
        {children}
      </span>

      {/* ขวา */}
      <span className="flex flex-[1] items-center justify-end">
        <ArrowRight className="h-6 w-6 shrink-0" strokeWidth={3} />
      </span>
    </button>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-3xl flex flex-col items-center">
      <h2 className="text-3xl font-semibold leading-tight text-gray-950 sm:text-4xl dark:text-white">{title}</h2>
      <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">{desc}</p>
    </div>
  );
}

function HeroImage({ alt }: { alt: string }) {
  return (
    <Image
      src={HERO_IMAGE_URL}
      alt={alt}
      fill
      priority
      unoptimized
      sizes="100vw"
      className="landing-hero-photo object-cover"
    />
  );
}

function PhoneMockup({ label, language }: { label: string; language: Language }) {
  const copy = LANDING_COPY[language].mockup;
  const phoneTables = [TABLES[language][0], TABLES[language][1], TABLES[language][4]];
  const phoneTickets = KITCHEN_TICKETS[language].slice(0, 2);

  return (
    <div
      role="img"
      aria-label={label}
      className="relative aspect-[9/16] w-48 shrink-0 sm:w-64 md:w-80 lg:w-96"
    >
      <div
        aria-hidden="true"
        className="relative h-full overflow-hidden rounded-[2rem] bg-gray-950 p-[5px] shadow-[0_8px_8px_rgba(3,7,18,0.32)] sm:rounded-[2.5rem] sm:p-2 md:rounded-[3rem]"
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[1.7rem] bg-slate-50 text-gray-950 sm:rounded-[2.05rem] md:rounded-[2.5rem]">
          <div className="absolute left-1/2 top-2 z-10 h-3 w-14 -translate-x-1/2 rounded-full bg-gray-950 sm:top-3 sm:h-4 sm:w-20" />

          <div className="flex items-center justify-between px-4 pb-1 pt-2.5 font-mono text-[7px] font-semibold tabular-nums text-gray-600 sm:px-5 sm:pb-2 sm:pt-4 sm:text-[9px] md:px-6 md:text-[11px]">
            <span>09:41</span>
            <span className="flex items-end gap-0.5">
              <span className="h-1 w-0.5 rounded-full bg-gray-500 sm:h-1.5" />
              <span className="h-1.5 w-0.5 rounded-full bg-gray-600 sm:h-2" />
              <span className="h-2 w-0.5 rounded-full bg-gray-800 sm:h-2.5" />
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-b border-gray-200 bg-white px-2.5 py-2 sm:gap-2.5 sm:px-4 sm:py-3 md:px-5">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white sm:h-7 sm:w-7 md:h-9 md:w-9">
              <Store className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <AppWordmark decorative height={10} className="text-gray-950" />
              <p className="truncate text-[6px] text-gray-500 sm:text-[9px] md:text-[11px]">{copy.shift}</p>
            </div>
            <span className="rounded bg-emerald-50 px-1 py-0.5 text-[6px] font-semibold text-emerald-700 sm:px-1.5 sm:text-[8px] md:text-[10px]">
              {copy.open}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-2.5 py-2 sm:px-4 sm:py-3 md:px-5 md:py-4">
            <div className="rounded-md bg-gray-950 px-2.5 py-2 text-white sm:px-3.5 sm:py-3 md:px-4 md:py-4">
              <p className="text-[6px] font-medium text-orange-300 sm:text-[8px] md:text-[10px]">
                {copy.focusLabel}
              </p>
              <p className="mt-1 line-clamp-2 text-[9px] font-semibold leading-tight sm:text-xs md:text-base">
                {copy.focusTitle}
              </p>
            </div>

            <div className="grid grid-cols-3 border-b border-gray-200 py-2 sm:py-3 md:py-4">
              {[copy.front, copy.kitchen, copy.cashier].map((item, index) => {
                const Icon = [Table2, ChefHat, ReceiptText][index];
                return (
                  <div
                    key={item}
                    className={`min-w-0 px-1.5 text-center sm:px-2 ${index > 0 ? "border-l border-gray-200" : ""}`}
                  >
                    <Icon className="mx-auto h-3 w-3 text-gray-700 sm:h-4 sm:w-4 md:h-5 md:w-5" strokeWidth={1.8} />
                    <p className="mt-1 truncate text-[6px] font-medium text-gray-600 sm:text-[8px] md:text-[10px]">
                      {item}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="border-b border-gray-200 py-2 sm:py-3 md:py-4">
              <div className="flex items-center justify-between">
                <p className="text-[8px] font-semibold sm:text-[10px] md:text-xs">{copy.floorMap}</p>
                <span className="text-[6px] text-gray-500 sm:text-[8px] md:text-[10px]">{copy.zones}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1 sm:mt-2 sm:gap-1.5 md:gap-2">
                {phoneTables.map((table) => (
                  <div key={table.id} className={`rounded-md border px-1 py-1.5 text-center sm:py-2 md:py-2.5 ${table.tone}`}>
                    <p className="font-mono text-[8px] font-semibold tabular-nums sm:text-[10px] md:text-xs">{table.id}</p>
                    <p className="mt-0.5 truncate text-[5px] font-medium sm:text-[7px] md:text-[9px]">{table.status}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-gray-200 py-2 sm:py-3 md:py-4">
              <div className="flex items-center justify-between">
                <p className="text-[8px] font-semibold sm:text-[10px] md:text-xs">{copy.kitchenQueue}</p>
                <span className="text-[6px] font-medium text-gray-500 sm:text-[8px] md:text-[10px]">{copy.live}</span>
              </div>
              <div className="mt-1.5 space-y-1 sm:mt-2 sm:space-y-1.5">
                {phoneTickets.map((ticket) => (
                  <div key={`${ticket.table}-${ticket.item}`} className="flex items-center gap-1.5 sm:gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${ticket.dot}`} />
                    <p className="shrink-0 font-mono text-[6px] font-semibold tabular-nums sm:text-[8px] md:text-[10px]">
                      {ticket.table}
                    </p>
                    <p className="min-w-0 flex-1 truncate text-[6px] text-gray-600 sm:text-[8px] md:text-[10px]">
                      {ticket.item}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 py-1.5 sm:py-2.5 md:py-4">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600 sm:h-7 sm:w-7 md:h-8 md:w-8">
                <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[7px] font-semibold sm:text-[9px] md:text-[11px]">{copy.paymentTitle}</p>
                <p className="mt-0.5 truncate text-[5px] text-gray-500 sm:text-[7px] md:text-[9px]">{copy.paymentDesc}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 border-t border-gray-200 bg-white px-3 py-1.5 text-gray-500 sm:px-5 sm:py-2.5 md:py-3">
            {[BarChart3, Table2, ChefHat, UsersRound].map((Icon, index) => (
              <span key={index} className={`flex justify-center ${index === 0 ? "text-orange-600" : ""}`}>
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" strokeWidth={1.8} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageAndDownload({ btn, language }: { btn: () => void; language: Language }) {
  const copy = LANDING_COPY[language];

  return (
    <div className="m-6 mb-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-start sm:gap-16 md:gap-24 lg:gap-64">
      <PhoneMockup label={copy.phoneImageAlt} language={language} />
      <div className="flex flex-col items-center gap-4 sm:items-center">
        <PrimaryButton onClick={btn}>{copy.register}</PrimaryButton>
       <HeroProofStrip language={language} />
      </div>
    </div>
  );
}
function HeroProofStrip({ language }: { language: Language }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-4">
      {HERO_PROOFS[language].map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            style={{ animationDelay: `${260 + index * 70}ms` }}
            className="landing-proof-card rounded-md border border-white/18 bg-gray-950/78 p-3 text-white sm:p-3.5 lg:p-4"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-950 sm:h-9 sm:w-9">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-orange-200 sm:text-[15px]">
                  {item.label}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommandCenterMockup({ language }: { language: Language }) {
  const copy = LANDING_COPY[language].mockup;

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-slate-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <AppLogo size={28} />
            <div>
              <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.overview}</p>
              <p className="text-sm font-semibold text-gray-950 dark:text-white">{copy.shift}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="font-mono">18:42</span>
            <span className="landing-live-chip rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              {copy.open}
            </span>
          </div>
        </div>

        <div className="grid">
          <aside className="border-b border-gray-100 p-4 dark:border-gray-800">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.focusLabel}</p>
                <h3 className="mt-2 text-xl font-semibold leading-tight text-gray-950 dark:text-white">
                  {copy.focusTitle}
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {copy.focusDesc}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[copy.front, copy.kitchen, copy.cashier].map((item) => (
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
                {SHIFT_METRICS[language].map((metric) => (
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
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">{copy.floorMap}</p>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{copy.zones}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TABLES[language].map((table) => (
                    <div key={table.id} className={`rounded-md border p-3 ${table.tone}`}>
                      <p className="text-base font-semibold">{table.id}</p>
                      <p className="mt-1 text-[11px] font-medium">{table.status}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">{copy.activity}</p>
                  <span className="landing-live-chip rounded px-1.5 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">{copy.live}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ACTIVITY[language].map((item, index) => (
                    <div
                      key={item}
                      className="flex min-w-0 gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <span className="mt-1 font-mono text-[10px] text-gray-500">0{index + 1}</span>
                      <p className="text-[12px] leading-5 text-gray-600 dark:text-gray-300">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-950 dark:text-white">{copy.kitchenQueue}</p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{copy.updatedFromPos}</span>
            </div>
            <div className="mt-3 space-y-2">
              {KITCHEN_TICKETS[language].map((ticket) => (
                <div key={`${ticket.table}-${ticket.item}`} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ticket.dot}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-xs font-semibold text-gray-950 dark:text-white">{copy.table} {ticket.table}</p>
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
                <p className="text-xs font-semibold text-gray-950 dark:text-white">{copy.paymentTitle}</p>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-gray-600 dark:text-gray-400">
                {copy.paymentDesc}
              </p>
            </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { closeLoginModal, openLoginModal, user, loading } = useAuth();
  const { language } = useLanguage();
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
  const copy = LANDING_COPY[language];
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
            <AppLogo decorative size={34} priority />
            <div className="hidden leading-none sm:block">
              <AppWordmark
                height={18}
                className={headerOnImage ? "text-white" : "text-gray-950 dark:text-white"}
              />
              <p className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${headerOnImage ? "text-white/62" : "text-gray-400"}`}>
                Restaurant operations
              </p>
            </div>
          </div>

          <nav className={`hidden items-center gap-6 text-sm font-medium md:flex ${headerOnImage ? "text-white/78" : "text-gray-600 dark:text-gray-400"}`}>
            <a href="#proof" className={`transition-colors ${headerOnImage ? "hover:text-white" : "hover:text-gray-950 dark:hover:text-white"}`}>
              {copy.nav[0]}
            </a>
            <a href="#workflow" className={`transition-colors ${headerOnImage ? "hover:text-white" : "hover:text-gray-950 dark:hover:text-white"}`}>
              {copy.nav[1]}
            </a>
            <a href="#roles" className={`transition-colors ${headerOnImage ? "hover:text-white" : "hover:text-gray-950 dark:hover:text-white"}`}>
              {copy.nav[2]}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle className="shrink-0" />
            <button
              type="button"
              onClick={openLandingLoginModal}
              className={`ui-press landing-lift inline-flex h-9 items-center justify-center rounded-md px-3.5 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${
                headerOnImage
                  ? "bg-white text-gray-950 hover:bg-gray-100"
                  : "bg-orange-700 text-white hover:bg-orange-800 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-800"
              }`}
            >
              {copy.login}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative min-h-[calc(100dvh-112px)] overflow-hidden bg-gray-950 text-white">
          <HeroImage alt={copy.heroImageAlt} />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,7,18,0.92)_0%,rgba(3,7,18,0.72)_44%,rgba(3,7,18,0.22)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-gray-950 to-transparent" />
          <div className="justify-center gap-10 relative mx-auto flex min-h-[calc(100dvh-112px)] max-w-7xl flex-col px-4 pb-6 pt-20 sm:min-h-[calc(100dvh-88px)] sm:px-6 sm:pb-7 sm:pt-28 lg:px-8">

            <HeroReveal delay={80}>
              <h1 className="mt-5 max-w-4xl text-[34px] font-semibold leading-[1.08] text-white [text-wrap:balance] sm:text-5xl lg:text-[80px]">
                {copy.heroTitle}
              </h1>
            </HeroReveal>

            <HeroReveal delay={120}>
              <ImageAndDownload btn={openLandingLoginModal} language={language} />
            </HeroReveal>
            
          </div>
        </section>

        <section id="proof" className="border-b border-gray-100 bg-white py-12 dark:border-gray-800 dark:bg-gray-950 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.42fr_0.58fr] lg:items-start lg:px-8">
            <Reveal>
              <SectionHeader
                title={copy.proofTitle}
                desc={copy.proofDesc}
              />          
            </Reveal>

            <Reveal delay={120}>
              <CommandCenterMockup language={language} />
            </Reveal>
          </div>
        </section>

        <section id="workflow" className="border-b border-gray-100 bg-slate-50 py-20 dark:border-gray-800 dark:bg-gray-900/35">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeader
                title={copy.workflowTitle}
                desc={copy.workflowDesc}
              />
            </Reveal>

            <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
              {FLOW_ITEMS[language].map((item, index) => {
                const Icon = item.icon;
                return (
                  <Fragment key={item.title}>
                    <Reveal delay={index * 80}>
                      <div className="flex flex-col justify-top h-full items-center h-full p-7 rounded-[20px] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                        <div className="pb-5 flex items-center gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-slate-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                            <Icon className="h-5 w-5" strokeWidth={1.7} />
                          </span>
                        </div>
                        <h3 className="text-lg m-1 font-semibold text-gray-950 dark:text-white">{item.title}</h3>
                        <p className="m-1 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.desc}</p>
                      </div>
                    </Reveal>

                    {index < FLOW_ITEMS[language].length - 1 && (
                      <div className="hidden xl:flex items-center justify-center text-gray-300 dark:text-gray-700">
                        <ArrowRight className="h-5 w-5" strokeWidth={2} />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </section>

        

        <section id="roles" className="border-b border-gray-100 bg-white py-12 dark:border-gray-800 dark:bg-gray-950 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeader
                title={copy.rolesTitle}
                desc={copy.rolesDesc}
              />
            </Reveal>
            <SwiperStyle />
            <Swiper
              modules={[Pagination]}
              loop
              pagination={{ clickable: true }}
              breakpoints={{
                0: {
                  slidesPerView: 1.1,
                  spaceBetween: 12,
                },
                640: {
                  slidesPerView: 1.2,
                },
                768: {
                  slidesPerView: 2,
                },
              }}
              className="mt-10 pb-12 role-swiper"
              
            >
              {ROLE_ITEMS[language].map((item, index) => {
                const Icon = item.icon;

                return (
                  <SwiperSlide className="w-full h-auto" key={item.role}>
                    <Reveal delay={index * 80}>
                      <div className="flex h-full flex-col rounded-md border max-w-125 mb-10 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
                        <div className=" flex items-start gap-4">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-slate-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                            <Icon className="h-5 w-5" strokeWidth={1.7} />
                          </span>

                          <div>
                            <p className="text-[13px] font-semibold text-orange-600 dark:text-orange-400">
                              {item.role}
                            </p>

                            <h3 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">
                              {item.title}
                            </h3>

                            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                              {item.desc}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Reveal>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          </div>
        </section>

        <section className="border-b border-gray-100 bg-slate-50 py-20 dark:border-gray-800 dark:bg-gray-900/35">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:px-8">
            <Reveal>
              <SectionHeader
                title={copy.aiTitle}
                desc={copy.aiDesc}
              />
            </Reveal>

            <div className="grid gap-2 sm:grid-cols-2">
              {READY_FEATURES[language].map((feature, index) => (
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
                  <p className="text-sm font-semibold text-orange-300">{copy.ctaLabel}</p>
                  <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
                    {copy.ctaTitle}
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
                    {copy.ctaDesc}
                  </p>
                </div>
                <SecondaryButton onClick={openLandingLoginModal}>{copy.login}</SecondaryButton>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 bg-white py-8 dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <AppLogo decorative size={28} />
            <AppWordmark height={16} className="text-gray-900 dark:text-white" />
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span>{copy.footerProject}</span>
            <span className="hidden text-gray-300 dark:text-gray-700 sm:inline">/</span>
            <span>{copy.footerWorkflow}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
