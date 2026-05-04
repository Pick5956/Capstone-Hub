"use client";

import Link from "next/link";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import LanguageToggle from "@/src/components/shared/LanguageToggle";

function ThemeButton() {
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

export default function NotFoundUI() {
  const { language } = useLanguage();

  const quickLinks = [
    { label: language === "th" ? "เลือกร้าน" : "Restaurants", href: "/restaurants" },
    { label: language === "th" ? "สร้างร้าน" : "Create restaurant", href: "/restaurants/new" },
    { label: language === "th" ? "เข้าร่วมร้าน" : "Join restaurant", href: "/restaurants/join" },
    { label: language === "th" ? "ตั้งค่า" : "Settings", href: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
        <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
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
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeButton />
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-4rem)] flex items-center">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 lg:items-center">
            <section className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
                {language === "th" ? "ไม่พบหน้า" : "Page not found"}
              </p>
              <h1 className="mt-4 text-7xl sm:text-8xl font-black tracking-tight text-gray-950 dark:text-white">404</h1>
              <p className="mt-3 text-[13px] text-gray-500 dark:text-gray-400">
                {language === "th"
                  ? "หน้านี้อาจถูกย้าย ลบ หรือคุณอาจไม่มีสิทธิ์เข้าถึง"
                  : "This page may have been moved, deleted, or you may not have permission to open it."}
              </p>
            </section>

            <section className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
                {language === "th" ? "ไม่พบหน้าที่คุณต้องการ" : "We couldn't find the page you were looking for"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                {language === "th"
                  ? "ลองกลับไปหน้าเลือกร้าน หรือย้อนกลับไปหน้าก่อนหน้า ถ้าคุณเพิ่งได้รับลิงก์เชิญร้าน ให้ตรวจว่าลิงก์ยังไม่หมดอายุ"
                  : "Try going back to the restaurant selector or the previous page. If you just received an invitation link, make sure it has not expired yet."}
              </p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Link
                  href="/restaurants"
                  className="h-10 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold inline-flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  {language === "th" ? "ไปหน้าเลือกร้าน" : "Go to restaurants"}
                </Link>
                <Link
                  href="/"
                  className="h-10 rounded-md border border-gray-200 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-200 inline-flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {language === "th" ? "กลับหน้าแรก" : "Back to home"}
                </Link>
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="h-10 rounded-md border border-gray-200 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {language === "th" ? "ย้อนกลับ" : "Go back"}
                </button>
              </div>

              <div className="mt-5 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2">
                <p className="text-[12px] font-medium text-gray-900 dark:text-white">
                  {language === "th" ? "ทางลัดที่ใช้บ่อย" : "Common shortcuts"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickLinks.map((item) => (
                    <Link key={item.href} href={item.href} className="rounded-md bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-2.5 py-1.5 text-[12px] text-gray-600 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors">
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
