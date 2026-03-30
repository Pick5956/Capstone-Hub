'use client';

import Link from 'next/link';
import { useSidebar } from '@/src/providers/SidebarProvider';

export default function MobileTopBar() {
  const { setMobileOpen } = useSidebar();

  return (
    <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14
      bg-white/90 dark:bg-gray-950/90 backdrop-blur-md
      border-b border-gray-100 dark:border-gray-800 shadow-sm">

      {/* Hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="p-2 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
        aria-label="เปิดเมนู"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Brand */}
      <Link href="/home" className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-black text-xs shadow">R</div>
        <span className="font-extrabold text-sm tracking-tight text-gray-900 dark:text-white">
          RESTAURANT <span className="text-orange-500">HUB</span>
        </span>
      </Link>
    </header>
  );
}
