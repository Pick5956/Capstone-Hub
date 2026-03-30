'use client';

import { useSidebar } from '@/src/providers/SidebarProvider';
import { useEffect, useState } from 'react';

export default function ContentWrapper({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div
      className="flex-1 flex flex-col min-w-0"
      style={{
        marginLeft: isDesktop ? (collapsed ? 68 : 240) : 0,
        transition: 'margin-left 200ms ease-out',
      }}
    >
      {children}
    </div>
  );
}
