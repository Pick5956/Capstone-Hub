"use client";

import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import LanguageToggle from "@/src/components/shared/LanguageToggle";

function ThemeToggle() {
  const { theme, mounted, toggle } = useTheme();
  const { language } = useLanguage();
  const isDark = mounted && theme === "dark";
  const title = isDark
    ? language === "th" ? "สลับเป็นโหมดสว่าง" : "Switch to light mode"
    : language === "th" ? "สลับเป็นโหมดมืด" : "Switch to dark mode";

  return (
    <button
      onClick={toggle}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}

export default function LandingPage() {
  const { openLoginModal } = useAuth();
  const { language } = useLanguage();

  const copy = language === "th"
    ? {
        navFeatures: "ฟีเจอร์",
        navFlow: "การทำงาน",
        navLaunch: "เริ่มใช้งาน",
        heroEyebrow: "Operations-first restaurant workspace",
        heroTitle: "จัดการร้าน ทีม เมนู และโต๊ะ ในระบบเดียว",
        heroBody:
          "Restaurant Hub ออกแบบมาสำหรับการทำงานหน้าร้านจริง ช่วยให้เจ้าของและทีมเห็นสิ่งที่กำลังเกิดขึ้นตอนนี้ก่อน แล้วค่อยต่อยอดไปยังรายงานและการวิเคราะห์ภายหลัง",
        heroPrimary: "เข้าสู่ระบบ",
        heroSecondary: "ดูสิ่งที่ระบบทำได้",
        heroNote: "ใช้ได้ทั้งภาษาไทยและ English · เหมาะกับหลายสาขา · รองรับ owner และ staff",
        featuresTitle: "สิ่งที่ระบบรองรับตอนนี้",
        features: [
          { title: "หลายร้านในบัญชีเดียว", body: "เจ้าของหรือทีมคนเดียวสลับใช้งานหลายร้านได้ และกำหนดร้านที่กำลังทำงานอยู่ได้ชัดเจน" },
          { title: "เชิญทีมด้วยลิงก์จริง", body: "สร้าง invitation token, รับคำเชิญ, เปลี่ยนบทบาท, ระงับสมาชิก และดู audit log ได้จากระบบเดียว" },
          { title: "เมนูและโต๊ะผูก backend แล้ว", body: "ข้อมูลเมนู หมวดหมู่ รูปเมนู และสถานะโต๊ะถูกเก็บจริงพร้อมสิทธิ์ตามบทบาท" },
        ],
        workflowTitle: "การเริ่มต้นใช้งาน",
        workflow: [
          "สร้างร้านและตั้งค่าข้อมูลหลัก เช่น ชื่อสาขา เวลาเปิดปิด และจำนวนโต๊ะ",
          "เชิญผู้จัดการหรือพนักงานเข้าร่วมร้านผ่านลิงก์ invitation",
          "เข้า dashboard เพื่อจัดการเมนู โต๊ะ และข้อมูลหน้าร้าน",
        ],
        ctaTitle: "พร้อมเริ่มจัดการร้านแบบสองภาษาแล้วหรือยัง",
        ctaBody: "เข้าสู่ระบบเพื่อสร้างร้านใหม่ เข้าร่วมร้านเดิม หรือสลับไปยังร้านที่กำลังดูแลอยู่",
        ctaButton: "เปิดระบบ",
        footer: "Restaurant Hub สำหรับงานหน้าร้านจริง",
      }
    : {
        navFeatures: "Features",
        navFlow: "Workflow",
        navLaunch: "Launch",
        heroEyebrow: "Operations-first restaurant workspace",
        heroTitle: "Manage restaurants, teams, menus, and tables in one system",
        heroBody:
          "Restaurant Hub is built for real front-of-house operations. Owners and staff can see what is happening right now first, then move into reports and analysis later.",
        heroPrimary: "Sign in",
        heroSecondary: "See what the system can do",
        heroNote: "Available in Thai and English · suitable for multiple branches · supports owners and staff",
        featuresTitle: "What the system supports today",
        features: [
          { title: "Multiple restaurants in one account", body: "Owners and staff can switch between multiple restaurants and keep a clear active workspace." },
          { title: "Real invitation links for team access", body: "Create invitation tokens, accept invitations, change roles, suspend members, and review audit logs in one place." },
          { title: "Menus and tables already use the backend", body: "Menu items, categories, menu images, and table statuses are stored live and respect restaurant roles." },
        ],
        workflowTitle: "How to get started",
        workflow: [
          "Create a restaurant and set the core details such as branch name, hours, and table count.",
          "Invite managers or staff members through real invitation links.",
          "Enter the dashboard to manage menus, tables, and front-of-house data.",
        ],
        ctaTitle: "Ready to run the restaurant in two languages?",
        ctaBody: "Sign in to create a new restaurant, join an existing one, or switch into the restaurant you already manage.",
        ctaButton: "Open the app",
        footer: "Restaurant Hub for real restaurant operations",
      };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-orange-600 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
                <path d="M7 2v20" />
                <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3" />
                <path d="M21 15v7" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Restaurant</p>
              <p className="text-sm font-black tracking-tight text-gray-900 dark:text-white">HUB</p>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-500 dark:text-gray-400 md:flex">
            <a href="#features" className="transition-colors hover:text-gray-900 dark:hover:text-white">{copy.navFeatures}</a>
            <a href="#workflow" className="transition-colors hover:text-gray-900 dark:hover:text-white">{copy.navFlow}</a>
            <a href="#launch" className="transition-colors hover:text-gray-900 dark:hover:text-white">{copy.navLaunch}</a>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <button
              onClick={openLoginModal}
              className="hidden rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900 sm:inline-flex"
            >
              {copy.heroPrimary}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{copy.heroEyebrow}</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl">
                {copy.heroTitle}
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-gray-600 dark:text-gray-400">{copy.heroBody}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={openLoginModal}
                  className="rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
                >
                  {copy.heroPrimary}
                </button>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center rounded-md border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                >
                  {copy.heroSecondary}
                </a>
              </div>
              <p className="mt-4 text-[12px] text-gray-500 dark:text-gray-400">{copy.heroNote}</p>
            </div>

            <div className="rounded-md border border-gray-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="grid gap-3 sm:grid-cols-2">
                {copy.features.map((feature) => (
                  <div key={feature.title} className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{feature.title}</p>
                    <p className="mt-2 text-[12px] leading-6 text-gray-500 dark:text-gray-400">{feature.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.featuresTitle}</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {copy.features.map((feature, index) => (
              <div key={feature.title} className="rounded-md border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-50 text-[12px] font-semibold text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                  {index + 1}
                </div>
                <p className="mt-4 text-[14px] font-semibold text-gray-900 dark:text-white">{feature.title}</p>
                <p className="mt-2 text-[12px] leading-6 text-gray-500 dark:text-gray-400">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="border-y border-gray-200 bg-white py-14 dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.workflowTitle}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {copy.workflow.map((step, index) => (
                <div key={step} className="rounded-md border border-gray-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-3 text-[13px] leading-6 text-gray-700 dark:text-gray-300">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="launch" className="mx-auto max-w-6xl px-5 py-14">
          <div className="rounded-md bg-gray-900 px-6 py-10 text-white dark:bg-white dark:text-gray-900">
            <h2 className="text-3xl font-black tracking-tight">{copy.ctaTitle}</h2>
            <p className="mt-4 max-w-2xl text-[14px] leading-7 text-white/75 dark:text-gray-600">{copy.ctaBody}</p>
            <button
              onClick={openLoginModal}
              className="mt-6 rounded-md bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 dark:bg-gray-900 dark:text-white"
            >
              {copy.ctaButton}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white py-8 dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 text-[12px] text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>{copy.footer}</p>
          <p>© 2026 Restaurant Hub</p>
        </div>
      </footer>
    </div>
  );
}
