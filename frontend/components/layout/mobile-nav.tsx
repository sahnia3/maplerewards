"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/contexts/sidebar-context";

/**
 * Mobile nav trigger — a single frosted hamburger button fixed to the top-left,
 * shown only below the lg breakpoint. Tapping it opens the full slide-out
 * sidebar drawer (the same navigation as desktop), which lives in sidebar.tsx
 * and is driven by `isMobileOpen` in the sidebar context. This replaces the old
 * bottom tab bar so mobile and desktop share one navigation surface.
 */
export function MobileNavTrigger() {
  const { isMobileOpen, setMobileOpen } = useSidebar();

  return (
    <button
      type="button"
      aria-label="Open navigation menu"
      aria-expanded={isMobileOpen}
      onClick={() => setMobileOpen(true)}
      className="fixed z-40 flex items-center justify-center lg:hidden"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: 12,
        width: 42,
        height: 42,
        borderRadius: 12,
        color: "var(--text-secondary)",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-dim)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
      }}
    >
      <Menu size={20} strokeWidth={1.9} />
    </button>
  );
}
