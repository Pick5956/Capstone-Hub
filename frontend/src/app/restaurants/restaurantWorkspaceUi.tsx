"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import { getCurrentUser } from "@/src/lib/auth";
import LanguageToggle from "@/src/components/shared/LanguageToggle";
import type { User } from "@/src/types/auth";

export type Restaurant = {
  id: string;
  name: string;
  branch: string;
  type: string;
  address: string;
  role: string;
  membershipType: "owner" | "manager" | "staff";
  permissions: string;
  staff: number;
  tables: number;
  lastOpened: string;
};

export const RESTAURANTS: Restaurant[] = [
  {
    id: "r-1",
    name: "ครัวบ้านส้ม",
    branch: "สาขาหลัก",
    type: "ร้านอาหาร",
    address: "ถนนมิตรภาพ นครราชสีมา",
    role: "เจ้าของร้าน",
    membershipType: "owner",
    permissions: "ทุกเมนู",
    staff: 8,
    tables: 18,
    lastOpened: "วันนี้ 18:42",
  },
  {
    id: "r-2",
    name: "บ้านส้ม คาเฟ่",
    branch: "สาขา มทส.",
    type: "คาเฟ่",
    address: "ประตู 4 มทส.",
    role: "ผู้จัดการ",
    membershipType: "manager",
    permissions: "ออเดอร์ / ทีม / รายงาน",
    staff: 5,
    tables: 12,
    lastOpened: "เมื่อวาน 20:10",
  },
  {
    id: "r-3",
    name: "ชาบูหน้าเมือง",
    branch: "สาขากลางเมือง",
    type: "ชาบู/ปิ้งย่าง",
    address: "ถนนจอมสุรางค์ยาตร์",
    role: "ครัว",
    membershipType: "staff",
    permissions: "คิวครัว / สต็อก",
    staff: 14,
    tables: 26,
    lastOpened: "2 วันที่แล้ว",
  },
];

export const PLAN = {
  name: "Free",
  maxRestaurants: 1,
  usedRestaurants: RESTAURANTS.length,
  maxMembers: 3,
};

export const RESTAURANT_TYPES = ["ร้านอาหาร", "คาเฟ่", "ชาบู/ปิ้งย่าง", "เดลิเวอรี", "ฟู้ดทรัค"];

const RESTAURANT_TYPE_LABELS: Record<string, Record<Language, string>> = {
  "ร้านอาหาร": { th: "ร้านอาหาร", en: "Restaurant" },
  "คาเฟ่": { th: "คาเฟ่", en: "Cafe" },
  "ชาบู/ปิ้งย่าง": { th: "ชาบู/ปิ้งย่าง", en: "Shabu / Grill" },
  "เดลิเวอรี": { th: "เดลิเวอรี", en: "Delivery" },
  "ฟู้ดทรัค": { th: "ฟู้ดทรัค", en: "Food truck" },
};

export function getRestaurantTypeLabel(type: string, language: Language) {
  return RESTAURANT_TYPE_LABELS[type]?.[language] ?? type;
}

export function formatUserName(user: User | null, language: Language = "th") {
  if (!user) return language === "th" ? "ผู้ใช้" : "User";
  if (user.nickname?.trim()) return user.nickname.trim();

  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");

  return parts.length ? parts.join(" ") : user.email;
}

export function useWorkspaceUser() {
  const { user } = useAuth();
  const [profileUser, setProfileUser] = useState<User | null>(null);

  useEffect(() => {
    if (user) return;
    getCurrentUser().then((res) => {
      if (res?.data) setProfileUser(res.data);
    });
  }, [user]);

  return user ?? profileUser;
}

export function ThemeButton() {
  const { theme, mounted, toggle } = useTheme();
  const { language } = useLanguage();
  const isDark = mounted && theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={language === "th" ? "สลับธีม" : "Toggle theme"}
      title={isDark ? (language === "th" ? "สลับเป็น Light mode" : "Switch to light mode") : language === "th" ? "สลับเป็น Dark mode" : "Switch to dark mode"}
      className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}

export function BrandMark() {
  return (
    <Link href="/restaurants" className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-md bg-orange-600 flex items-center justify-center shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
          <path d="M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3M21 15v7" />
        </svg>
      </div>
      <div>
        <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-gray-400 leading-none">Restaurant</p>
        <p className="text-sm font-black tracking-tight text-gray-900 dark:text-white leading-snug">HUB</p>
      </div>
    </Link>
  );
}

export function WorkspaceShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { logout } = useAuth();
  const { language } = useLanguage();
  const user = useWorkspaceUser();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
        <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeButton />
            <button
              type="button"
              onClick={logout}
              className="h-9 px-3 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              {language === "th" ? "ออกจากระบบ" : "Log out"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Restaurant workspace</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">{description}</p>
          </div>
          <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-[12px] text-gray-600 dark:text-gray-300">
            {language === "th" ? "เข้าสู่ระบบในชื่อ " : "Signed in as "}
            <span className="font-semibold text-gray-900 dark:text-white">{formatUserName(user, language)}</span>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

export function BackToRestaurants() {
  const { language } = useLanguage();

  return (
    <Link
      href="/restaurants"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {language === "th" ? "กลับไปเลือกร้าน" : "Back to restaurants"}
    </Link>
  );
}
