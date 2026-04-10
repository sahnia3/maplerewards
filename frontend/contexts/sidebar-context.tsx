"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface SidebarContextValue {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  isMobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setMobileOpen] = useState(false);

  // Persist collapsed state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("maple_sidebar_collapsed");
    if (stored === "true") setIsCollapsed(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("maple_sidebar_collapsed", String(next));
      }
      return next;
    });
  }, []);

  // Close mobile drawer on route change (handled by consumers)
  // Close mobile drawer on escape
  useEffect(() => {
    if (!isMobileOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isMobileOpen]);

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggleSidebar, isMobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
