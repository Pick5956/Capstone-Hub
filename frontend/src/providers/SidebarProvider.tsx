'use client';

import React, { createContext, useContext, useState } from 'react';

interface SidebarCtx {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarCtx>({
  mobileOpen: false,
  setMobileOpen: () => {},
  collapsed: false,
  setCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ mobileOpen, setMobileOpen, collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
