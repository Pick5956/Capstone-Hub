'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/src/providers/SidebarProvider';

const NAV = [
  {
    group: 'หลัก',
    items: [
      {
        label: 'ภาพรวม', href: '/home',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
      },
      {
        label: 'ออเดอร์', href: '/orders', badge: '3',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
      },
      {
        label: 'โต๊ะ', href: '/tables',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13M19 7v13M8 20h8"/></svg>,
      },
    ],
  },
  {
    group: 'จัดการ',
    items: [
      {
        label: 'เมนูอาหาร', href: '/menu',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>,
      },
      {
        label: 'คลังวัตถุดิบ', href: '/inventory',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
      },
      {
        label: 'พนักงาน', href: '/staff',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
      },
    ],
  },
  {
    group: 'รายงาน',
    items: [
      {
        label: 'รายได้ & ยอดขาย', href: '/reports',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      },
      {
        label: 'ตั้งค่า', href: '/settings',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
      },
    ],
  },
];

// ── shared nav links ──────────────────────────────────────────────────────────
function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
      {NAV.map(({ group, items }) => (
        <div key={group}>
          {!collapsed && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 px-3 mb-1.5">{group}</p>
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
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-100
                    ${active
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}
                    ${collapsed ? 'justify-center' : ''}`}
                >
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-orange-500 to-red-500 rounded-r-full" />}
                  <span className={active ? 'text-orange-500' : ''}>{icon}</span>
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!collapsed && badge && (
                    <span className="text-[10px] font-black bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0">{badge}</span>
                  )}
                  {collapsed && badge && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

// ── store footer ──────────────────────────────────────────────────────────────
function StoreFooter() {
  return (
    <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-orange-50 dark:bg-orange-900/20">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-black shadow shrink-0">R</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">ร้านอาหาร Demo</p>
          <p className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">แผนทดลองใช้</p>
        </div>
      </div>
    </div>
  );
}

// ── main export ───────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { mobileOpen, setMobileOpen, collapsed, setCollapsed } = useSidebar();

  return (
    <>
      {/* ══ MOBILE ══════════════════════════════════════════════════════════ */}

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Drawer — uses CSS transform only (no width change = no reflow) */}
      <aside className={`
        lg:hidden fixed top-0 left-0 z-50 h-screen w-64 flex flex-col
        bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800 shadow-2xl
        transition-transform duration-300 ease-in-out will-change-transform
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile drawer header — brand only, no collapse button */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-black text-sm shadow-md">R</div>
            <span className="font-extrabold text-gray-900 dark:text-white text-sm tracking-tight leading-tight">
              RESTAURANT<br /><span className="text-orange-500">HUB</span>
            </span>
          </div>
          {/* Close button — only an X, no overlap */}
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
        <StoreFooter />
      </aside>

      {/* ══ DESKTOP ═════════════════════════════════════════════════════════ */}
      {/*
        Fixed sidebar — animates width via CSS only.
        will-change: width prevents layout reflow on the rest of the page.
        The main content's margin-left is synced in layout.tsx.
      */}
      <aside className={`
        hidden lg:flex flex-col fixed top-0 left-0 h-screen z-30
        bg-white dark:bg-gray-950
        border-r border-gray-100 dark:border-gray-800
        transition-[width] duration-200 ease-out will-change-[width] overflow-hidden
        ${collapsed ? 'w-[68px]' : 'w-60'}
      `}>
        {/* Desktop header — brand + collapse toggle */}
        <div className={`flex items-center h-14 px-3 border-b border-gray-100 dark:border-gray-800 shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">R</div>
              <span className="font-extrabold text-gray-900 dark:text-white text-sm tracking-tight leading-tight whitespace-nowrap">
                RESTAURANT<br /><span className="text-orange-500">HUB</span>
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors shrink-0"
            title={collapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
          >
            {collapsed
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><polyline points="9 18 15 12 9 6"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
            }
          </button>
        </div>

        <NavLinks collapsed={collapsed} />
        {!collapsed && <StoreFooter />}
      </aside>
    </>
  );
}
