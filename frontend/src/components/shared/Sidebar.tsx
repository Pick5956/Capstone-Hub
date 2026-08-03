'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/src/providers/SidebarProvider';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLanguage } from '@/src/providers/LanguageProvider';
import AppLogo from '@/src/components/shared/AppLogo';
import { useBackdropClose } from '@/src/hooks/useBackdropClose';
import { can } from '@/src/lib/rbac';
import type { Permission } from '@/src/types/auth';

type SubItem = {
  label: string;
  href: string;
  permission?: Permission | Permission[];
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  comingSoon?: boolean;
  permission?: Permission | Permission[];
  ownerOnly?: boolean;
  subItems?: readonly SubItem[];
};

type NavGroup = {
  id: 'work' | 'management' | 'general';
  items: NavItem[];
};

function buildNav(language: 'th' | 'en'): NavGroup[] {
  return [
    {
      id: 'work',
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
          label: language === 'th' ? 'จอครัว' : 'Kitchen',
          href: '/kitchen',
          permission: 'view_kitchen',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M6 2v20"/><path d="M18 2v20"/><path d="M6 8h12"/><path d="M6 16h12"/><path d="M9 5h6"/><path d="M9 19h6"/></svg>,
        },
      ],
    },
    {
      id: 'management',
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
          label: language === 'th' ? 'ประวัติการจอง' : 'Reservations',
          href: '/reservations',
          permission: ['manage_table', 'view_tables', 'take_order'],
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>,
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
          label: language === 'th' ? 'บันทึกรายจ่าย' : 'Expenses',
          href: '/expenses',
          permission: ['manage_expenses', 'view_reports'],
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 6h18v13H3z"/><path d="M16 11h5v4h-5a2 2 0 010-4z"/><path d="M3 6l13-3v3"/></svg>,
        },
        {
          label: language === 'th' ? 'AI ผู้ช่วย' : 'AI assistant',
          href: '/ai-assistant',
          ownerOnly: true,
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 17h4"/></svg>,
        },
        {
          label: language === 'th' ? 'พนักงาน' : 'Staff',
          href: '/staff',
          permission: 'manage_staff',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
        },
        {
          label: language === 'th' ? 'รายได้และยอดขาย' : 'Revenue and sales',
          href: '/reports',
          permission: 'view_reports',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
        },
      ],
    },
    {
      id: 'general',
      items: [
        {
          label: language === 'th' ? 'ตั้งค่า' : 'Settings',
          href: '/settings',
          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
          subItems: [
            {
              label: language === 'th' ? 'ข้อมูลบัญชี' : 'My Account',
              href: '/settings/account',
            },
            {
              label: language === 'th' ? 'จัดการร้านและภาษี' : 'Restaurant & Taxes',
              href: '/settings/restaurant',
              permission: 'manage_staff',
            },
            {
              label: language === 'th' ? 'ภาษาและการแสดงผล' : 'Display settings',
              href: '/settings/display',
            },
          ] as const,
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

  const [userExpanded, setUserExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (href: string) => {
    const defaultVal = pathname.startsWith(href);
    const currentVal = userExpanded[href] ?? defaultVal;
    setUserExpanded(prev => ({ ...prev, [href]: !currentVal }));
  };

  const isActive = (href: string) => {
    if (href === "/pos/tables") return pathname.startsWith("/pos/");
    return pathname === href || pathname.startsWith(href + '/');
  };
  const canSee = (permission?: Permission | Permission[]) => {
    if (!permission) return true;
    const permissions = Array.isArray(permission) ? permission : [permission];
    return permissions.some((item) => can(activeMembership, item));
  };
  const visibleNav = nav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (!item.ownerOnly || activeMembership?.role?.name === 'owner') && canSee(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <nav className="sidebar-nav-scroll flex-1 overflow-y-auto overscroll-contain px-3 py-3 [@media(max-height:760px)]:py-2">
      {visibleNav.map(({ id, items }, groupIndex) => (
        <div key={id}>
          {groupIndex > 0 && (
            <div
              role="separator"
              aria-orientation="horizontal"
              className="mx-1 my-2 border-t border-[#dfe3e8] dark:border-[#253142] [@media(max-height:760px)]:my-1.5"
            />
          )}
          <div className="space-y-0.5">
            {items.map((item) => {
              const { label, href, icon, badge, comingSoon, subItems } = item;
              const visibleSubItems = subItems ? subItems.filter(sub => canSee(sub.permission)) : [];
              const visibleSubItemsCount = visibleSubItems.length;
              const hasSubItems = visibleSubItemsCount > 0;
              const isExpanded = userExpanded[href] ?? pathname.startsWith(href);

              // Active if either this parent href matches or one of its child sub-items matches
              const active = !comingSoon && (isActive(href) || (hasSubItems && visibleSubItems.some(sub => isActive(sub.href))));

              const itemClassName = `relative flex w-full items-center rounded-md px-2.5 py-2 text-[13px] font-medium transition-[background-color,border-color,box-shadow,color,gap] duration-200 ease-out motion-reduce:transition-none [@media(max-height:760px)]:py-1.5 ${
                active
                  ? 'border border-transparent bg-orange-50 text-orange-700 shadow-[0_0_6px_rgba(15,23,42,0.18)] active:shadow-[0_0_3px_rgba(15,23,42,0.16)] dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200 dark:shadow-[0_0_7px_rgba(249,115,22,0.24)] dark:active:shadow-[0_0_3px_rgba(249,115,22,0.18)]'
                  : 'border border-transparent text-gray-800 hover:border-[#dfe3e8] hover:bg-white hover:text-gray-950 dark:text-gray-200 dark:hover:border-[#253142] dark:hover:bg-gray-900 dark:hover:text-white'
              } ${collapsed ? 'justify-center gap-0' : 'gap-2.5'} ${comingSoon ? 'cursor-default opacity-50 hover:bg-transparent hover:text-gray-600 dark:hover:bg-transparent dark:hover:text-gray-400' : ''}`;

              const content = (
                <>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center ${active ? 'text-orange-700 dark:text-orange-300' : 'text-gray-500 dark:text-gray-400'}`}>{icon}</span>
                  <span
                    className={`flex min-w-0 flex-1 items-center justify-between gap-2 transition-all duration-300 ${
                      collapsed ? 'w-0 opacity-0 pointer-events-none overflow-hidden' : 'w-auto opacity-100'
                    }`}
                  >
                    <span className="truncate">{label}</span>
                    {comingSoon && <span className="shrink-0 text-[10px] font-medium text-gray-400 dark:text-gray-500">{language === 'th' ? 'เร็วๆ นี้' : 'Soon'}</span>}
                    {hasSubItems && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${active ? 'text-orange-600 dark:text-orange-300' : 'text-gray-400'} ${isExpanded ? 'rotate-90' : ''}`}
                      >
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    )}
                  </span>
                  {badge && (
                    <span
                      className={`flex h-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white transition-all duration-300 ${
                        collapsed 
                          ? 'absolute right-1 top-1 h-2 w-2 p-0 text-[0px] overflow-hidden' 
                          : 'min-w-5 px-1.5 text-[10px] font-semibold'
                      }`}
                    >
                      {collapsed ? '' : badge}
                    </span>
                  )}
                </>
              );

              return (
                <div key={href} className="w-full">
                  {hasSubItems && !collapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleExpand(href)}
                      className={itemClassName}
                    >
                      {content}
                    </button>
                  ) : comingSoon ? (
                    <span title={collapsed ? `${label} (${language === 'th' ? 'เร็วๆ นี้' : 'Soon'})` : undefined} className={itemClassName}>
                      {content}
                    </span>
                  ) : (
                    <Link
                      href={href}
                      onClick={onNavigate}
                      title={collapsed ? label : undefined}
                      className={itemClassName}
                    >
                      {content}
                    </Link>
                  )}

                  {/* Collapsible Sub-items */}
                  {hasSubItems && !collapsed && (
                    <div
                      style={{ 
                        maxHeight: isExpanded ? `${visibleSubItemsCount * 36 + 8}px` : '0px',
                        transitionProperty: 'max-height',
                        transitionDuration: '300ms',
                        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                      className={`overflow-hidden will-change-[max-height] ${
                        isExpanded ? '' : 'pointer-events-none'
                      }`}
                    >
                      <div className="relative ml-5 border-l border-gray-200 pl-3 space-y-0.5 dark:border-gray-800 pt-1 pb-1">
                        {visibleSubItems.map(sub => {
                          const subActive = isActive(sub.href);
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={onNavigate}
                              tabIndex={isExpanded ? 0 : -1}
                              className={`flex items-center rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                                subActive
                                  ? 'bg-orange-50/50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400'
                                  : 'text-gray-700 hover:bg-gray-100/50 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-900/50 dark:hover:text-white'
                              }`}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function RestaurantHeader({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const restaurantName = activeMembership?.restaurant?.name ?? (language === 'th' ? 'เลือกร้าน' : 'Select restaurant');
  const switchLabel = language === 'th' ? 'เปลี่ยน' : 'Switch';

  return (
    <div className={`min-w-0 transition-all duration-300 ${collapsed ? 'w-full flex justify-center' : 'flex-1'}`}>
      <Link
        href="/restaurants"
        onClick={onNavigate}
        title={collapsed ? restaurantName : undefined}
        className={`flex min-w-0 items-center rounded-md border border-transparent transition-[background-color,border-color,gap,padding] duration-300 ${
          collapsed 
            ? 'justify-center gap-0 p-1 hover:bg-transparent' 
            : 'gap-2.5 px-1.5 py-1.5 hover:border-[#dfe3e8] hover:bg-white dark:hover:border-[#253142] dark:hover:bg-gray-900'
        }`}
      >
        <AppLogo size={32} />
        <div
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 transition-all duration-300 ${
            collapsed ? 'w-0 opacity-0 pointer-events-none overflow-hidden' : 'w-auto opacity-100'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-gray-950 dark:text-white">{restaurantName}</span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-orange-600 dark:text-orange-400">{switchLabel}</span>
        </div>
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
          fixed left-0 top-0 z-[var(--z-modal)] flex h-screen w-64 flex-col border-r border-[#dfe3e8] bg-slate-50 shadow-2xl transition-transform duration-300 ease-in-out will-change-transform dark:border-[#253142] dark:bg-gray-950 lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}
        `}
      >
        <div className="dashboard-shell-row dashboard-shell-border-b flex shrink-0 items-center justify-between gap-2 px-3">
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
      </aside>

      <aside
        className={`
          dashboard-shell-border-r fixed left-0 top-0 z-30 hidden h-screen flex-col overflow-hidden bg-slate-50 dark:bg-gray-950 lg:flex
          transition-[width] duration-300 ease-in-out will-change-[width]
          ${collapsed ? 'w-[68px]' : 'w-[264px]'}
        `}
      >
        <div className={`dashboard-shell-border-b flex flex-col justify-center shrink-0 transition-[height,padding] duration-300 ease-in-out ${collapsed ? 'h-[112px] px-3' : 'h-[62px] px-3'}`}>
          <div className={`flex items-center transition-all duration-300 ${collapsed ? 'flex-col-reverse gap-3' : 'justify-between gap-2'}`}>
            <RestaurantHeader collapsed={collapsed} />
            <div className="flex items-center">
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
        </div>

        <NavLinks collapsed={collapsed} />
      </aside>
    </>
  );
}
