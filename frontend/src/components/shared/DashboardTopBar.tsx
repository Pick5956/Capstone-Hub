"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useLanguage } from "@/src/providers/LanguageProvider";
import DashboardAccountMenu from "@/src/components/shared/DashboardAccountMenu";

export default function DashboardTopBar() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const hideForPosWork = /^\/pos\/orders\/[^/]+\/?$/.test(pathname) || pathname === "/pos/tables";

  if (hideForPosWork) return null;

  return (
    <>
      <header className="dashboard-shell-row dashboard-shell-border-b fixed inset-x-0 top-0 z-[var(--z-sticky)] hidden items-center justify-end gap-1.5 bg-slate-50 px-5 dark:bg-gray-950 lg:left-[var(--sidebar-w)] lg:flex">
        <button
          type="button"
          aria-label={language === "th" ? "การแจ้งเตือน" : "Notifications"}
          className="ui-press inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          <Bell className="h-4 w-4" strokeWidth={2} />
        </button>
        <DashboardAccountMenu />
      </header>
      <div aria-hidden="true" className="dashboard-shell-row hidden lg:block" />
    </>
  );
}
