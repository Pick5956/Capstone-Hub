'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/src/providers/SidebarProvider';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLanguage } from '@/src/providers/LanguageProvider';
import LanguageToggle from '@/src/components/shared/LanguageToggle';
import ThemeToggle from '@/src/components/shared/ThemeToggle';
import UserAvatar from '@/src/components/shared/UserAvatar';
import AppLogo from '@/src/components/shared/AppLogo';
import { useBackdropClose } from '@/src/hooks/useBackdropClose';
import { can } from '@/src/lib/rbac';
import type { Permission } from '@/src/types/auth';

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  comingSoon?: boolean;
  permission?: Permission | Permission[];
};

type NavGroup = {
  group: string;
  items: NavItem[];
};

function buildNav(language: 'th' | 'en'): NavGroup[] {
  return [
    {
      group: language === 'th' ? 'เริ่มงาน' : 'Start work',
      items: [
        {
          label: language === 'th' ? 'ภาพรวม' : 'Overview',
          href: '/home',
          permission: 'view_dashboard',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
        },
        {
          label: language === 'th' ? 'รับออเดอร์' : 'Take orders',
          href: '/pos/tables',
          permission: 'take_order',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M4 9h16"/><path d="M5 9l1-5h12l1 5"/><path d="M6 9v10a1 1 0 001 1h10a1 1 0 001-1V9"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>,
        },
        {
          label: language === 'th' ? 'จอครัว' : 'Kitchen screen',
          href: '/kitchen',
          permission: 'view_kitchen',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M6 2v20"/><path d="M18 2v20"/><path d="M6 8h12"/><path d="M6 16h12"/><path d="M9 5h6"/><path d="M9 19h6"/></svg>,
        },
      ],
    },
    {
      group: language === 'th' ? 'จัดการร้าน' : 'Restaurant setup',
      items: [
        {
          label: language === 'th' ? 'เมนูอาหาร' : 'Menu',
          href: '/menu',
          permission: ['view_menu', 'manage_menu'],
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>,
        },
        {
          label: language === 'th' ? 'ผังโต๊ะ' : 'Tables',
          href: '/tables',
          permission: ['manage_table', 'view_tables'],
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13M19 7v13M8 20h8"/></svg>,
        },
        {
          label: language === 'th' ? 'คลังออเดอร์' : 'Order archive',
          href: '/orders',
          permission: ['view_orders', 'take_order'],
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
        },
        {
          label: language === 'th' ? 'คลังวัตถุดิบ' : 'Inventory',
          href: '/inventory',
          permission: ['manage_inventory', 'view_inventory'],
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
        },
        {
          label: language === 'th' ? 'AI ผู้ช่วย' : 'AI assistant',
          href: '/ai-assistant',
          permission: ['view_reports', 'manage_inventory'],
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 17h4"/></svg>,
        },
        {
          label: language === 'th' ? 'พนักงาน' : 'Staff',
          href: '/staff',
          permission: 'manage_staff',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
        },
      ],
    },
    {
      group: language === 'th' ? 'ต่อยอด' : 'Next modules',
      items: [
        {
          label: language === 'th' ? 'รายได้และยอดขาย' : 'Revenue and sales',
          href: '/reports',
          permission: 'view_reports',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
        },
      ],
    },
    {
      group: '',
      items: [
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
  const { activeMembership } = useAuth();
  const nav = buildNav(language);
  const isActive = (href: string) => {
    if (href === "/pos/tables") return pathname.startsWith("/pos/");
    return pathname === href || pathname.startsWith(href + '/');
  };
  const canSee = (permission?: Permission | Permission[]) => {
    if (!permission) return true;
    const permissions = Array.isArray(permission) ? permission : [permission];
    return permissions.some((item) => can(activeMembership, item));
  };

  return (
    <nav className="sidebar-nav-scroll flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 [@media(max-height:760px)]:space-y-2 [@media(max-height:760px)]:py-2">
      {nav.map(({ group, items }, groupIndex) => (
        <div key={group || `group-${groupIndex}`} className={items.some((item) => canSee(item.permission)) ? '' : 'hidden'}>
          {!collapsed && group && (
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-600 [@media(max-height:760px)]:mb-1 [@media(max-height:760px)]:text-[9px]">{group}</p>
          )}
          <div className="space-y-0.5">
            {items.filter((item) => canSee(item.permission)).map(({ label, href, icon, badge, comingSoon }) => {
              const active = !comingSoon && isActive(href);
              const itemClassName = `relative flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-[13px] font-medium transition-[background-color,border-color,color,box-shadow] [@media(max-height:760px)]:py-1.5 ${
                active
                  ? 'border-gray-200 bg-white text-gray-950 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white'
                  : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white hover:text-gray-950 dark:text-gray-400 dark:hover:border-gray-800 dark:hover:bg-gray-900 dark:hover:text-white'
              } ${collapsed ? 'justify-center' : ''} ${comingSoon ? 'cursor-default opacity-50 hover:bg-transparent hover:text-gray-600 dark:hover:bg-transparent dark:hover:text-gray-400' : ''}`;
              const content = (
                <>
                  {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-orange-500" />}
                  <span className={`grid h-5 w-5 shrink-0 place-items-center ${active ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'}`}>{icon}</span>
                  {!collapsed && (
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">{label}</span>
                      {comingSoon && <span className="shrink-0 text-[10px] font-medium text-gray-400 dark:text-gray-500">{language === 'th' ? 'เร็วๆ นี้' : 'Soon'}</span>}
                    </span>
                  )}
                  {!collapsed && badge && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
                  )}
                  {collapsed && badge && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-500" />}
                </>
              );

              if (comingSoon) {
                return (
                  <span key={href} title={collapsed ? `${label} (${language === 'th' ? 'เร็วๆ นี้' : 'Soon'})` : undefined} className={itemClassName}>
                    {content}
                  </span>
                );
              }

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={itemClassName}
                >
                  {content}
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
  const displayName = user ? (user.nickname?.trim() || `${user.first_name} ${user.last_name === '-' ? '' : user.last_name}`.trim()) : language === 'th' ? 'ผู้ใช้งาน' : 'User';
  const logoutLabel = language === 'th' ? 'ออกจากระบบ' : 'Sign out';

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-gray-200 px-3 py-4 dark:border-gray-800">
        <UserAvatar src={user?.profile_image} name={displayName} size={32} className="h-8 w-8 text-xs text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
        <LanguageCycleButton />
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
    <div className="shrink-0 border-t border-gray-200 px-3 py-3 dark:border-gray-800 [@media(max-height:760px)]:py-2">
      <div className="group flex items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:border-gray-200 hover:bg-white dark:hover:border-gray-800 dark:hover:bg-gray-900">
        <UserAvatar src={user?.profile_image} name={displayName} size={32} className="h-8 w-8 text-xs text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
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

function LanguageCycleButton({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const title = language === 'th' ? 'Switch to English' : 'สลับเป็นภาษาไทย';

  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
      title={title}
      className={`shrink-0 rounded-md p-2 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white ${className}`}
    >
      {language.toUpperCase()}
    </button>
  );
}

function DesktopControls() {
  return (
    <div className="hidden shrink-0 px-3 py-2 lg:block">
      <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-800 dark:bg-gray-900">
        <LanguageToggle className="h-8 border-0 bg-transparent shadow-none dark:bg-transparent" />
        <ThemeToggle className="h-8 w-8 border-0 bg-transparent p-0 text-gray-600 shadow-none hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white" />
      </div>
    </div>
  );
}

function RestaurantHeader({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const restaurantName = activeMembership?.restaurant?.name ?? (language === 'th' ? 'เลือกร้าน' : 'Select restaurant');
  const switchLabel = language === 'th' ? 'เปลี่ยน' : 'Switch';

  if (collapsed) {
    return (
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-gray-200 dark:border-gray-800">
        <Link
          href="/restaurants"
          onClick={onNavigate}
          title={restaurantName}
          className="transition-opacity hover:opacity-90"
        >
          <AppLogo size={36} />
        </Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      <Link
        href="/restaurants"
        onClick={onNavigate}
        className="flex min-w-0 items-center gap-2.5 rounded-md border border-transparent px-1.5 py-1.5 transition-colors hover:border-gray-200 hover:bg-white dark:hover:border-gray-800 dark:hover:bg-gray-900"
      >
        <AppLogo size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-gray-950 dark:text-white">{restaurantName}</span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-orange-600 dark:text-orange-400">{switchLabel}</span>
      </Link>
    </div>
  );
}

export default function Sidebar() {
  const { mobileOpen, setMobileOpen, collapsed, setCollapsed } = useSidebar();
  const { language } = useLanguage();
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileBackdrop = useBackdropClose(() => setMobileOpen(false));
  const collapseTitle = collapsed
    ? language === 'th' ? 'ขยายแถบด้านข้าง' : 'Expand sidebar'
    : language === 'th' ? 'ย่อแถบด้านข้าง' : 'Collapse sidebar';

  useEffect(() => {
    if (mobileOpen) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && mobileDrawerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, [mobileOpen]);

  return (
    <>
      {mobileOpen && (
        <div
          {...mobileBackdrop}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        ref={mobileDrawerRef}
        role="dialog"
        aria-modal={mobileOpen}
        aria-label={language === 'th' ? 'เมนูนำทาง' : 'Navigation menu'}
        inert={!mobileOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMobileOpen(false);
        }}
        className={`
          fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-gray-200 bg-slate-50 shadow-2xl transition-transform duration-300 ease-in-out will-change-transform dark:border-gray-800 dark:bg-gray-950 lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}
        `}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 dark:border-gray-800">
          <RestaurantHeader collapsed={false} onNavigate={() => setMobileOpen(false)} />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label={language === 'th' ? 'ปิดเมนู' : 'Close menu'}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-5 w-5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
        <UserFooter collapsed={false} />
      </aside>

      <aside
        className={`
          fixed left-0 top-0 z-30 hidden h-screen flex-col overflow-hidden border-r border-gray-200 bg-slate-50 transition-[width] duration-200 ease-out will-change-[width] dark:border-gray-800 dark:bg-gray-950 lg:flex
          ${collapsed ? 'w-[68px]' : 'w-[264px]'}
        `}
      >
        <div className={`flex h-14 shrink-0 items-center border-b border-gray-200 px-3 dark:border-gray-800 ${collapsed ? 'justify-center' : 'justify-between gap-2'}`}>
          {!collapsed && <RestaurantHeader collapsed={false} />}
          <div className="flex items-center gap-0.5">
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

        {collapsed && <RestaurantHeader collapsed={true} />}
        <NavLinks collapsed={collapsed} />
        {!collapsed && <DesktopControls />}
        <UserFooter collapsed={collapsed} />
      </aside>
    </>
  );
}
