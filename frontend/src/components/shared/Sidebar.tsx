'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/src/providers/SidebarProvider';
import { useAuth } from '@/src/providers/AuthProvider';
import { useTheme } from '@/src/providers/ThemeProvider';
import { useLanguage } from '@/src/providers/LanguageProvider';

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
};

type NavGroup = {
  group: string;
  items: NavItem[];
};

function buildNav(language: 'th' | 'en'): NavGroup[] {
  return [
    {
      group: language === 'th' ? 'หลัก' : 'Core',
      items: [
        {
          label: language === 'th' ? 'ภาพรวม' : 'Overview',
          href: '/home',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
        },
        {
          label: language === 'th' ? 'ออเดอร์' : 'Orders',
          href: '/orders',
          badge: '3',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
        },
        {
          label: language === 'th' ? 'โต๊ะ' : 'Tables',
          href: '/tables',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13M19 7v13M8 20h8"/></svg>,
        },
      ],
    },
    {
      group: language === 'th' ? 'จัดการ' : 'Manage',
      items: [
        {
          label: language === 'th' ? 'เมนูอาหาร' : 'Menu',
          href: '/menu',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>,
        },
        {
          label: language === 'th' ? 'คลังวัตถุดิบ' : 'Inventory',
          href: '/inventory',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
        },
        {
          label: language === 'th' ? 'พนักงาน' : 'Staff',
          href: '/staff',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
        },
      ],
    },
    {
      group: language === 'th' ? 'รายงาน' : 'Reports',
      items: [
        {
          label: language === 'th' ? 'รายได้และยอดขาย' : 'Revenue and sales',
          href: '/reports',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
        },
        {
          label: language === 'th' ? 'ตั้งค่า' : 'Settings',
          href: '/settings',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
        },
      ],
    },
  ] as const;
}

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { language } = useLanguage();
  const nav = buildNav(language);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
      {nav.map(({ group, items }) => (
        <div key={group}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">{group}</p>
          )}
          <div className="space-y-0.5">
            {items.map(({ label, href, icon, badge }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
                  } ${collapsed ? 'justify-center' : ''}`}
                >
                  {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-orange-500" />}
                  <span className={active ? 'text-orange-500' : ''}>{icon}</span>
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!collapsed && badge && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-black text-white">
                      {badge}
                    </span>
                  )}
                  {collapsed && badge && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-500" />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const initials = user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() : '?';
  const displayName = user ? `${user.first_name} ${user.last_name}` : language === 'th' ? 'ผู้ใช้งาน' : 'User';
  const logoutLabel = language === 'th' ? 'ออกจากระบบ' : 'Sign out';

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-gray-100 px-3 py-4 dark:border-gray-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
          {initials}
        </div>
        <ThemeToggle />
        <button
          onClick={logout}
          title={logoutLabel}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-gray-100 px-4 py-4 dark:border-gray-800">
      <div className="group flex items-center gap-3 rounded-md px-2 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">{displayName}</p>
          <p className="truncate text-[10px] text-gray-400">{user?.email ?? ''}</p>
        </div>
        <button
          onClick={logout}
          title={logoutLabel}
          className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, mounted, toggle } = useTheme();
  const { language } = useLanguage();
  const isDark = mounted && theme === 'dark';
  const title = isDark
    ? language === 'th' ? 'สลับเป็นโหมดสว่าง' : 'Switch to light mode'
    : language === 'th' ? 'สลับเป็นโหมดมืด' : 'Switch to dark mode';

  return (
    <button
      onClick={toggle}
      title={title}
      className={`shrink-0 rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${className}`}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      )}
    </button>
  );
}

function RestaurantSwitch({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const restaurantName = activeMembership?.restaurant?.name ?? (language === 'th' ? 'เลือกร้าน' : 'Select restaurant');
  const currentRestaurant = language === 'th' ? 'ร้านปัจจุบัน' : 'Current restaurant';
  const switchLabel = language === 'th' ? 'เปลี่ยน' : 'Switch';

  if (collapsed) {
    return (
      <div className="shrink-0 border-b border-gray-100 px-3 py-3 dark:border-gray-800">
        <Link
          href="/restaurants"
          onClick={onNavigate}
          title={switchLabel}
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-600 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-orange-900/20 dark:hover:text-orange-400"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M3 7h18M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7" />
            <path d="M9 12h6M9 16h4" />
          </svg>
        </Link>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-gray-100 px-3 py-3 dark:border-gray-800">
      <Link
        href="/restaurants"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 transition-colors hover:border-orange-300 hover:bg-orange-50 dark:border-gray-800 dark:bg-gray-900/60 dark:hover:border-orange-800 dark:hover:bg-orange-900/20"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-orange-600 dark:border-gray-800 dark:bg-gray-950 dark:text-orange-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M3 7h18M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7" />
            <path d="M9 12h6M9 16h4" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-none text-gray-400 dark:text-gray-500">{currentRestaurant}</span>
          <span className="mt-1 block truncate text-[13px] font-semibold text-gray-900 dark:text-white">{restaurantName}</span>
        </span>
        <span className="shrink-0 text-[11px] font-medium text-orange-600 dark:text-orange-400">{switchLabel}</span>
      </Link>
    </div>
  );
}

export default function Sidebar() {
  const { mobileOpen, setMobileOpen, collapsed, setCollapsed } = useSidebar();
  const { language } = useLanguage();
  const collapseTitle = collapsed
    ? language === 'th' ? 'ขยายแถบด้านข้าง' : 'Expand sidebar'
    : language === 'th' ? 'ย่อแถบด้านข้าง' : 'Collapse sidebar';

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        aria-hidden={!mobileOpen}
        className={`
          fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-gray-100 bg-white shadow-2xl transition-transform duration-300 ease-in-out will-change-transform dark:border-gray-800 dark:bg-gray-950 lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}
        `}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-4 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-red-600 shadow-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/>
                <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3"/><path d="M21 15v7"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] leading-none text-gray-400 dark:text-gray-500">Restaurant</p>
              <p className="text-sm font-black tracking-tight leading-snug text-gray-900 dark:text-white">HUB</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-5 w-5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <RestaurantSwitch collapsed={false} onNavigate={() => setMobileOpen(false)} />
        <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
        <UserFooter collapsed={false} />
      </aside>

      <aside
        className={`
          fixed left-0 top-0 z-30 hidden h-screen flex-col overflow-hidden border-r border-gray-100 bg-white transition-[width] duration-200 ease-out will-change-[width] dark:border-gray-800 dark:bg-gray-950 lg:flex
          ${collapsed ? 'w-[68px]' : 'w-60'}
        `}
      >
        <div className={`flex h-14 shrink-0 items-center border-b border-gray-100 px-3 dark:border-gray-800 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-red-600 shadow-md">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/>
                  <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3"/><path d="M21 15v7"/>
                </svg>
              </div>
              <div className="overflow-hidden">
                <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.18em] leading-none text-gray-400 dark:text-gray-500">Restaurant</p>
                <p className="whitespace-nowrap text-sm font-black tracking-tight leading-snug text-gray-900 dark:text-white">HUB</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-0.5">
            {!collapsed && <ThemeToggle />}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="shrink-0 rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              title={collapseTitle}
            >
              {collapsed ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><polyline points="9 18 15 12 9 6"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><polyline points="15 18 9 12 15 6"/></svg>
              )}
            </button>
          </div>
        </div>

        <RestaurantSwitch collapsed={collapsed} />
        <NavLinks collapsed={collapsed} />
        <UserFooter collapsed={collapsed} />
      </aside>
    </>
  );
}
