'use client';

import { useSidebar } from '@/src/providers/SidebarProvider';
import { useLanguage } from '@/src/providers/LanguageProvider';
import { Bell } from 'lucide-react';
import DashboardAccountMenu from '@/src/components/shared/DashboardAccountMenu';

export default function MobileTopBar() {
  const { setMobileOpen } = useSidebar();
  const { language } = useLanguage();

  return (
    <header
      className="fixed inset-x-0 top-0 z-30 flex h-14 max-w-full items-center gap-3 overflow-visible px-4 lg:hidden
      bg-white/90 dark:bg-gray-950/90 backdrop-blur-md
      border-b border-gray-100 dark:border-gray-800 shadow-sm"
    >
      <button
        onClick={() => setMobileOpen(true)}
        className="p-2 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
        aria-label={language === 'th' ? 'เปิดเมนู' : 'Open menu'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={language === 'th' ? 'การแจ้งเตือน' : 'Notifications'}
          className="ui-press inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          <Bell className="h-4 w-4" strokeWidth={2} />
        </button>
        <DashboardAccountMenu />
      </div>
    </header>
  );
}
